const form = document.getElementById('upload-form');
const statusNode = document.getElementById('status');
const resultNode = document.getElementById('result');
const historyNode = document.getElementById('history');
const progressPanel = document.getElementById('progress-panel');
const progressBar = document.getElementById('progress-bar');
const progressStage = document.getElementById('progress-stage');
const progressPercent = document.getElementById('progress-percent');
const progressMessage = document.getElementById('progress-message');
const submitButton = form.querySelector('button[type="submit"]');
const nukeButton = document.getElementById('nuke-button');

let activeJobId = null;
let pollTimer = null;
let latestResultId = null;

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

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? 'Working...' : 'Process screenshot';
}

function renderResult(payload) {
  if (!payload) {
    latestResultId = null;
    resultNode.innerHTML = '<p class="muted">No screenshot processed yet.</p>';
    return;
  }

  latestResultId = payload.id;

  const lines = payload.lines
    .map(
      (line) => `
        <article class="card">
          <h3>${line.japanese}</h3>
          <p><strong>Hiragana:</strong> ${line.hiragana}</p>
          <p><strong>Romaji:</strong> ${line.romaji}</p>
          <p><strong>English:</strong> ${line.english}</p>
          <p><strong>Spanish:</strong> ${line.spanish}</p>
        </article>
      `
    )
    .join('');

  const entries = payload.entries
    .map(
      (entry) => `
        <tr>
          <td>${entry.id}</td>
          <td>${entry.japanese}</td>
          <td>${entry.hiragana}</td>
          <td>${entry.romaji}</td>
          <td>${entry.english}</td>
          <td>${entry.spanish}</td>
          <td>${entry.type}</td>
        </tr>
      `
    )
    .join('');

  const preview = payload.imageUrl
    ? `<img class="preview" src="${payload.imageUrl}" alt="Uploaded screenshot" />`
    : `<div class="preview preview-text"><strong>No image uploaded</strong><span>Used pasted text directly.</span></div>`;

  resultNode.innerHTML = `
    <div class="result-stack">
      ${preview}
      <div>
        <h3>Extracted text</h3>
        <pre class="ocr">${payload.rawText}</pre>
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
    .map(
      (item) => `
        <article class="history-item">
          <button
            type="button"
            class="history-delete-button"
            data-delete-screenshot="${item.id}"
            aria-label="Remove ${item.name || item.id}"
            title="Remove"
          >
            ×
          </button>
          ${
            item.imageUrl
              ? `<img src="${item.imageUrl}" alt="${item.id}" />`
              : '<div class="history-placeholder">TXT</div>'
          }
          <div class="history-content">
            <h3>${item.name || item.id}</h3>
            <p><strong>ID:</strong> ${item.id}</p>
            <p><strong>Lines:</strong> ${item.linesCount}</p>
            <p><strong>Entries:</strong> ${item.entriesCount}</p>
          </div>
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
  const response = await fetch(`/api/screenshots/${screenshotId}`, {
    method: 'DELETE'
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Could not remove screenshot.');
  }

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
  const response = await fetch('/api/data', {
    method: 'DELETE'
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Could not reset local data.');
  }

  renderResult(null);
  await loadHistory();
  setStatus(
    `Removed ${payload.removedScreenshots} screenshots, ${payload.removedEntries} entries, and ${payload.removedUploads} uploaded files.`
  );
}

async function loadHistory() {
  const response = await fetch('/api/screenshots');
  if (!response.ok) {
    throw new Error('Could not load screenshot history.');
  }

  const payload = await response.json();
  renderHistory(payload.items);
}

async function pollJob(jobId) {
  const response = await fetch(`/api/jobs/${jobId}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Could not read job progress.');
  }

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
    setStatus(`Saved ${payload.result.entries.length} entries from ${payload.result.id}.`);
    form.reset();
    form.elements.lesson.value = '1';
    return;
  }

  if (payload.status === 'failed') {
    activeJobId = null;
    setSubmitting(false);
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  setStatus('');
  setSubmitting(true);
  const pastedText = String(formData.get('pastedText') || '').trim();
  const hasImage = Boolean(formData.get('image')?.name);
  setProgress({
    visible: true,
    percent: 5,
    stage: hasImage ? 'uploading' : 'preparing',
    message: pastedText
      ? 'Sending pasted text to the local server.'
      : 'Uploading screenshot to the local server.'
  });

  const formData = new FormData(form);

  try {
    const response = await fetch('/api/upload/jobs', {
      method: 'POST',
      body: formData
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'The screenshot could not be processed.');
    }

    activeJobId = payload.id;
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

historyNode.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-screenshot]');
  if (!button) {
    return;
  }

  deleteScreenshot(button.dataset.deleteScreenshot).catch((error) => {
    setStatus(error.message, true);
  });
});

nukeButton.addEventListener('click', () => {
  nukeAllData().catch((error) => {
    setStatus(error.message, true);
  });
});

loadHistory().catch((error) => setStatus(error.message, true));
