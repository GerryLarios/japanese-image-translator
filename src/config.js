import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
export const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
export const SCREENSHOT_INDEX_FILE = path.join(DATA_DIR, 'screenshots-index.json');
export const LOCAL_DICTIONARY_FILE = path.join(DATA_DIR, 'localDictionary.json');
export const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
