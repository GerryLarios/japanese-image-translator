import { randomUUID } from 'node:crypto';

const jobs = new Map();

function serializeJob(job) {
  return {
    id: job.id,
    name: job.name,
    source: job.source,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    error: job.error,
    result: job.result ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

export function createJob(initialMessage, metadata = {}) {
  const id = `job-${randomUUID()}`;
  const timestamp = new Date().toISOString();
  const job = {
    id,
    name: metadata.name || 'Unnamed request',
    source: metadata.source || 'image',
    status: 'queued',
    progress: 5,
    stage: 'queued',
    message: initialMessage,
    error: null,
    result: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  jobs.set(id, job);
  return serializeJob(job);
}

export function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }

  Object.assign(job, updates, {
    updatedAt: new Date().toISOString()
  });
  return serializeJob(job);
}

export function completeJob(jobId, result) {
  return updateJob(jobId, {
    status: 'completed',
    progress: 100,
    stage: 'done',
    message: `Finished processing ${result.id}.`,
    result
  });
}

export function failJob(jobId, error) {
  return updateJob(jobId, {
    status: 'failed',
    stage: 'failed',
    message: 'Screenshot processing failed.',
    error: error.message
  });
}

export function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? serializeJob(job) : null;
}

export function listJobs({ activeOnly = false } = {}) {
  return [...jobs.values()]
    .filter((job) => !activeOnly || job.status === 'queued' || job.status === 'processing')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((job) => serializeJob(job));
}
