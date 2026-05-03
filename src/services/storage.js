import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

function normalizeLessonIdPart(lesson) {
  const normalized = String(lesson)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'DEFAULT';
}

function buildLineFromSentenceEntry(entry) {
  return {
    japanese: entry.japanese,
    hiragana: entry.hiragana,
    romaji: entry.romaji,
    english: entry.english,
    spanish: entry.spanish
  };
}

function buildLinesFromEntries(entries) {
  return (entries ?? [])
    .filter((entry) => entry.type === 'sentence')
    .map((entry) => buildLineFromSentenceEntry(entry));
}

function nextEntryId(prefix, lesson, entries) {
  const lessonPrefix = `${prefix}${normalizeLessonIdPart(lesson)}-`;
  const maxIndex = entries.reduce((highest, entry) => {
    if (!entry.id.startsWith(lessonPrefix)) {
      return highest;
    }

    const current = Number.parseInt(entry.id.slice(entry.id.lastIndexOf('-') + 1), 10);
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

export async function listScreenshotHistory() {
  const index = await loadScreenshotIndex();

  return Promise.all(
    index.map(async (item) => {
      const record = await loadScreenshotRecord(item.id);

      if (!record) {
        return {
          ...item,
          rawText: '',
          lines: [],
          entries: [],
          source: item.imageUrl ? 'image' : 'pasted-text'
        };
      }

      return {
        ...item,
        lesson: record.lesson ?? item.lesson,
        imageUrl: record.imageUrl ?? item.imageUrl ?? null,
        linesCount: record.lines?.length ?? item.linesCount ?? 0,
        entriesCount: record.entries?.length ?? item.entriesCount ?? 0,
        rawText: record.rawText ?? '',
        lines: record.lines ?? [],
        entries: record.entries ?? [],
        source: record.source ?? (record.imageUrl ? 'image' : 'pasted-text')
      };
    })
  );
}

export async function loadScreenshotRecord(screenshotId) {
  const detailPath = path.join(SCREENSHOTS_DIR, `${screenshotId}.json`);
  return readJson(detailPath, null);
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
    name: record.name,
    lesson: record.lesson,
    imageUrl: record.imageUrl,
    linesCount: record.lines.length,
    entriesCount: record.entries.length
  });

  await writeJson(SCREENSHOT_INDEX_FILE, index);
}

export async function updateEntryRecord(entryId, nextValues) {
  const normalizedEntryId = String(entryId ?? '').trim();
  if (!normalizedEntryId) {
    return null;
  }

  const currentEntries = await loadEntries();
  const entryIndex = currentEntries.findIndex((entry) => entry.id === normalizedEntryId);
  if (entryIndex < 0) {
    return null;
  }

  const updatedEntry = {
    ...currentEntries[entryIndex],
    ...nextValues,
    id: currentEntries[entryIndex].id,
    lesson: currentEntries[entryIndex].lesson
  };

  const nextEntries = [...currentEntries];
  nextEntries[entryIndex] = updatedEntry;

  const index = await loadScreenshotIndex();
  const updatedIndex = [];
  const affectedScreenshots = [];

  for (const item of index) {
    const record = await loadScreenshotRecord(item.id);
    const existingEntries = record?.entries ?? [];
    const matchesEntry = existingEntries.some((entry) => entry.id === normalizedEntryId);

    if (!record || !matchesEntry) {
      updatedIndex.push(item);
      continue;
    }

    const recordEntries = existingEntries.map((entry) =>
      entry.id === normalizedEntryId
        ? {
            ...entry,
            ...nextValues,
            id: entry.id,
            lesson: entry.lesson
          }
        : entry
    );
    const nextLines = buildLinesFromEntries(recordEntries);
    const detailPath = path.join(SCREENSHOTS_DIR, `${item.id}.json`);

    await writeJson(detailPath, {
      ...record,
      entries: recordEntries,
      lines: nextLines
    });

    updatedIndex.push({
      ...item,
      linesCount: nextLines.length,
      entriesCount: recordEntries.length
    });
    affectedScreenshots.push(item.id);
  }

  await saveEntries(nextEntries);
  await writeJson(SCREENSHOT_INDEX_FILE, updatedIndex);

  return {
    entry: updatedEntry,
    updatedScreenshots: affectedScreenshots.length,
    affectedScreenshots
  };
}

export async function deleteEntryRecords(entryIds) {
  const uniqueEntryIds = [...new Set(entryIds.map((entryId) => String(entryId).trim()).filter(Boolean))];
  if (!uniqueEntryIds.length) {
    return {
      removedEntryIds: [],
      removedEntries: 0,
      removedFrom: 0,
      affectedScreenshots: []
    };
  }

  const currentEntries = await loadEntries();
  const entryIdSet = new Set(uniqueEntryIds);
  const removedEntryIds = currentEntries
    .filter((entry) => entryIdSet.has(entry.id))
    .map((entry) => entry.id);

  if (!removedEntryIds.length) {
    return null;
  }

  const remainingEntries = currentEntries.filter((entry) => !entryIdSet.has(entry.id));
  const index = await loadScreenshotIndex();
  const updatedIndex = [];
  const affectedScreenshots = [];

  for (const item of index) {
    const record = await loadScreenshotRecord(item.id);
    const existingEntries = record?.entries ?? [];
    const nextEntries = existingEntries.filter((entry) => !entryIdSet.has(entry.id));

    if (!record || nextEntries.length === existingEntries.length) {
      updatedIndex.push(item);
      continue;
    }

    const nextLines = buildLinesFromEntries(nextEntries);

    const detailPath = path.join(SCREENSHOTS_DIR, `${item.id}.json`);
    await writeJson(detailPath, {
      ...record,
      lines: nextLines,
      entries: nextEntries
    });

    updatedIndex.push({
      ...item,
      linesCount: nextLines.length,
      entriesCount: nextEntries.length
    });
    affectedScreenshots.push(item.id);
  }

  await saveEntries(remainingEntries);
  await writeJson(SCREENSHOT_INDEX_FILE, updatedIndex);

  return {
    removedEntryIds,
    removedEntries: removedEntryIds.length,
    removedFrom: affectedScreenshots.length,
    affectedScreenshots
  };
}

export async function deleteEntryRecord(entryId) {
  const deleted = await deleteEntryRecords([entryId]);
  if (!deleted) {
    return null;
  }

  return {
    id: entryId,
    removedFrom: deleted.removedFrom,
    affectedScreenshots: deleted.affectedScreenshots
  };
}

export async function deleteScreenshotRecord(screenshotId) {
  const record = await loadScreenshotRecord(screenshotId);

  if (!record) {
    return null;
  }

  const index = await loadScreenshotIndex();
  const remainingIndex = index.filter((item) => item.id !== screenshotId);
  const currentEntries = await loadEntries();
  const entryIdsToRemove = new Set((record.entries ?? []).map((entry) => entry.id));
  const remainingEntries = currentEntries.filter((entry) => !entryIdsToRemove.has(entry.id));
  const detailPath = path.join(SCREENSHOTS_DIR, `${screenshotId}.json`);
  const uploadFilename = path.basename(record.imageUrl ?? '');
  const uploadPath = uploadFilename ? path.join(UPLOADS_DIR, uploadFilename) : null;

  await saveEntries(remainingEntries);
  await writeJson(SCREENSHOT_INDEX_FILE, remainingIndex);
  await rm(detailPath, { force: true });

  if (uploadPath) {
    await rm(uploadPath, { force: true });
  }

  return {
    id: screenshotId,
    removedEntries: entryIdsToRemove.size
  };
}

export async function clearGeneratedData() {
  const [entries, screenshots] = await Promise.all([loadEntries(), loadScreenshotIndex()]);
  const [uploadFiles, screenshotFiles] = await Promise.all([
    readdir(UPLOADS_DIR).catch(() => []),
    readdir(SCREENSHOTS_DIR).catch(() => [])
  ]);

  await Promise.all(
    uploadFiles
      .filter((file) => file !== '.gitkeep')
      .map((file) => rm(path.join(UPLOADS_DIR, file), { force: true }))
  );

  await Promise.all(
    screenshotFiles
      .filter((file) => file !== '.gitkeep')
      .map((file) => rm(path.join(SCREENSHOTS_DIR, file), { force: true }))
  );

  await saveEntries([]);
  await writeJson(SCREENSHOT_INDEX_FILE, []);

  return {
    removedEntries: entries.length,
    removedScreenshots: screenshots.length,
    removedUploads: uploadFiles.filter((file) => file !== '.gitkeep').length
  };
}
