# japanse-image-translator

Local Node.js app to receive Japanese game screenshots, extract text with OCR, translate the content to English and Spanish with a local Ollama-compatible model, and persist vocabulary and sentence entries as JSON.

## What it does

- Accepts screenshot uploads from a browser or any HTTP client
- Accepts pasted Japanese text copied from macOS Live Text or another OCR source
- Runs local Japanese OCR with Apple Vision on macOS and Tesseract elsewhere
- Tokenizes text into vocabulary entries with hiragana and romaji
- Translates sentences and vocabulary with a local open model
- Saves reusable entries in the requested JSON shape
- Shows the latest processed screenshots in a small local web UI

## Requirements

- Node.js 20+
- A local Ollama server or compatible endpoint
- A downloaded model, for example:

```bash
ollama pull qwen2.5:7b
```

Recommended models for this app:

- `qwen2.5:7b` - best default for your MacBook Air M4 with 16 GB RAM
- `qwen2.5:3b` - faster, lower quality
- `aya-expanse:8b` - worth trying if you want a multilingual-focused option

## Install

```bash
npm install
cp .env.example .env
ollama serve
```

## Run

```bash
npm start
```

Open `http://localhost:3000`.

You can either upload a screenshot or paste Japanese text directly into the form. If both are provided, the pasted text is used and the uploaded image is kept only as a visual reference.

## UI workflow

- Add a **Name** to label the screenshot or pasted text job
- Upload a screenshot, paste Japanese text, or do both
- Watch the progress bar for OCR, analysis, translation, and saving stages
- Remove one result with the `×` button in **Recent screenshots**
- Use **Nuke all** to clear all generated screenshots, uploads, and entries from local storage

## API

### Upload a screenshot

```bash
curl -X POST http://localhost:3000/api/upload \
  -F name="Persona 5 menu" \
  -F lesson=1 \
  -F image=@/path/to/screenshot.png
```

### Upload pasted text

```bash
curl -X POST http://localhost:3000/api/upload \
  -F name="Live Text capture" \
  -F lesson=1 \
  -F pastedText="一寸法師"
```

### Start an async job

```bash
curl -X POST http://localhost:3000/api/upload/jobs \
  -F name="Live Text capture" \
  -F lesson=1 \
  -F pastedText="一寸法師"
```

### Poll job progress

```bash
curl http://localhost:3000/api/jobs/<job-id>
```

### Export all entries

```bash
curl http://localhost:3000/api/entries/export
```

### Delete one saved screenshot

```bash
curl -X DELETE http://localhost:3000/api/screenshots/shot-0001
```

### Clear all generated local data

```bash
curl -X DELETE http://localhost:3000/api/data
```

## ROG Ally sender example

The repository includes a Windows sender example in `examples/rog-ally-sender`. It watches a screenshot folder on your ROG Ally and posts each new image to the app running on your Mac.

### Install the sender on the ROG Ally

```bash
cd examples/rog-ally-sender
npm install
```

### Configure it

Copy `.env.example` and update:

- `SCREENSHOT_DIR`: the Windows folder where your screenshots are saved
- `SERVER_URL`: your Mac's local IP, for example `http://192.168.1.50:3000/api/upload`
- `LESSON`: the lesson number to attach to uploaded entries

Example PowerShell session:

```powershell
cd examples\rog-ally-sender
Copy-Item .env.example .env
$env:SCREENSHOT_DIR="C:\Users\YourName\Pictures\Screenshots"
$env:SERVER_URL="http://192.168.1.50:3000/api/upload"
$env:LESSON="1"
npm start
```

When a new screenshot appears in that folder, the sender uploads it automatically.

## Data files

- `data/entries.json`: runtime-generated vocabulary and sentence entries
- `data/screenshots/*.json`: runtime-generated per-screenshot processing results
- `data/uploads/*`: runtime-generated uploaded images
- `data/localDictionary.json`: local overrides for preferred translations

Generated files in `data/entries.json`, `data/screenshots-index.json`, `data/screenshots/*`, and `data/uploads/*` are local runtime data and should not be committed.

If you commit this project, the expected tracked data file is `data/localDictionary.json`. The other data files are local state only.

## Dictionary overrides

Add or adjust entries in `data/localDictionary.json` to force preferred translations. Each key should be the Japanese source text:

```json
{
  "大学": {
    "english": "University",
    "spanish": "Universidad",
    "type": "noun"
  }
}
```

The app uses the dictionary first and only asks the model for missing terms.
