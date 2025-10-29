// --- GLOBAL SETUP AND CONSTANTS (Ensure all HTML elements are defined above) ---
let video = document.getElementById("video");
let drawCanvas = document.getElementById("draw");
let sampleCanvas = document.getElementById("sample");
let startBtn = document.getElementById("startBtn");
let stopBtn = document.getElementById("stopBtn");
let statusEl = document.getElementById("status");
let showVideoCheckbox = document.getElementById("showVideo");

let drawCtx, sampleCtx;
let net = null;
let stream = null;
let running = false;

const SAMPLE_STEP = 8;
const BODY_LETTER_COUNT = 3000;
const FLY_SPEED = 0.05; // lower = slower, smoother

// Trail variables (MUST be defined globally)
let movementTrail = [];
const TRAIL_DURATION = 2000; // 2 seconds in milliseconds

let bodyLetters = [];
let flyingLetters = [];
let fixedLetters = [];
let nextTextX = 10;
let nextTextY = 20;
const lineHeight = 14;
const fontSize = 12;
const margin = 10;

// silence timer
let silenceTimeout = null;
let lastSpeechTime = Date.now();

// --- UTILITY FUNCTIONS ---
function resizeCanvases() {
  drawCanvas.width = innerWidth;
  drawCanvas.height = innerHeight;
  sampleCanvas.width = video.videoWidth || 640;
  sampleCanvas.height = video.videoHeight || 480;
}
window.addEventListener("resize", resizeCanvases);

function randomLetter() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return chars[Math.floor(Math.random() * chars.length)];
}

function initBodyLetters() {
  bodyLetters = [];
  for (let i = 0; i < BODY_LETTER_COUNT; i++) {
    bodyLetters.push({
      x: Math.random() * drawCanvas.width,
      y: Math.random() * drawCanvas.height,
      vx: 0,
      vy: 0,
      letter: randomLetter(),
    });
  }
}

// --- START / STOP CONTROLS ---
startBtn.addEventListener("click", async () => {
  if (running) return;
  startBtn.disabled = true;
  statusEl.textContent = "Starting camera and model...";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
    video.srcObject = stream;
    // Wait for video metadata to load before resizing
    await new Promise(resolve => video.onloadedmetadata = resolve); 
    await video.play();

    drawCtx = drawCanvas.getContext("2d");
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    resizeCanvases();
    initBodyLetters();

    statusEl.textContent = "Loading BodyPix model...";
    net = await bodyPix.load({
      architecture: "MobileNetV1",
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
    });

    running = true;
    stopBtn.disabled = false;
    showVideoCheckbox.disabled = false;
    statusEl.textContent = "Running";

    startSpeechRecognition();
    animateLoop();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", () => {
  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  showVideoCheckbox.disabled = true;
  statusEl.textContent = "Stopped.";
  clearTimeout(silenceTimeout); 
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.pause();
  video.srcObject = null;
});

// --- SPEECH RECOGNITION ---
function startSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech recognition not supported.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + " ";
      }
    }

    if (finalTranscript) {
      addWordsToFlyingLetters(finalTranscript);
      lastSpeechTime = Date.now();
      resetSilenceTimer();
    }
  };

  recognition.onerror = (e) => console.error("Speech error:", e);
  recognition.onend = () => {
    if(running) recognition.start(); 
  } 
  recognition.start();
  resetSilenceTimer();
}

function resetSilenceTimer() {
  clearTimeout(silenceTimeout);
  silenceTimeout = setTimeout(() => {
    const now = Date.now();
    if (now - lastSpeechTime >= 1000) {
      addWordsToFlyingLetters("   "); 
    }
    if(running) resetSilenceTimer(); 
  }, 1000);
}

// --- FLYING LETTERS ---
function addWordsToFlyingLetters(text) {
  drawCtx.font = `${fontSize}px monospace`;
  const letters = text.split("");

  for (let ch of letters) {
    if (ch === " ") {
      nextTextX += drawCtx.measureText(" ").width * 3;
      if (nextTextX > drawCanvas.width - margin) {
        nextTextX = margin;
        nextTextY += lineHeight;
      }
      continue;
    }

    const source = bodyLetters[Math.floor(Math.random() * bodyLetters.length)];
    if (!source) continue;

    const targetX = nextTextX;
    const targetY = nextTextY;
    nextTextX += drawCtx.measureText(ch).width + 1;
    if (nextTextX > drawCanvas.width - margin) {
      nextTextX = margin;
      nextTextY += lineHeight;
    }
    if (nextTextY > drawCanvas.height - margin) {
      nextTextY = margin + fontSize;
    }

    flyingLetters.push({
      x: source.x,
      y: source.y,
      letter: ch,
      tx: targetX,
      ty: targetY,
      arrived: false,
    });

    source.letter = randomLetter();
  }
}

