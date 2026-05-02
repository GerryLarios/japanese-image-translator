import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { API_KEY, PORT, PUBLIC_DIR, UPLOADS_DIR } from './config.js';
import { completeJob, createJob, failJob, getJob, listJobs, updateJob } from './services/jobs.js';
import { shutdownWorker } from './services/ocr.js';
import { processScreenshot } from './services/pipeline.js';
import {
  clearGeneratedData,
  deleteScreenshotRecord,
  ensureDataFiles,
  listScreenshotHistory,
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

function getRequestApiKey(request) {
  const xApiKey = request.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    return xApiKey.trim();
  }

  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string') {
    return '';
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return '';
  }

  return token.trim();
}

function apiKeyMatches(providedKey) {
  if (!API_KEY) {
    return true;
  }

  const expected = Buffer.from(API_KEY);
  const provided = Buffer.from(providedKey);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

app.addHook('onRequest', async (request, reply) => {
  const pathname = request.url.split('?')[0];
  if (!API_KEY || pathname === '/api/health' || !pathname.startsWith('/api/')) {
    return;
  }

  if (apiKeyMatches(getRequestApiKey(request))) {
    return;
  }

  reply.code(401);
  return reply.send({
    message: 'Invalid or missing API key.'
  });
});

app.get('/', async (_, reply) => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  reply.type('text/html').send(html);
});

app.get('/api/health', async () => ({
  ok: true,
  apiKeyRequired: Boolean(API_KEY)
}));

app.get('/api/screenshots', async () => {
  const items = await listScreenshotHistory();
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

app.get('/api/jobs', async () => ({
  items: listJobs({ activeOnly: true })
}));

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

  const lesson = String(fields.lesson ?? '1').trim();

  if (!lesson) {
    throw new Error('Lesson is required.');
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

function getUploadSource(upload) {
  return upload.fileBuffer ? 'image' : 'text';
}

function createProcessingJob(upload) {
  return createJob('Uploading screenshot and preparing OCR.', {
    name: upload.name,
    source: getUploadSource(upload)
  });
}

function updateProcessingJob(jobId) {
  return ({ percent, stage, message }) => {
    updateJob(jobId, {
      status: 'processing',
      progress: percent,
      stage,
      message
    });
  };
}

app.post('/api/upload', async (request, reply) => {
  let job = null;

  try {
    const upload = await parseUploadRequest(request);
    job = createProcessingJob(upload);
    const result = await processScreenshot({
      ...upload,
      onProgress: updateProcessingJob(job.id)
    });
    completeJob(job.id, result);
    return result;
  } catch (error) {
    request.log.error(error);
    if (job) {
      failJob(job.id, error);
    }
    reply.code(
      error.message === 'An image file or pasted text is required.' ||
        error.message === 'Lesson is required.'
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
    const job = createProcessingJob(upload);

    void processScreenshot({
      ...upload,
      onProgress: updateProcessingJob(job.id)
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
        error.message === 'Lesson is required.'
        ? 400
        : 500
    );
    return {
      message: error.message || 'Unexpected error while starting screenshot processing.'
    };
  }
});

function getLanUrls(port) {
  const interfaces = networkInterfaces();
  const lanAddresses = new Set();

  for (const entries of Object.values(interfaces)) {
    for (const address of entries ?? []) {
      if (address.internal || address.family !== 'IPv4') {
        continue;
      }

      lanAddresses.add(address.address);
    }
  }

  return [...lanAddresses]
    .sort((left, right) => left.localeCompare(right))
    .map((address) => `http://${address}:${port}`);
}

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

for (const lanUrl of getLanUrls(PORT)) {
  app.log.info(`japanse-image-translator reachable on your LAN at ${lanUrl}`);
}

if (API_KEY) {
  app.log.info('API key protection is enabled for /api routes.');
}
