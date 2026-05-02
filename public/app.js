const form = document.getElementById('upload-form');
const statusNode = document.getElementById('status');
const resultNode = document.getElementById('result');
const historyNode = document.getElementById('history');
const progressPanel = document.getElementById('progress-panel');
const progressBar = document.getElementById('progress-bar');
const progressStage = document.getElementById('progress-stage');
const progressPercent = document.getElementById('progress-percent');
const progressMessage = document.getElementById('progress-message');
const authForm = document.getElementById('auth-form');
const apiKeyInput = document.getElementById('api-key-input');
const submitButton = form.querySelector('button[type="submit"]');
const nukeButton = document.getElementById('nuke-button');
const imageInput = form.elements.image;
const pastedTextInput = form.elements.pastedText;
const exportLink = document.getElementById('export-link');
const jobsPanel = document.getElementById('jobs-panel');
const jobsList = document.getElementById('jobs-list');
const jobsSummary = document.getElementById('jobs-summary');
const imageLightbox = document.getElementById('image-lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxTitle = document.getElementById('lightbox-title');
const lightboxCloseButton = document.getElementById('lightbox-close');

const API_KEY_STORAGE_KEY = 'jp-translator-api-key';
const HISTORY_LINES_PREVIEW_LIMIT = 4;
const HISTORY_ENTRIES_PREVIEW_LIMIT = 6;
const JOBS_POLL_INTERVAL_MS = 1500;

let activeJobId = null;
let pollTimer = null;
let jobsPollTimer = null;
let latestResultId = null;
let clipboardImage = null;
let apiKeyRequired = false;
let apiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
let activeJobsSignature = '';

apiKeyInput.value = apiKey;

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character] ?? character
      )
  );
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
}

function setProgress({ visible, percent = 0, stage = '', message = '', isError = false }) {
  progressPanel.classList.toggle('hidden', !visible);
  progressPanel.classList.toggle('error-state', isError);
  progressBar.style.width = `${percent}%`;
  progressStage.textContent = stage;
  progressPercent.textContent = `${percent}%`;
  progressMessage.textContent = message;
  progressPanel.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(percent));
}

function updateSubmitButtonLabel() {
  if (submitButton.disabled) {
    submitButton.textContent = 'Working...';
    return;
  }

  const hasImage = Boolean(imageInput.files?.length || clipboardImage);
  const hasText = Boolean(String(pastedTextInput.value || '').trim());

  if (hasImage && hasText) {
    submitButton.textContent = 'Process screenshot + text';
    return;
  }

  if (hasText) {
    submitButton.textContent = 'Translate text';
    return;
  }

  if (hasImage) {
    submitButton.textContent = 'Process screenshot';
    return;
  }

  submitButton.textContent = 'Process screenshot or text';
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  updateSubmitButtonLabel();
}

function setApiKey(nextApiKey) {
  apiKey = nextApiKey.trim();
  apiKeyInput.value = apiKey;

  if (apiKey) {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    return;
  }

  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
}

function createApiHeaders(headers = {}) {
  const nextHeaders = new Headers(headers);
  if (apiKey) {
    nextHeaders.set('x-api-key', apiKey);
  }

  return nextHeaders;
}

async function apiFetch(resource, options = {}) {
  const { headers, ...rest } = options;
  return fetch(resource, {
    ...rest,
    headers: createApiHeaders(headers)
  });
}

