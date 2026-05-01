import { randomUUID } from 'node:crypto';

const jobs = new Map();

function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    message: job.message,
    error: job.error,
    result: job.result ?? null
  };
}

export function createJob(initialMessage) {
  const id = `job-${randomUUID()}`;
  const job = {
    id,
    status: 'queued',
    progress: 5,
    stage: 'queued',
    message: initialMessage,
    error: null,
    result: null
  };

  jobs.set(id, job);
  return serializeJob(job);
}

export function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }

  Object.assign(job, updates);
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
