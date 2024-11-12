const NodeMediaServer = require('node-media-server');
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3004; // Port for Express server

app.use(express.static(path.join(__dirname,'public')));
// Set up the Express server
app.get('/', (req, res) => {
  res.send('Hello from Express server!');
});

app.get('/player',(req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
})

app.get('/publisher',(req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'publisher.html'));
})


app.listen(PORT, () => {
  console.log(`Express server is running on http://localhost:${PORT}`);
});

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: './media',
    allow_origin: '*'
  },
  trans: {
    ffmpeg: '/usr/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        vc: "copy",
        vcParam: [],
        ac: "aac",
        acParam: ['-ab', '128k', '-ac', '2', '-ar', '44100'],
        rtmp: true,
        rtmpApp: 'live2',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]',
        record: true, // Enable recording
        recordFile: './recordings', // Directory to save recorded files
        recordAll: true, // Record all streams
        recordFileDuration: 0, // 0 means no duration limit for recordings (record indefinitely)
        recordFileMaxSize: 100 * 1024 * 1024, // Optional: max file size for recordings (in bytes), can be set as needed
      }
    ]
  }
};

var nms = new NodeMediaServer(config);
nms.run();

//ffmpeg -re -i video.mp4 -c:v copy -c:a aac -f flv rtmp://localhost/live/stream