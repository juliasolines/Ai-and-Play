// script.js
let video = document.getElementById('video');
let drawCanvas = document.getElementById('draw');
let sampleCanvas = document.getElementById('sample');
let startBtn = document.getElementById('startBtn');
let stopBtn = document.getElementById('stopBtn');
let statusEl = document.getElementById('status');
let showVideoCheckbox = document.getElementById('showVideo');

let drawCtx, sampleCtx;
let net = null;
let stream = null;
let running = false;
let particles = [];
const PARTICLE_COUNT = 3000; // tune for performance
const SAMPLE_STEP = 8; // sample every 8 px; higher -> faster, lower -> more accurate

// make canvas full-window sized
function resizeCanvases(){
  drawCanvas.width = innerWidth;
  drawCanvas.height = innerHeight;
  sampleCanvas.width = video.videoWidth || 640;
  sampleCanvas.height = video.videoHeight || 480;
}
window.addEventListener('resize', () => {
  resizeCanvases();
});

// create particles with random positions
function initParticles(){
  particles = [];
  for(let i=0;i<PARTICLE_COUNT;i++){
    particles.push({
      x: Math.random()*drawCanvas.width,
      y: Math.random()*drawCanvas.height,
      vx: 0, vy: 0,
      size: 3 + Math.random()*3,
      targetIndex: Math.floor(Math.random()*1000), // starting dummy
    });
  }
}

// helper to sleep
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

// start camera and model
startBtn.addEventListener('click', async () => {
  if (running) return;
  startBtn.disabled = true;
  statusEl.textContent = 'starting camera...';

  try {
    // request camera (front camera if available)
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();

    // create contexts; sampleCtx willReadFrequently because we call getImageData frequently
    drawCtx = drawCanvas.getContext('2d');
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    resizeCanvases();
    initParticles();
    statusEl.textContent = 'loading model...';

    // Load BodyPix model (from CDN). This may take a second.
    // Using defaults; you can tune for speed/accuracy in options below.
    net = await bodyPix.load({
      architecture: 'MobileNetV1', // lighter and faster in browser
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    });

    statusEl.textContent = 'model loaded — running';
    running = true;
    stopBtn.disabled = false;
    showVideoCheckbox.disabled = false;
    animateLoop();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'error: ' + (err.message || err);
    startBtn.disabled = false;
  }
});

// stop everything
stopBtn.addEventListener('click', () => {
  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'stopped';
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (video) { video.pause(); video.srcObject = null; }
});

// toggle showing raw video
showVideoCheckbox.addEventListener('change', () => {
  video.style.display = showVideoCheckbox.checked ? 'block' : 'none';
});

// Main animation + segmentation loop
async function animateLoop(){
  if (!running) return;
  // draw video into sample canvas at its natural resolution
  sampleCanvas.width = video.videoWidth || sampleCanvas.width;
  sampleCanvas.height = video.videoHeight || sampleCanvas.height;

  // mirror the video before processing
  sampleCtx.save();
  sampleCtx.scale(-1, 1);
  sampleCtx.drawImage(video, -sampleCanvas.width, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.restore();


  // segmentPerson returns a single-person binary mask suitable for our use
  // segmentation has .data (Uint8Array) with 1 for person pixel, 0 for not-person
  let segmentation = await net.segmentPerson(sampleCanvas, {
    internalResolution: 'medium',
    segmentationThreshold: 0.6
  });

  // build a list of body points by sampling the segmentation mask
  const bodyPoints = [];
  const sw = segmentation.width;
  const sh = segmentation.height;
  const mask = segmentation.data; // Uint8Array length = sw*sh

  // sample grid to reduce data
  for (let y = 0; y < sh; y += SAMPLE_STEP) {
    for (let x = 0; x < sw; x += SAMPLE_STEP) {
      const idx = y * sw + x;
      if (mask[idx] === 1) {
        // map sample coords to drawCanvas coords (fullscreen)
        const dx = x / sw * drawCanvas.width;
        const dy = y / sh * drawCanvas.height;
        bodyPoints.push([dx, dy]);
      }
    }
  }

  // clear draw canvas and optionally draw a faint background
  drawCtx.clearRect(0,0,drawCanvas.width, drawCanvas.height);

  // optionally: draw segmented mask for debugging
  // drawCtx.fillStyle = 'rgba(100,200,240,0.06)';
  // for (const p of bodyPoints) drawCtx.fillRect(p[0], p[1], 3, 3);

  // For each particle, move toward a nearby body point (or wander)
  for (let i = 0; i < particles.length; i++){
    const p = particles[i];

    if (bodyPoints.length) {
      // pick a random subset to search (faster than full nearest neighbor)
      const tries = 8;
      let best = null;
      let bestDist = 1e9;
      for (let t=0;t<tries;t++){
        const cand = bodyPoints[Math.floor(Math.random()*bodyPoints.length)];
        const dx = cand[0] - p.x;
        const dy = cand[1] - p.y;
        const d = dx*dx + dy*dy;
        if (d < bestDist){ bestDist = d; best = cand; }
      }
      if (best) {
        // move towards target with easing
        const tx = best[0], ty = best[1];
        const ax = (tx - p.x) * 0.12;
        const ay = (ty - p.y) * 0.12;
        p.vx = p.vx * 0.7 + ax;
        p.vy = p.vy * 0.7 + ay;
      }
    } else {
      // no body points: slow drifting
      p.vx *= 0.95;
      p.vy *= 0.95;
    }

    // integrate velocity
    p.x += p.vx;
    p.y += p.vy;

    // boundary wrap
    if (p.x < -20) p.x = drawCanvas.width + 20;
    if (p.x > drawCanvas.width + 20) p.x = -20;
    if (p.y < -20) p.y = drawCanvas.height + 20;
    if (p.y > drawCanvas.height + 20) p.y = -20;
  }

  // draw particles: style depends on distance to nearest body point (glow)
  // draw a few layers for depth
  drawCtx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++){
    const p = particles[i];
    // find approximate proximity by sampling some body points
    let prox = 1e9;
    if (bodyPoints.length) {
      for (let t=0;t<6;t++){
        const cand = bodyPoints[Math.floor(Math.random()*bodyPoints.length)];
        const dx = cand[0] - p.x;
        const dy = cand[1] - p.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < prox) prox = d;
      }
    } else prox = 2000;

    const s = p.size;
    const alpha = Math.max(0.05, 1 - Math.min(prox / 150, 1));
    // color based on distance (you can tweak)
    
    drawTermite(drawCtx, p.x, p.y, s, alpha);

  }
  drawCtx.globalCompositeOperation = 'source-over';

function drawTermite(ctx, x, y, size, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.7, 0.7);      // optional: shrink a little
  ctx.rotate(Math.random() * Math.PI * 2); // random orientation
  ctx.globalAlpha = alpha * 0.95;

  // head
  ctx.beginPath();
  ctx.fillStyle = "#300505";
  ctx.arc(size * 3.2, 0, size * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // body (oval)
  ctx.beginPath();
  ctx.fillStyle = "#333";
  ctx.ellipse(0, 0, size * 1.5, size, 0, 0, Math.PI * 2);
  ctx.fill();

  // middle
  ctx.beginPath();
  ctx.fillStyle = "#222";
  ctx.arc(size * 2, 0, size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}


  // update status
  statusEl.textContent = `running — points: ${bodyPoints.length} — particles: ${particles.length}`;

  // next frame
  requestAnimationFrame(animateLoop);
}

