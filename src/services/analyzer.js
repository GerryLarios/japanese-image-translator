import path from 'node:path';
import kuromoji from 'kuromoji';
import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
import wanakana from 'wanakana';
import { ROOT_DIR } from '../config.js';

const dictPath = path.join(ROOT_DIR, 'node_modules', 'kuromoji', 'dict');

let tokenizerPromise;
let kuroshiroPromise;

function normalizeLineBreaks(text) {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dictPath }).build((error, tokenizer) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(tokenizer);
      });
    });
  }

  return tokenizerPromise;
}

async function getKuroshiro() {
  if (!kuroshiroPromise) {
    kuroshiroPromise = (async () => {
      const instance = new Kuroshiro();
      await instance.init(new KuromojiAnalyzer({ dictPath }));
      return instance;
    })();
  }

  return kuroshiroPromise;
}

function mapPartOfSpeech(partOfSpeech) {
  const mapping = {
    名詞: 'noun',
    動詞: 'verb',
    形容詞: 'adjective',
    副詞: 'adverb',
    助詞: 'particle',
    助動詞: 'auxiliary',
    接続詞: 'conjunction',
    連体詞: 'prenominal',
    感動詞: 'interjection',
    接頭詞: 'prefix',
    記号: 'symbol'
  };

  return mapping[partOfSpeech] ?? 'other';
}

export async function analyzeText(rawText) {
  const tokenizer = await getTokenizer();
  const lines = normalizeLineBreaks(rawText);

  const analyzedLines = await Promise.all(
    lines.map(async (line) => {
      const tokens = tokenizer
        .tokenize(line)
        .filter((token) => token.pos !== '記号' && token.surface_form.trim());

      return {
        japanese: line,
        tokens
      };
    })
  );

  return analyzedLines;
}

export async function toReading(text) {
  const kuroshiro = await getKuroshiro();
  const hiragana = await kuroshiro.convert(text, { to: 'hiragana' });
  const romaji = await kuroshiro.convert(text, { to: 'romaji' });
  return { hiragana, romaji };
}

export async function buildVocabulary(analyzedLines) {
  const seen = new Set();
  const vocabulary = [];

  for (const line of analyzedLines) {
    for (const token of line.tokens) {
      const japanese = token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
      const reading = token.reading ? wanakana.toHiragana(token.reading) : null;
      const key = `${japanese}:${token.pos}`;

      if (!japanese || seen.has(key)) {
        continue;
      }

      seen.add(key);

      const converted = reading
        ? {
            hiragana: reading,
            romaji: wanakana.toRomaji(reading)
          }
        : await toReading(japanese);

      vocabulary.push({
        japanese,
        hiragana: converted.hiragana,
        romaji: converted.romaji,
        type: mapPartOfSpeech(token.pos)
      });
    }
  }

  return vocabulary;
}
