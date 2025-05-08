import NodeMediaServer from 'node-media-server';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { configDotenv } from 'dotenv';
configDotenv(); 


// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.HTTP_PORT || 3006; // Port for Express server

app.use(express.static(path.join(__dirname, 'public')));
// Set up the Express server
app.get('/', (req, res) => {
  res.send('Hello from Express server!');
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/publisher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'publisher.html'));
});

app.listen(PORT, () => {
  console.log(`Express server is running on http://localhost:${PORT}`);
});

const config = {
  rtmp: {
    port: process.env.RTMP_SERVER_PORT || 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: process.env.RTMP_HTTP_PORT || 8002,
    mediaroot: './media',
    allow_origin: '*',
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg', // Path to ffmpeg executable
    tasks: [
      {
        app: 'live',
        vc: 'copy',
        vcParam: [],
        ac: 'aac',
        acParam: ['-ab', '128k', '-ac', '2', '-ar', '44100'],
        rtmp: true,
        rtmpApp: 'live2',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      },
    ],
  },
};

const nms = new NodeMediaServer(config);

// nms.on('prePublish', (id, StreamPath, args) => {
//   console.log('[prePublish]', id, StreamPath, args);
// });
// nms.on('postPublish', (id, StreamPath, args) => {
//   console.log('[postPublish]', id, StreamPath, args);
// });
// nms.on('donePublish', (id, StreamPath, args) => {
//   console.log('[donePublish]', id, StreamPath, args);
// });
// nms.on('postPlay', (id, StreamPath, args) => {
//   console.log('[postPlay]', id, StreamPath, args);
// });
// nms.on('donePlay', (id, StreamPath, args) => {
//   console.log('[donePlay]', id, StreamPath, args);
// });

const activeRecordings = new Map();

nms.on('postPublish', (id, streamPath, args) => {
  const streamKey = streamPath.split('/')[2]; // e.g. indal

  // Avoid duplicate recording for the same stream key
  if (activeRecordings.has(streamKey)) {
    console.log(`Recording already active for: ${streamKey}`);
    return;
  }

  const recordingsDir = path.join(__dirname, 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  const filename = path.join(recordingsDir, `${streamKey}_${Date.now()}.mp4`);
  const ffmpeg = spawn('ffmpeg', [
    '-i', `rtmp://${process.env.RTMP_HOST || 'localhost'}${streamPath}`,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-strict', 'experimental',
    filename
  ]);

  console.log(`Recording started: ${filename}`);
  activeRecordings.set(streamKey, ffmpeg);

  ffmpeg.stderr.on('data', data => console.log(data.toString()));
  ffmpeg.on('close', code => {
    console.log(`Recording ended: ${filename}`);
    activeRecordings.delete(streamKey);
  });
});

nms.run();

// ffmpeg -re -i video.mp4 -c:v copy -c:a aac -f flv rtmp://localhost/live/stream