import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { OCR_ENGINE, ROOT_DIR } from '../config.js';

const execFileAsync = promisify(execFile);
const appleVisionScript = path.join(ROOT_DIR, 'src', 'bin', 'apple-vision-ocr.swift');

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('jpn');
      await worker.setParameters({
        preserve_interword_spaces: '1'
      });
      return worker;
    })();
  }

  return workerPromise;
}

export async function extractText(imagePath) {
  if (OCR_ENGINE === 'apple-vision') {
    const { stdout } = await execFileAsync('swift', [appleVisionScript, imagePath], {
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout.trim();
  }

  const worker = await getWorker();
  const result = await worker.recognize(imagePath);
  return result.data.text ?? '';
}

export async function shutdownWorker() {
  if (!workerPromise) {
    return;
  }

  const worker = await workerPromise;
  await worker.terminate();
}
