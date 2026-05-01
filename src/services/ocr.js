import { createWorker } from 'tesseract.js';

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
