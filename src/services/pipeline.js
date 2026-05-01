import { analyzeText, buildVocabulary, toReading } from './analyzer.js';
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

export async function processScreenshot({ fileBuffer, filename, lesson }) {
  const upload = await saveUpload(fileBuffer, filename);
  const rawText = (await extractText(upload.destinationPath)).trim();

  if (!rawText) {
    throw new Error('No Japanese text was detected in the uploaded screenshot.');
  }

  const analyzedLines = await analyzeText(rawText);
  const vocabulary = await buildVocabulary(analyzedLines);
  const dictionary = await loadDictionary();

  const lineInputs = analyzedLines.map((line) => ({ japanese: line.japanese }));
  const untranslatedVocabulary = vocabulary
    .filter((entry) => !dictionary[entry.japanese])
    .map((entry) => ({ japanese: entry.japanese }));

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

  for (const line of lineInputs) {
    if (!lineTranslations.has(line.japanese)) {
      throw new Error(`The translation model did not return a translation for line: ${line.japanese}`);
    }
  }

  for (const entry of untranslatedVocabulary) {
    if (!vocabularyTranslations.has(entry.japanese)) {
      throw new Error(
        `The translation model did not return a translation for vocabulary item: ${entry.japanese}`
      );
    }
  }

  const vocabularyEntries = vocabulary.map((entry) => {
    const dictionaryOverride = dictionary[entry.japanese];
    const modelEntry = vocabularyTranslations.get(entry.japanese);
    const merged = dictionaryOverride
      ? mergeDictionaryEntry(entry, dictionaryOverride)
      : {
          ...entry,
          english: modelEntry?.english ?? '',
          spanish: modelEntry?.spanish ?? ''
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

      return {
        japanese: line.japanese,
        hiragana: reading.hiragana,
        romaji: reading.romaji,
        spanish: translated?.spanish ?? '',
        english: translated?.english ?? '',
        type: 'sentence',
        lesson
      };
    })
  );

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
    lesson,
    imageUrl: upload.publicPath,
    rawText,
    lines,
    entries: persistedEntries
  };

  await saveScreenshotRecord(result);
  return result;
}
