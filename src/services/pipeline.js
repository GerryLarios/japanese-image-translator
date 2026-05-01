import { analyzeText, buildVocabulary, toReading } from './analyzer.js';
import { OLLAMA_MODEL } from '../config.js';
import { extractText } from './ocr.js';
import {
  assignEntryIds,
  loadDictionary,
  nextScreenshotId,
  saveScreenshotRecord,
  saveUpload,
  upsertEntries
} from './storage.js';
import { translateContent } from './translator.js';

function mergeDictionaryEntry(source, override) {
  return {
    ...source,
    ...override,
    japanese: source.japanese,
    type: override?.type ?? source.type
  };
}

function containsJapanese(text) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function reportProgress(onProgress, progress) {
  if (typeof onProgress === 'function') {
    onProgress(progress);
  }
}

export async function processScreenshot({ fileBuffer, filename, lesson, name, rawText: providedText, onProgress }) {
  let upload = null;

  if (fileBuffer) {
    reportProgress(onProgress, {
      percent: 10,
      stage: 'upload',
      message: 'Saving uploaded screenshot.'
    });
    upload = await saveUpload(fileBuffer, filename);
  }

  let rawText = String(providedText ?? '').trim();

  if (rawText) {
    reportProgress(onProgress, {
      percent: 30,
      stage: 'text',
      message: 'Using pasted text instead of OCR.'
    });
  } else {
    if (!upload) {
      throw new Error('An image file or pasted text is required.');
    }

    reportProgress(onProgress, {
      percent: 30,
      stage: 'ocr',
      message: 'Running OCR on the screenshot.'
    });
    rawText = (await extractText(upload.destinationPath)).trim();
  }

  if (!rawText) {
    throw new Error('No Japanese text was detected in the uploaded screenshot.');
  }

  reportProgress(onProgress, {
    percent: 50,
    stage: 'analysis',
    message: 'Analyzing text, readings, and vocabulary.'
  });
  const analyzedLines = await analyzeText(rawText);
  const vocabulary = await buildVocabulary(analyzedLines);
  const dictionary = await loadDictionary();

  const lineInputs = analyzedLines
    .filter((line) => containsJapanese(line.japanese))
    .map((line) => ({ japanese: line.japanese }));
  const untranslatedVocabulary = vocabulary
    .filter((entry) => containsJapanese(entry.japanese) && !dictionary[entry.japanese])
    .map((entry) => ({ japanese: entry.japanese }));

  if (!lineInputs.length && !untranslatedVocabulary.length) {
    throw new Error('OCR finished, but no Japanese text was detected clearly enough to translate.');
  }

  reportProgress(onProgress, {
    percent: 70,
    stage: 'translation',
    message: `Translating lines and vocabulary with ${OLLAMA_MODEL}.`
  });
  const translations = await translateContent({
    lines: lineInputs,
    vocabulary: untranslatedVocabulary
  });

  const vocabularyTranslations = new Map(
    (translations.vocabulary ?? []).map((entry) => [entry.japanese, entry])
  );
  const lineTranslations = new Map(
    (translations.lines ?? []).map((entry) => [entry.japanese, entry])
  );

  const vocabularyEntries = vocabulary.map((entry) => {
    const dictionaryOverride = dictionary[entry.japanese];
    const modelEntry = vocabularyTranslations.get(entry.japanese);
    const merged = dictionaryOverride
      ? mergeDictionaryEntry(entry, dictionaryOverride)
      : {
          ...entry,
          english: modelEntry?.english ?? entry.japanese,
          spanish: modelEntry?.spanish ?? entry.japanese
        };

    return {
      ...merged,
      lesson
    };
  });

  const sentenceEntries = await Promise.all(
    analyzedLines.map(async (line) => {
      const translated = lineTranslations.get(line.japanese);
      const reading = await toReading(line.japanese);
      const fallbackTranslation = {
        english: line.japanese,
        spanish: line.japanese
      };

      return {
        japanese: line.japanese,
        hiragana: reading.hiragana,
        romaji: reading.romaji,
        spanish: translated?.spanish ?? fallbackTranslation.spanish,
        english: translated?.english ?? fallbackTranslation.english,
        type: 'sentence',
        lesson
      };
    })
  );

  reportProgress(onProgress, {
    percent: 90,
    stage: 'saving',
    message: 'Saving screenshot results and study entries.'
  });
  const entriesWithIds = await assignEntryIds([...vocabularyEntries, ...sentenceEntries]);
  const persistedEntries = await upsertEntries(entriesWithIds);

  const lines = sentenceEntries.map((line) => ({
    japanese: line.japanese,
    hiragana: line.hiragana,
    romaji: line.romaji,
    spanish: line.spanish,
    english: line.english
  }));

  const screenshotId = await nextScreenshotId();
  const result = {
    id: screenshotId,
    name,
    lesson,
    imageUrl: upload?.publicPath ?? null,
    source: providedText ? 'pasted-text' : 'image',
    rawText,
    lines,
    entries: persistedEntries
  };

  await saveScreenshotRecord(result);
  reportProgress(onProgress, {
    percent: 100,
    stage: 'done',
    message: `Finished processing ${result.id}.`
  });
  return result;
}
