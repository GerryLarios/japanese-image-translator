import { readFile } from 'node:fs/promises';
import fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { PORT, PUBLIC_DIR, UPLOADS_DIR } from './config.js';
import { shutdownWorker } from './services/ocr.js';
import { processScreenshot } from './services/pipeline.js';
import { ensureDataFiles, loadEntries, loadScreenshotIndex } from './services/storage.js';

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

app.get('/api/entries', async () => {
  const items = await loadEntries();
  return { items };
});

app.get('/api/entries/export', async (_, reply) => {
  const items = await loadEntries();
  reply.header('Content-Disposition', 'attachment; filename="entries.json"');
  return items;
});

app.post('/api/upload', async (request, reply) => {
  try {
    const file = await request.file();

    if (!file) {
      reply.code(400);
      return { message: 'An image file is required.' };
    }

    const fields = file.fields ?? {};
    const lessonValue = fields.lesson?.value ?? '1';
    const lesson = Number.parseInt(String(lessonValue), 10);

    if (!Number.isInteger(lesson) || lesson < 1) {
      reply.code(400);
      return { message: 'Lesson must be a positive integer.' };
    }

    const fileBuffer = await file.toBuffer();
    const result = await processScreenshot({
      fileBuffer,
      filename: file.filename,
      lesson
    });

    return result;
  } catch (error) {
    request.log.error(error);
    reply.code(500);
    return {
      message: error.message || 'Unexpected error while processing the screenshot.'
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
