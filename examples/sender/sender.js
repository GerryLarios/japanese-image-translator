require('dotenv').config();

const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || 'C:\\Path\\To\\Screenshots';
const SERVER_URL = process.env.SERVER_URL || 'http://192.168.1.50:3000/api/upload';
const LESSON = process.env.LESSON || '1';
const API_KEY = (process.env.API_KEY || '').trim();

const watcher = chokidar.watch(SCREENSHOT_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 1500,
    pollInterval: 100
  }
});

async function sendFile(filePath) {
  const form = new FormData();
  form.append('lesson', LESSON);
  form.append('image', fs.createReadStream(filePath));

  const response = await axios.post(SERVER_URL, form, {
    headers: {
      ...form.getHeaders(),
      ...(API_KEY ? { 'x-api-key': API_KEY } : {})
    },
    maxBodyLength: Infinity
  });

  console.log(
    `[sent] ${path.basename(filePath)} -> ${response.data.id} (${response.data.entries.length} entries)`
  );
}

watcher.on('add', async (filePath) => {
  try {
    await sendFile(filePath);
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error(`[failed] ${path.basename(filePath)} -> ${message}`);
  }
});

watcher.on('ready', () => {
  console.log(`Watching ${SCREENSHOT_DIR}`);
  console.log(`Sending new screenshots to ${SERVER_URL}`);
});
