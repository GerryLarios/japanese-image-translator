import { readFile } from 'node:fs/promises';
import fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { PORT, PUBLIC_DIR, UPLOADS_DIR } from './config.js';
import { completeJob, createJob, failJob, getJob, updateJob } from './services/jobs.js';
import { shutdownWorker } from './services/ocr.js';
import { processScreenshot } from './services/pipeline.js';
import {
  clearGeneratedData,
  deleteScreenshotRecord,
  ensureDataFiles,
  loadEntries,
  loadScreenshotIndex
} from './services/storage.js';

const app = fastify({
  logger: true
});

await ensureDataFiles();

await app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

await app.register(fastifyStatic, {
  root: PUBLIC_DIR,
  prefix: '/'
});

await app.register(fastifyStatic, {
  root: UPLOADS_DIR,
  prefix: '/uploads/',
  decorateReply: false
});

app.get('/', async (_, reply) => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  reply.type('text/html').send(html);
});

app.get('/api/health', async () => ({
  ok: true
}));

app.get('/api/screenshots', async () => {
  const items = await loadScreenshotIndex();
  return { items };
});

app.delete('/api/screenshots/:screenshotId', async (request, reply) => {
  const deleted = await deleteScreenshotRecord(request.params.screenshotId);

  if (!deleted) {
    reply.code(404);
    return { message: 'Screenshot not found.' };
  }

  return deleted;
});

app.delete('/api/data', async () => {
  return clearGeneratedData();
});

app.get('/api/jobs/:jobId', async (request, reply) => {
  const job = getJob(request.params.jobId);

  if (!job) {
    reply.code(404);
    return { message: 'Job not found.' };
  }

  return job;
});

app.get('/api/entries', async () => {
  const items = await loadEntries();
  return { items };
});

app.get('/api/entries/export', async (_, reply) => {
  const items = await loadEntries();
  reply.header('Content-Disposition', 'attachment; filename="entries.json"');
  return items;
});

async function parseUploadRequest(request) {
  const fields = {};
  let fileBuffer = null;
  let filename = '';

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname === 'image' && part.filename) {
        fileBuffer = await part.toBuffer();
        filename = part.filename;
      } else {
        await part.toBuffer();
      }
      continue;
    }

    fields[part.fieldname] = String(part.value ?? '');
  }

  const lessonValue = fields.lesson ?? '1';
  const lesson = Number.parseInt(String(lessonValue), 10);

  if (!Number.isInteger(lesson) || lesson < 1) {
    throw new Error('Lesson must be a positive integer.');
  }

  const nameValue = String(fields.name ?? '').trim();
  const pastedText = String(fields.pastedText ?? '').trim();

  if (!fileBuffer && !pastedText) {
    throw new Error('An image file or pasted text is required.');
  }

  return {
    fileBuffer,
    filename,
    lesson,
    name: nameValue || filename || 'Pasted text',
    rawText: pastedText
  };
}

app.post('/api/upload', async (request, reply) => {
  try {
    const upload = await parseUploadRequest(request);
    return await processScreenshot(upload);
  } catch (error) {
    request.log.error(error);
    reply.code(
      error.message === 'An image file or pasted text is required.' ||
        error.message === 'Lesson must be a positive integer.'
        ? 400
        : 500
    );
    return {
      message: error.message || 'Unexpected error while processing the screenshot.'
    };
  }
});

app.post('/api/upload/jobs', async (request, reply) => {
  try {
    const upload = await parseUploadRequest(request);
    const job = createJob('Uploading screenshot and preparing OCR.');

    void processScreenshot({
      ...upload,
      onProgress: ({ percent, stage, message }) => {
        updateJob(job.id, {
          status: 'processing',
          progress: percent,
          stage,
          message
        });
      }
    })
      .then((result) => {
        completeJob(job.id, result);
      })
      .catch((error) => {
        request.log.error(error);
        failJob(job.id, error);
      });

    reply.code(202);
    return job;
  } catch (error) {
    request.log.error(error);
    reply.code(
      error.message === 'An image file or pasted text is required.' ||
        error.message === 'Lesson must be a positive integer.'
        ? 400
        : 500
    );
    return {
      message: error.message || 'Unexpected error while starting screenshot processing.'
    };
  }
});

const closeApp = async () => {
  await shutdownWorker();
  await app.close();
};

process.on('SIGINT', async () => {
  await closeApp();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeApp();
  process.exit(0);
});

await app.listen({
  port: PORT,
  host: '0.0.0.0'
});

app.log.info(`japanse-image-translator running at http://localhost:${PORT}`);
