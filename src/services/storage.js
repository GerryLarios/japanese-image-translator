import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ENTRIES_FILE,
  LOCAL_DICTIONARY_FILE,
  SCREENSHOT_INDEX_FILE,
  SCREENSHOTS_DIR,
  UPLOADS_DIR
} from '../config.js';

async function readJson(filePath, fallbackValue) {
  try {
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    throw error;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nextEntryId(prefix, lesson, entries) {
  const lessonPrefix = `${prefix}${String(lesson).padStart(2, '0')}-`;
  const maxIndex = entries.reduce((highest, entry) => {
    if (!entry.id.startsWith(lessonPrefix)) {
      return highest;
    }

    const current = Number.parseInt(entry.id.split('-')[1], 10);
    return Number.isNaN(current) ? highest : Math.max(highest, current);
  }, 0);

  return `${lessonPrefix}${String(maxIndex + 1).padStart(3, '0')}`;
}

export async function ensureDataFiles() {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  const defaults = [
    [ENTRIES_FILE, []],
    [SCREENSHOT_INDEX_FILE, []],
    [LOCAL_DICTIONARY_FILE, {}]
  ];

  await Promise.all(
    defaults.map(async ([filePath, defaultValue]) => {
      const existing = await readJson(filePath, null);
      if (existing === null) {
        await writeJson(filePath, defaultValue);
      }
    })
  );
}

export async function saveUpload(buffer, filename) {
  const safeExtension = path.extname(filename || '.png') || '.png';
  const storedName = `${Date.now()}-${randomUUID()}${safeExtension}`;
  const destinationPath = path.join(UPLOADS_DIR, storedName);
  await writeFile(destinationPath, buffer);

  return {
    storedName,
    destinationPath,
    publicPath: `/uploads/${storedName}`
  };
}

export async function loadEntries() {
  return readJson(ENTRIES_FILE, []);
}

export async function saveEntries(entries) {
  await writeJson(ENTRIES_FILE, entries);
}

export async function loadDictionary() {
  return readJson(LOCAL_DICTIONARY_FILE, {});
}

export async function loadScreenshotIndex() {
  return readJson(SCREENSHOT_INDEX_FILE, []);
}

export async function nextScreenshotId() {
  const index = await loadScreenshotIndex();
  const maxIndex = index.reduce((highest, item) => {
    const current = Number.parseInt(String(item.id).replace('shot-', ''), 10);
    return Number.isNaN(current) ? highest : Math.max(highest, current);
  }, 0);
  return `shot-${String(maxIndex + 1).padStart(4, '0')}`;
}

export async function upsertEntries(newEntries) {
  const currentEntries = await loadEntries();
  const merged = [...currentEntries];
  const resolvedEntries = [];

  for (const entry of newEntries) {
    const index = merged.findIndex(
      (item) =>
        item.lesson === entry.lesson &&
        item.type === entry.type &&
        item.japanese === entry.japanese
    );

    if (index >= 0) {
      merged[index] = { ...merged[index], ...entry, id: merged[index].id };
      resolvedEntries.push(merged[index]);
      continue;
    }

    merged.push(entry);
    resolvedEntries.push(entry);
  }

  await saveEntries(merged);
  return resolvedEntries;
}

export async function assignEntryIds(entries) {
  const currentEntries = await loadEntries();
  const stagedEntries = [...currentEntries];

  return entries.map((entry) => {
    const prefix = entry.type === 'sentence' ? 'S' : 'L';
    const id = nextEntryId(prefix, entry.lesson, stagedEntries);
    const withId = { ...entry, id };
    stagedEntries.push(withId);
    return withId;
  });
}

export async function saveScreenshotRecord(record) {
  const index = await loadScreenshotIndex();
  const detailPath = path.join(SCREENSHOTS_DIR, `${record.id}.json`);

  await writeJson(detailPath, record);
  index.unshift({
    id: record.id,
    lesson: record.lesson,
    imageUrl: record.imageUrl,
    linesCount: record.lines.length,
    entriesCount: record.entries.length
  });

  await writeJson(SCREENSHOT_INDEX_FILE, index);
}
