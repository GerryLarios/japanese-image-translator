# japanse-image-translator

Local Node.js app to receive Japanese game screenshots, extract text with OCR, translate the content to English and Spanish with a local Ollama-compatible model, and persist vocabulary and sentence entries as JSON.

## What it does

- Accepts screenshot uploads or pasted clipboard images from a browser, or file uploads from any HTTP client
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

If you want only devices with the shared key to use the API, set this in `.env`:

```bash
API_KEY=replace-this-with-a-long-random-secret
```

## Run

```bash
npm start
```

Or use the shell alias:

```bash
start-jp-receiver
```

If you have not loaded it in your current terminal yet:

```bash
source ~/.zshrc
```

Open `http://localhost:3000` on the same Mac.

If another device on your local network needs to reach the receiver running on this Mac, use the Mac's LAN address instead, for example `http://192.168.1.50:3000`.

On startup, the server prints a readable summary with the `localhost` URL, any detected LAN URLs, and whether API-key protection is enabled.

You can upload a screenshot, paste an image into the form, or paste Japanese text directly. If both image and text are provided, the pasted text is used and the image is kept only as a visual reference.

If `API_KEY` is configured, the browser UI will ask for it once per device and store it locally in that browser.

## UI workflow

- Add a **Name** to label the screenshot or pasted text job
- Upload a screenshot, paste Japanese text, or do both
- Watch the progress bar for OCR, analysis, translation, and saving stages
- Edit saved entry values inline in the table when you want to fix readings or translations
- Remove one result with the `×` button in **Recent screenshots**
- Use **Nuke all** to clear all generated screenshots, uploads, and entries from local storage

## API

If `API_KEY` is set, every `/api/*` request must include `x-api-key: <your-api-key>`.

`lesson` is a free-form label, so it can be `1`, `genki-1`, `chapter-a`, or any other non-empty value.

Example header:

```bash
-H "x-api-key: your-shared-key"
```

### Upload a screenshot

```bash
curl -X POST http://localhost:3000/api/upload \
  -F name="Persona 5 menu" \
  -F lesson="genki-1" \
  -F image=@/path/to/screenshot.png
```

If the sender is running on another device, replace `localhost` with this Mac's LAN address, for example `http://192.168.1.50:3000/api/upload`.

### Batch upload every screenshot in a folder

```bash
find "/Users/gerry/Desktop/screenshots" -type f \( \
  -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \
\) -print0 | while IFS= read -r -d '' file; do
  echo "Processing: $(basename "$file")"
  curl -sS -X POST http://localhost:3000/api/upload \
    -F "lesson=genki-1" \
    -F "name=$(basename "$file")" \
    -F "image=@$file"
  echo
done
```

This sends screenshots one by one through the same OCR and Ollama pipeline used by the web UI.

If you run that command from another device, change `http://localhost:3000` to this Mac's LAN address.

### Upload pasted text

```bash
curl -X POST http://localhost:3000/api/upload \
  -F name="Live Text capture" \
  -F lesson="genki-1" \
  -F pastedText="一寸法師"
```

### Start an async job

```bash
curl -X POST http://localhost:3000/api/upload/jobs \
  -F name="Live Text capture" \
  -F lesson="genki-1" \
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

## Sender example

The repository includes a sender example in `examples/sender`. It watches a screenshot folder on any computer and posts each new image to the app running on your Mac.

### Install the sender

```bash
cd examples/sender
npm install
```

### Configure it

Copy `.env.example` and update:

- `SCREENSHOT_DIR`: the Windows folder where your screenshots are saved
- `SERVER_URL`: your Mac's local IP, for example `http://192.168.1.50:3000/api/upload`
- `LESSON`: the lesson label to attach to uploaded entries
- `API_KEY`: the same shared key configured on the Mac when API key protection is enabled

Example PowerShell session:

```powershell
cd examples\sender
Copy-Item .env.example .env
$env:SCREENSHOT_DIR="C:\Users\YourName\Pictures\Screenshots"
$env:SERVER_URL="http://192.168.1.50:3000/api/upload"
$env:LESSON="1"
$env:API_KEY="your-shared-key"
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
