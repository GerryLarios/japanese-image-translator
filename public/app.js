const form = document.getElementById('upload-form');
const statusNode = document.getElementById('status');
const resultNode = document.getElementById('result');
const historyNode = document.getElementById('history');

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle('error', isError);
}

function renderResult(payload) {
  if (!payload) {
    resultNode.innerHTML = '<p class="muted">No screenshot processed yet.</p>';
    return;
  }

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

  resultNode.innerHTML = `
    <div class="result-stack">
      <img class="preview" src="${payload.imageUrl}" alt="Uploaded screenshot" />
      <div>
        <h3>OCR text</h3>
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
          <img src="${item.imageUrl}" alt="${item.id}" />
          <div>
            <h3>${item.id}</h3>
            <p><strong>Lesson:</strong> ${item.lesson}</p>
            <p><strong>Lines:</strong> ${item.linesCount}</p>
            <p><strong>Entries:</strong> ${item.entriesCount}</p>
          </div>
        </article>
      `
    )
    .join('');
}

async function loadHistory() {
  const response = await fetch('/api/screenshots');
  if (!response.ok) {
    throw new Error('Could not load screenshot history.');
  }

  const payload = await response.json();
  renderHistory(payload.items);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Processing screenshot...');

  const formData = new FormData(form);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'The screenshot could not be processed.');
    }

    renderResult(payload);
    await loadHistory();
    setStatus(`Saved ${payload.entries.length} entries from ${payload.id}.`);
    form.reset();
    form.elements.lesson.value = '1';
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadHistory().catch((error) => setStatus(error.message, true));
