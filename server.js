import NodeMediaServer from 'node-media-server';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { configDotenv } from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { updateThumbnail, uploadRecordedStream } from './util.js'; 
configDotenv(); 


const activeRecordings = new Map();
const viewerMap = new Map();

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

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" }
});


io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('viewer-joined', ({ streamKey }) => {
    if (!viewerMap.has(streamKey)) viewerMap.set(streamKey, new Set());
    viewerMap.get(streamKey).add(socket.id);
    emitViewerCount(streamKey);
    // console.log(`Viewer joined: ${socket.id} for streamKey: ${streamKey}`);
  });

  socket.on('viewer-left', ({ streamKey }) => {
    viewerMap.get(streamKey)?.delete(socket.id);
    emitViewerCount(streamKey);
    // console.log(`Viewer left: ${socket.id} for streamKey: ${streamKey}`);
  });

  socket.on('disconnect', () => {
    for (const [streamKey, viewers] of viewerMap.entries()) {
      if (viewers.delete(socket.id)) {
        emitViewerCount(streamKey);
        // console.log(`Socket disconnected: ${socket.id} from streamKey: ${streamKey}`);
      }
    }
  });

  function emitViewerCount(streamKey) {
    const count = viewerMap.get(streamKey)?.size || 0;
    io.emit('viewer-count', { streamKey, count });
    // console.log(`Viewer count for ${streamKey}: ${count}`);
  }
});


httpServer.listen(PORT, () => {
  console.log(`Express + Socket.IO server running on http://localhost:${PORT}`);
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

// authentication logic
// nms.on('prePublish', (id, streamPath, args) => {
//   const streamKey = streamPath.split('/')[2]; // e.g. 'live/streamKey123'

//   // Replace this with your real stream key validation logic
//   const validStreamKeys = ['indalsingh', 'streamKey123', 'myUser1']; // Ideally this should come from a database

//   console.log(`[prePublish] Stream key received: ${streamKey}`);

//   if (!validStreamKeys.includes(streamKey)) {
//     console.log(`[prePublish] Rejected stream with invalid stream key: ${streamKey}`);
//     const session = nms.getSession(id);
//     if (session) {
//       session.reject(); // Reject unauthorized stream
//     }
//   } else {
//     console.log(`[prePublish] Accepted stream key: ${streamKey}`);
//   }
// });



nms.on('postPublish', (id, streamPath, args) => {
  console.log(`[postPublish] Stream started: ${streamPath}`);
  const streamKey = streamPath.split('/')[2]; // e.g. indal

   // Take a snapshot after a few seconds
  const snapshotsDir = path.join(__dirname, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  const snapshotFilename = path.join(snapshotsDir, `${streamKey}.jpg`);
  const ffmpegSnapshot = spawn('ffmpeg', [
    '-y', // Overwrite output files
    '-i', `rtmp://${process.env.RTMP_HOST || 'localhost'}${streamPath}`,
    '-ss', '5', // Take snapshot at 5 seconds
    '-vframes', '1', // Capture only one frame
    snapshotFilename
  ]);

  ffmpegSnapshot.on('close', (code) => {
    if (code === 0) {
      console.log(`Snapshot saved: ${snapshotFilename}`);
      // You can add logic here to upload the snapshot to a server if needed
      updateThumbnail(snapshotFilename, streamKey)
    } else {
      console.error(`Failed to take snapshot for stream: ${streamKey}`);
    }
  });


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

  // ffmpeg.stderr.on('data', data => console.log(data.toString())); // capture ffmpeg logs
  ffmpeg.on('close', code => {
    console.log(`Recording ended: ${filename}`);
    activeRecordings.delete(streamKey);
    uploadRecordedStream(filename, streamKey)
      .then(() => {
        console.log(`File uploaded and deleted successfully: ${filename}`);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  });
});


nms.on('donePublish', (id, streamPath, args) => {
  console.log(`[donePublish] Stream ended: ${streamPath}`);
  const streamKey = streamPath.split('/')[2]; // Extract stream key
  const streamDir = path.join(__dirname, 'media', 'live', streamKey);

  console.log(`Stream ended for: ${streamKey}`);

  // Kill ffmpeg process if still active
  const ffmpeg = activeRecordings.get(streamKey);
  if (ffmpeg) {
    ffmpeg.kill('SIGINT');
    activeRecordings.delete(streamKey);
  }

  // Delete the stream directory if it exists
  fs.rm(streamDir, { recursive: true, force: true }, (err) => {
    if (err) {
      console.error(`Failed to delete stream folder: ${streamDir}`, err);
    } else {
      console.log(`Deleted stream folder: ${streamDir}`);
    }
  });
});



nms.run();

// ffmpeg -re -i video.mp4 -c:v copy -c:a aac -f flv rtmp://localhost/live/stream