import { OLLAMA_BASE_URL, OLLAMA_MODEL } from '../config.js';

function extractJsonBlock(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('The translation model did not return valid JSON.');
    }

    return JSON.parse(match[0]);
  }
}

async function callModel({ system, prompt }) {
  let response;

  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        system,
        options: {
          temperature: 0.1,
          top_p: 0.9
        },
        prompt
      })
    });
  } catch (error) {
    throw new Error(
      `Could not reach the local model endpoint at ${OLLAMA_BASE_URL}. Start Ollama and make sure model "${OLLAMA_MODEL}" is available.`
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Model request failed: ${message}`);
  }

  const payload = await response.json();
  if (!payload.response) {
    throw new Error('The translation model returned an empty response.');
  }

  return payload.response;
}

export async function translateContent({ lines, vocabulary }) {
  const system = `
You are a translation engine for OCR-extracted Japanese video game text.

Your job is to translate Japanese into English and Spanish consistently and return strict JSON only.

Behavior rules:
- Treat the input as game UI, menus, dialogue, quests, battle text, item names, and system text.
- Preserve the exact "japanese" value as provided.
- Preserve array order.
- Do not add or remove objects.
- Do not add notes, uncertainty markers, or extra fields.
- If OCR text is awkward, translate conservatively and stay close to the visible text.
- Do not invent story context that is not present in the text.
- Keep translations concise and natural for game text.
- Keep proper names, place names, and fantasy terms consistent rather than over-translating them.
- For vocabulary entries, produce short dictionary-style glosses, not full sentences.
- Prefer neutral English and neutral Latin American Spanish.
  `.trim();

  const prompt = `
Translate every Japanese line to natural game-text English and Spanish.
Translate every vocabulary term to a concise dictionary-style English and Spanish gloss suitable for flashcards.

Requirements:
- Keep the original Japanese exactly as provided.
- Preserve the array order.
- Use short dictionary meanings for vocabulary.
- Do not invent extra fields.
- If a line is a fragment, menu label, command, or item text, translate it as a fragment instead of forcing a sentence.
- For English, prefer concise UI wording.
- For Spanish, prefer concise neutral wording.
- When text looks like a title, item, skill, location, or menu command, do not pad it with articles unnecessarily.

Return this shape:
{
  "lines": [
    {
      "japanese": "string",
      "english": "string",
      "spanish": "string"
    }
  ],
  "vocabulary": [
    {
      "japanese": "string",
      "english": "string",
      "spanish": "string"
    }
  ]
}

Input lines:
${JSON.stringify(lines, null, 2)}

Input vocabulary:
${JSON.stringify(vocabulary, null, 2)}
  `.trim();

  const response = await callModel({ system, prompt });
  return extractJsonBlock(response);
}