// --- ANIMATION LOOP ---
async function animateLoop() {
  if (!running) return;
  
  const now = Date.now();
  sampleCanvas.width = video.videoWidth || sampleCanvas.width;
  sampleCanvas.height = video.videoHeight || sampleCanvas.height;

  // 1. Segmentation
  sampleCtx.save();
  sampleCtx.scale(-1, 1); 
  sampleCtx.drawImage(
    video,
    -sampleCanvas.width,
    0,
    sampleCanvas.width,
    sampleCanvas.height
  );
  sampleCtx.restore();

  const segmentation = await net.segmentPerson(sampleCanvas, {
    internalResolution: "medium",
    segmentationThreshold: 0.6,
  });

  const bodyPoints = [];
  const sw = segmentation.width;
  const sh = segmentation.height;
  const mask = segmentation.data;

  for (let y = 0; y < sh; y += SAMPLE_STEP) {
    for (let x = 0; x < sw; x += SAMPLE_STEP) {
      const idx = y * sw + x;
      if (mask[idx]) {
        const dx = (x / sw) * drawCanvas.width;
        const dy = (y / sh) * drawCanvas.height;
        bodyPoints.push([dx, dy]);
      }
    }
  }

  // 2. TRAIL: Capture and Prune
  if (bodyPoints.length > 0) {
      movementTrail.push({
          points: bodyPoints.slice(), 
          timestamp: now,
      });
  }
  
  const twoSecondsAgo = now - TRAIL_DURATION;
  movementTrail = movementTrail.filter(trail => trail.timestamp >= twoSecondsAgo);


  // 3. Drawing Setup & Optional Video Feed
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  
  if (showVideoCheckbox.checked) {
     drawCtx.save();
     drawCtx.scale(-1, 1);
     drawCtx.drawImage(video, -drawCanvas.width, 0, drawCanvas.width, drawCanvas.height);
     drawCtx.restore();
  }

  drawCtx.font = `${fontSize}px monospace`;
  
  // 4. TRAIL: Draw the fading trail (Cyan Dots)
  drawCtx.fillStyle = "#f2d73bff"; // Cyan color
  
  for (const trail of movementTrail) {
      const age = now - trail.timestamp;
      const alpha = 0.5 * (1 - (age / TRAIL_DURATION)); // Fades from 0.5 to 0
      
      drawCtx.globalAlpha = alpha;
      
      for (const [x, y] of trail.points) {
          // Draw small dots
          drawCtx.fillRect(x, y, 2, 2); 
      }
  }
  
  // 5. Update and Draw Body Letters (RANDOM ATTRACTION REVERTED)
  drawCtx.fillStyle = "#000000ff"; // Bright Cyan for letters
  
  for (let p of bodyLetters) {
    if (bodyPoints.length) {
      // Attraction target is a RANDOM point on the body contour (causes clumping, but fluid motion)
      const randIndex = Math.floor(Math.random() * bodyPoints.length);
      const candX = bodyPoints[randIndex][0];
      const candY = bodyPoints[randIndex][1];
          
      // Original attraction strength and damping
      const ax = (candX - p.x) * 0.12;
      const ay = (candY - p.y) * 0.12;
      p.vx = p.vx * 0.7 + ax;
      p.vy = p.vy * 0.7 + ay;
    } else {
      // No body detected, letters drift slowly
      p.vx *= 0.95;
      p.vy *= 0.95;
    }

    p.x += p.vx;
    p.y += p.vy;

    drawCtx.globalAlpha = 0.7;
    drawCtx.fillText(p.letter, p.x, p.y);
  }

  // 6. Flying letters (Target text, original white/gray color)
  drawCtx.fillStyle = "#000000ff"; 
  for (let f of flyingLetters) {
    const dx = f.tx - f.x;
    const dy = f.ty - f.y;
    f.x += dx * FLY_SPEED;
    f.y += dy * FLY_SPEED;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      f.arrived = true;
      fixedLetters.push({ x: f.tx, y: f.ty, letter: f.letter });
    }

    drawCtx.globalAlpha = 0.9;
    drawCtx.fillText(f.letter, f.x, f.y);
  }

  flyingLetters = flyingLetters.filter((f) => !f.arrived);

  // 7. Fixed text
  drawCtx.globalAlpha = 1;
  for (let f of fixedLetters) {
    drawCtx.fillText(f.letter, f.x, f.y);
  }

  statusEl.textContent = `Running — Trail: ${movementTrail.length} pts, Body: ${bodyPoints.length} pts, Flying: ${flyingLetters.length}`;
  requestAnimationFrame(animateLoop);
}
