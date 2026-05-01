# japanse-image-translator

Local Node.js app to receive Japanese game screenshots, extract text with OCR, translate the content to English and Spanish with a local Ollama-compatible model, and persist vocabulary and sentence entries as JSON.

## What it does

- Accepts screenshot uploads from a browser or any HTTP client
- Runs local Japanese OCR with Tesseract.js
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

## API

### Upload a screenshot

```bash
curl -X POST http://localhost:3000/api/upload \
  -F lesson=1 \
  -F image=@/path/to/screenshot.png
```

### Export all entries

```bash
curl http://localhost:3000/api/entries/export
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

- `data/entries.json`: all saved vocabulary and sentence entries
- `data/screenshots/*.json`: per-screenshot processing results
- `data/uploads/*`: uploaded images
- `data/localDictionary.json`: local overrides for preferred translations

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