async function readErrorMessage(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload.message || payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function getImageExtension(mimeType) {
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  if (mimeType === 'image/gif') {
    return 'gif';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
}

function createClipboardImageFile(file) {
  if (file.name) {
    return file;
  }

  const extension = getImageExtension(file.type);
  return new File([file], `clipboard-${Date.now()}.${extension}`, {
    type: file.type || 'image/png',
    lastModified: Date.now()
  });
}

function formatSourceLabel(source) {
  return source === 'pasted-text' || source === 'text' ? 'Text request' : 'Screenshot';
}

function openImageLightbox(imageUrl, imageName) {
  if (!imageUrl) {
    return;
  }

  lightboxImage.src = imageUrl;
  lightboxImage.alt = imageName ? `Expanded preview for ${imageName}` : 'Expanded screenshot preview';
  lightboxTitle.textContent = imageName || 'Screenshot preview';
  imageLightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeImageLightbox() {
  imageLightbox.classList.add('hidden');
  lightboxImage.removeAttribute('src');
  lightboxImage.alt = 'Expanded screenshot preview';
  lightboxTitle.textContent = 'Screenshot preview';
  document.body.style.overflow = '';
}

function renderResult(payload) {
  if (!payload) {
    latestResultId = null;
    resultNode.innerHTML = '<p class="muted">No screenshot processed yet.</p>';
    return;
  }

  latestResultId = payload.id;

  const lines = (payload.lines ?? [])
    .map(
      (line) => `
        <article class="card">
          <h3>${escapeHtml(line.japanese)}</h3>
          <p><strong>Hiragana:</strong> ${escapeHtml(line.hiragana)}</p>
          <p><strong>Romaji:</strong> ${escapeHtml(line.romaji)}</p>
          <p><strong>English:</strong> ${escapeHtml(line.english)}</p>
          <p><strong>Spanish:</strong> ${escapeHtml(line.spanish)}</p>
        </article>
      `
    )
    .join('');

  const entries = (payload.entries ?? [])
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.id)}</td>
          <td>${escapeHtml(entry.japanese)}</td>
          <td>${escapeHtml(entry.hiragana)}</td>
          <td>${escapeHtml(entry.romaji)}</td>
          <td>${escapeHtml(entry.english)}</td>
          <td>${escapeHtml(entry.spanish)}</td>
          <td>${escapeHtml(entry.type)}</td>
        </tr>
      `
    )
    .join('');

  const preview = payload.imageUrl
    ? `<img class="preview" src="${escapeHtml(payload.imageUrl)}" alt="${escapeHtml(payload.name || payload.id)}" />`
    : `<div class="preview preview-text"><strong>No image uploaded</strong><span>Used plain text directly.</span></div>`;

  resultNode.innerHTML = `
    <div class="result-stack">
      ${preview}
      <div>
        <h3>Extracted text</h3>
        <pre class="ocr">${escapeHtml(payload.rawText)}</pre>
      </div>
      <div>
        <h3>Translated lines</h3>
        <div class="cards">${lines || '<p class="muted">No lines detected.</p>'}</div>
      </div>
      <div>
        <h3>Saved entries</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Japanese</th>
                <th>Hiragana</th>
                <th>Romaji</th>
                <th>English</th>
                <th>Spanish</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>${entries || '<tr><td colspan="7">No entries generated.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderHistory(items) {
  if (!items.length) {
    historyNode.innerHTML = '<p class="muted">Nothing here yet.</p>';
    return;
  }

  historyNode.innerHTML = items
    .map((item) => {
      const previewLines = (item.lines ?? []).slice(0, HISTORY_LINES_PREVIEW_LIMIT);
      const previewEntries = (item.entries ?? []).slice(0, HISTORY_ENTRIES_PREVIEW_LIMIT);
      const imageMarkup = item.imageUrl
        ? `
          <div>
            <button
              type="button"
              class="history-image-button"
              data-zoom-image="${escapeHtml(item.imageUrl)}"
              data-zoom-name="${escapeHtml(item.name || item.id)}"
              aria-label="Open larger preview for ${escapeHtml(item.name || item.id)}"
              title="Click to zoom"
            >
              <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name || item.id)}" />
            </button>
            <span class="history-image-hint muted">Click to zoom</span>
          </div>
        `
        : '<div class="history-placeholder">TXT</div>';
      const rawTextPreview = String(item.rawText ?? '').trim();
      const truncatedRawText =
        rawTextPreview.length > 220 ? `${rawTextPreview.slice(0, 220).trimEnd()}...` : rawTextPreview;

      return `
        <article class="history-item">
          <button
            type="button"
            class="history-delete-button"
            data-delete-screenshot="${escapeHtml(item.id)}"
            aria-label="Remove ${escapeHtml(item.name || item.id)}"
            title="Remove"
          >
            ×
          </button>
          ${imageMarkup}
          <div class="history-content">
            <h3>${escapeHtml(item.name || item.id)}</h3>
            <div class="history-meta">
              <span>${escapeHtml(item.id)}</span>
              <span>Lesson: ${escapeHtml(item.lesson || '1')}</span>
              <span>${escapeHtml(formatSourceLabel(item.source))}</span>
              <span>${escapeHtml(String(item.linesCount ?? item.lines?.length ?? 0))} lines</span>
              <span>${escapeHtml(String(item.entriesCount ?? item.entries?.length ?? 0))} entries</span>
            </div>

            <div class="history-sections">
              <section class="history-section">
                <h4>Lines</h4>
                ${
                  previewLines.length
                    ? `
                      <div class="history-lines">
                        ${previewLines
                          .map(
                            (line) => `
                              <article class="history-line">
                                <p><strong>${escapeHtml(line.japanese)}</strong></p>
                                <p>${escapeHtml(line.hiragana)} · ${escapeHtml(line.romaji)}</p>
                                <p class="history-line-translation">${escapeHtml(line.english)} / ${escapeHtml(line.spanish)}</p>
                              </article>
                            `
                          )
                          .join('')}
                        ${
                          (item.lines?.length ?? 0) > previewLines.length
                            ? `<p class="muted">+${escapeHtml(String(item.lines.length - previewLines.length))} more line(s)</p>`
                            : ''
                        }
                      </div>
                    `
                    : '<p class="muted">No translated lines saved.</p>'
                }
              </section>

              <section class="history-section">
                <h4>Entries</h4>
                ${
                  previewEntries.length
                    ? `
                      <div class="history-entries">
                        ${previewEntries
                          .map(
                            (entry) => `
                              <article class="history-entry">
                                <div class="history-entry-grid">
                                  <span>ID</span><strong>${escapeHtml(entry.id)}</strong>
                                  <span>Japanese</span><strong>${escapeHtml(entry.japanese)}</strong>
                                  <span>English</span><strong>${escapeHtml(entry.english)}</strong>
                                  <span>Spanish</span><strong>${escapeHtml(entry.spanish)}</strong>
                                  <span>Type</span><strong>${escapeHtml(entry.type)}</strong>
                                </div>
                              </article>
                            `
                          )
                          .join('')}
                        ${
                          (item.entries?.length ?? 0) > previewEntries.length
                            ? `<p class="muted">+${escapeHtml(String(item.entries.length - previewEntries.length))} more entr${item.entries.length - previewEntries.length === 1 ? 'y' : 'ies'}</p>`
                            : ''
                        }
                      </div>
                    `
                    : '<p class="muted">No entries saved.</p>'
                }
              </section>

              ${
                truncatedRawText
                  ? `
                    <section class="history-section">
                      <h4>Raw text</h4>
                      <p class="history-raw-text">${escapeHtml(truncatedRawText)}</p>
                    </section>
                  `
                  : ''
              }
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderJobs(items) {
  jobsPanel.classList.toggle('hidden', !items.length);

  if (!items.length) {
    jobsSummary.textContent = 'No active jobs.';
    jobsList.innerHTML = '';
    return;
  }

  jobsSummary.textContent = `${items.length} active request${items.length === 1 ? '' : 's'}`;
  jobsList.innerHTML = items
    .map(
      (job) => `
        <article class="job-item">
          <div class="job-header">
            <div>
              <h3>${escapeHtml(job.name || job.id)}</h3>
              <div class="job-meta">
                <span>${escapeHtml(formatSourceLabel(job.source))}</span>
                <span>${escapeHtml(job.stage)}</span>
              </div>
            </div>
            <strong>${escapeHtml(String(job.progress ?? 0))}%</strong>
          </div>
          <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(String(job.progress ?? 0))}">
            <div class="progress-bar" style="width: ${escapeHtml(String(job.progress ?? 0))}%"></div>
          </div>
          <p class="job-progress">${escapeHtml(job.message || 'Processing request.')}</p>
        </article>
      `
    )
    .join('');
}

async function deleteScreenshot(screenshotId) {
  const confirmed = window.confirm(`Remove screenshot ${screenshotId} and its saved entries?`);
  if (!confirmed) {
    return;
  }

  setStatus('');
  const response = await apiFetch(`/api/screenshots/${screenshotId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not remove screenshot.'));
  }

  const payload = await response.json();

  if (latestResultId === payload.id) {
    renderResult(null);
  }

  await loadHistory();
  setStatus(`Removed ${payload.id} and ${payload.removedEntries} saved entries.`);
}

async function nukeAllData() {
  const confirmed = window.confirm('Remove every saved screenshot and generated entry?');
  if (!confirmed) {
    return;
  }

  setStatus('');
  const response = await apiFetch('/api/data', {
    method: 'DELETE'
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not reset local data.'));
  }

  const payload = await response.json();

  renderResult(null);
  await loadHistory();
  setStatus(
    `Removed ${payload.removedScreenshots} screenshots, ${payload.removedEntries} entries, and ${payload.removedUploads} uploaded files.`
  );
}

async function loadHistory() {
  const response = await apiFetch('/api/screenshots');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not load screenshot history.'));
  }

  const payload = await response.json();
  renderHistory(payload.items);
}

async function loadJobs() {
  const response = await apiFetch('/api/jobs');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not read processing jobs.'));
  }

  const payload = await response.json();
  const nextSignature = payload.items
    .map((item) => item.id)
    .sort((left, right) => left.localeCompare(right))
    .join('|');

  renderJobs(payload.items);

  if (activeJobsSignature && activeJobsSignature !== nextSignature) {
    await loadHistory();
  }

  activeJobsSignature = nextSignature;
}

function stopJobsPolling() {
  if (jobsPollTimer) {
    window.clearTimeout(jobsPollTimer);
    jobsPollTimer = null;
  }
}

function startJobsPolling() {
  stopJobsPolling();

  const tick = () => {
    loadJobs()
      .catch((error) => {
        setStatus(error.message, true);
      })
      .finally(() => {
        jobsPollTimer = window.setTimeout(tick, JOBS_POLL_INTERVAL_MS);
      });
  };

  tick();
}

async function pollJob(jobId) {
  const response = await apiFetch(`/api/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not read job progress.'));
  }

  const payload = await response.json();

  setProgress({
    visible: true,
    percent: payload.progress,
    stage: payload.stage,
    message: payload.message,
    isError: payload.status === 'failed'
  });

  if (payload.status === 'completed') {
    activeJobId = null;
    setSubmitting(false);
    renderResult(payload.result);
    await loadHistory();
    await loadJobs();
    setStatus(`Saved ${payload.result.entries.length} entries from ${payload.result.id}.`);
    clipboardImage = null;
    form.reset();
    form.elements.lesson.value = '1';
    updateSubmitButtonLabel();
    return;
  }

  if (payload.status === 'failed') {
    activeJobId = null;
    setSubmitting(false);
    await loadJobs();
    setStatus(payload.error || 'The screenshot could not be processed.', true);
    return;
  }

  pollTimer = window.setTimeout(() => {
    pollJob(jobId).catch((error) => {
      activeJobId = null;
      setSubmitting(false);
      setProgress({
        visible: true,
        percent: 100,
        stage: 'failed',
        message: error.message,
        isError: true
      });
      setStatus(error.message, true);
    });
  }, 1200);
}

async function exportEntries() {
  const response = await apiFetch('/api/entries/export');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Could not export entries.'));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = objectUrl;
  downloadLink.download = 'entries.json';
  downloadLink.click();
  URL.revokeObjectURL(objectUrl);
}

async function loadHealth() {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error('Could not load server status.');
  }

  const payload = await response.json();
  apiKeyRequired = Boolean(payload.apiKeyRequired);
  authForm.classList.toggle('hidden', !apiKeyRequired);
}

async function initializeApp() {
  await loadHealth();

  if (apiKeyRequired && !apiKey) {
    setStatus('Enter the API key for this device to use the receiver.', true);
    return;
  }

  await loadHistory();
  startJobsPolling();
}

form.addEventListener('paste', (event) => {
  const clipboardItems = [...(event.clipboardData?.items ?? [])];
  const imageItem = clipboardItems.find((item) => item.type.startsWith('image/'));

  if (!imageItem) {
    return;
  }

  const imageFile = imageItem.getAsFile();
  if (!imageFile) {
    return;
  }

  event.preventDefault();
  clipboardImage = createClipboardImageFile(imageFile);
  imageInput.value = '';
  updateSubmitButtonLabel();
  setStatus(`Clipboard image ready: ${clipboardImage.name}`);
});

imageInput.addEventListener('change', () => {
  if (imageInput.files?.length) {
    clipboardImage = null;
  }

  updateSubmitButtonLabel();
});

pastedTextInput.addEventListener('input', () => {
  updateSubmitButtonLabel();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  setStatus('');
  setSubmitting(true);
  const formData = new FormData(form);
  const uploadedImage = formData.get('image');
  const imageFile = uploadedImage instanceof File && uploadedImage.name ? uploadedImage : clipboardImage;
  if (imageFile && (!uploadedImage || !(uploadedImage instanceof File) || !uploadedImage.name)) {
    formData.set('image', imageFile, imageFile.name);
  }

  const pastedText = String(formData.get('pastedText') || '').trim();
  const hasImage = Boolean(imageFile?.name);
  setProgress({
    visible: true,
    percent: 5,
    stage: hasImage ? 'uploading' : 'preparing',
    message: pastedText
      ? 'Sending text and image data to the receiver.'
      : 'Uploading screenshot to the receiver.'
  });

  try {
    const response = await apiFetch('/api/upload/jobs', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'The screenshot could not be processed.'));
    }

    const payload = await response.json();

    activeJobId = payload.id;
    await loadJobs();
    await pollJob(payload.id);
  } catch (error) {
    activeJobId = null;
    setSubmitting(false);
    setProgress({
      visible: true,
      percent: 100,
      stage: 'failed',
      message: error.message,
      isError: true
    });
    setStatus(error.message, true);
  }
});

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  setApiKey(apiKeyInput.value);
  stopJobsPolling();

  if (apiKeyRequired && !apiKey) {
    setStatus('API key is required for this receiver.', true);
    return;
  }

  setStatus('');
  Promise.all([loadHistory(), loadJobs()])
    .then(() => {
      startJobsPolling();
      setStatus('API key saved for this browser.');
    })
    .catch((error) => {
      setStatus(error.message, true);
    });
});

historyNode.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-screenshot]');
  if (!button) {
    const zoomButton = event.target.closest('[data-zoom-image]');
    if (!zoomButton) {
      return;
    }

    openImageLightbox(zoomButton.dataset.zoomImage, zoomButton.dataset.zoomName);
    return;
  }

  deleteScreenshot(button.dataset.deleteScreenshot).catch((error) => {
    setStatus(error.message, true);
  });
});

lightboxCloseButton.addEventListener('click', closeImageLightbox);

imageLightbox.addEventListener('click', (event) => {
  if (event.target === imageLightbox) {
    closeImageLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !imageLightbox.classList.contains('hidden')) {
    closeImageLightbox();
  }
});

nukeButton.addEventListener('click', () => {
  nukeAllData().catch((error) => {
    setStatus(error.message, true);
  });
});

exportLink.addEventListener('click', (event) => {
  event.preventDefault();
  exportEntries().catch((error) => {
    setStatus(error.message, true);
  });
});

updateSubmitButtonLabel();
initializeApp().catch((error) => setStatus(error.message, true));
