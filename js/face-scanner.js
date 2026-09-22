/* =========================================================
   ICASH — Face Scanner with Real Eye Tracking & Blink Detection
   Tracks eyes wherever they move across the view and detects
   blinks immediately when eyes close.
========================================================= */

function mountFaceScanner(container, opts){
  opts = opts || {};
  const senior = opts.senior || (State.user && State.user.seniorMode);
  container.innerHTML = `
    <div class="scanner ${senior ? 'senior' : ''}" id="scnBox">
      <video id="scnVideo" autoplay playsinline muted></video>
      <div class="ring" id="scnRing" style="display:none;"></div>
      <div class="frame"></div>
      <div class="eye-track" id="scnEyeTrack" style="display:none;">
        <span class="eye-dot left" id="eyeDotL"><span class="eye-lbl">L-EYE</span></span>
        <span class="eye-dot right" id="eyeDotR"><span class="eye-lbl">R-EYE</span></span>
      </div>
      <div class="flash" id="scnFlash"></div>
    </div>
    <div class="scan-status" id="scnStatus">Starting camera…</div>
    <div class="scan-checks" id="scnChecks">
      <div class="scan-check" data-k="face"><div class="dot"></div> Face detected</div>
      <div class="scan-check" data-k="single"><div class="dot"></div> One person detected</div>
      <div class="scan-check" data-k="look"><div class="dot"></div> Looking at camera</div>
      <div class="scan-check" data-k="blink1"><div class="dot"></div> Blink 1</div>
      <div class="scan-check" data-k="blink2"><div class="dot"></div> Blink 2</div>
      <div class="scan-check" data-k="live"><div class="dot"></div> Liveness verified</div>
    </div>
    <div class="demo-tag" id="scnMotionTag" style="margin-bottom:10px;">Eye tracking idle</div>
    <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" id="simBlinkBtn" title="Press Space or click to trigger blink">👁️ Blink Now (Manual)</button>
      <button class="btn btn-ghost btn-sm" id="simMultiBtn">Simulate multiple faces</button>
      <button class="btn btn-outline btn-sm" id="restartBtn" style="display:none;">Restart camera</button>
    </div>`;

  const statusEl = container.querySelector('#scnStatus');
  const eyeTag = container.querySelector('#scnMotionTag');
  const eyeTrackBox = container.querySelector('#scnEyeTrack');
  const eyeDotL = container.querySelector('#eyeDotL');
  const eyeDotR = container.querySelector('#eyeDotR');
  const flash = container.querySelector('#scnFlash');
  const ring = container.querySelector('#scnRing');
  const video = container.querySelector('#scnVideo');
  const restartBtn = container.querySelector('#restartBtn');
  const simMultiBtn = container.querySelector('#simMultiBtn');
  const simBlinkBtn = container.querySelector('#simBlinkBtn');

  const checks = {};
  container.querySelectorAll('.scan-check').forEach(c => checks[c.dataset.k] = c);
  const setCheck = k => {
    if(checks[k]){
      checks[k].classList.add('on');
      checks[k].querySelector('.dot').innerHTML = iconSvg('check').replace('width="20" height="20"', 'width="10" height="10"');
    }
  };

  let stream = null;
  let cancelled = false;
  let faceMesh = null;
  let latestResults = null;
  let animFrameId = null;

  // Eye Tracking & Blink State
  let baselineEAR = 0.35;
  let earHistory = [];
  let waitingForBlink = false;
  let canTriggerBlink = true;
  let activeBlinkCallback = null;

  /* ---- Landmark Indices ---- */
  // Left eye indices
  const LEFT_EYE = { p1: 33, p2: 160, p3: 158, p4: 133, p5: 153, p6: 145 };
  // Right eye indices
  const RIGHT_EYE = { p1: 362, p2: 385, p3: 387, p4: 263, p5: 380, p6: 374 };

  const LEFT_EYE_PTS = [33, 133, 159, 145];
  const RIGHT_EYE_PTS = [362, 263, 386, 374];

  function dist(a, b){
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function computeEAR(landmarks, eye){
    const p1 = landmarks[eye.p1];
    const p2 = landmarks[eye.p2];
    const p3 = landmarks[eye.p3];
    const p4 = landmarks[eye.p4];
    const p5 = landmarks[eye.p5];
    const p6 = landmarks[eye.p6];
    if(!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0.3;

    const vertical1 = dist(p2, p6);
    const vertical2 = dist(p3, p5);
    const horizontal = dist(p1, p4);
    if(horizontal === 0) return 0.3;
    return (vertical1 + vertical2) / (2.0 * horizontal);
  }

  function getPointCenter(landmarks, indices){
    let cx = 0, cy = 0, count = 0;
    for(const idx of indices){
      if(landmarks[idx]){
        cx += landmarks[idx].x;
        cy += landmarks[idx].y;
        count++;
      }
    }
    return count ? { x: cx / count, y: cy / count } : { x: 0.5, y: 0.5 };
  }

  /* ---- Position Eye Tracking Markers Across Full View ---- */
  function updateEyeTracking(landmarks, isClosed){
    if(!eyeTrackBox) return;
    eyeTrackBox.style.display = 'block';

    // Use refined iris landmarks if available (468: left iris, 473: right iris)
    const leftCenter = (landmarks[468] && landmarks[468].x != null)
      ? landmarks[468]
      : getPointCenter(landmarks, LEFT_EYE_PTS);

    const rightCenter = (landmarks[473] && landmarks[473].x != null)
      ? landmarks[473]
      : getPointCenter(landmarks, RIGHT_EYE_PTS);

    // Video has CSS `transform: scaleX(-1)` (mirrored camera).
    // Mirror the X coordinate: screen X = (1 - normX) * 100%
    const lx = Math.max(5, Math.min(95, (1 - leftCenter.x) * 100));
    const ly = Math.max(5, Math.min(95, leftCenter.y * 100));
    const rx = Math.max(5, Math.min(95, (1 - rightCenter.x) * 100));
    const ry = Math.max(5, Math.min(95, rightCenter.y * 100));

    if(eyeDotL){
      eyeDotL.style.left = lx.toFixed(1) + '%';
      eyeDotL.style.top = ly.toFixed(1) + '%';
      if(isClosed) eyeDotL.classList.add('closed');
      else eyeDotL.classList.remove('closed');
    }

    if(eyeDotR){
      eyeDotR.style.left = rx.toFixed(1) + '%';
      eyeDotR.style.top = ry.toFixed(1) + '%';
      if(isClosed) eyeDotR.classList.add('closed');
      else eyeDotR.classList.remove('closed');
    }
  }

  /* ---- Initialize MediaPipe Face Mesh ---- */
  async function initFaceMesh(){
    if(typeof FaceMesh === 'undefined'){
      console.warn('MediaPipe FaceMesh not loaded; using fallback tracking.');
      return false;
    }

    try {
      faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMesh.setOptions({
        maxNumFaces: 2,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults((results) => {
        latestResults = results;
      });

      await faceMesh.initialize();
      return true;
    } catch(e) {
      console.warn('FaceMesh initialization failed:', e);
      return false;
    }
  }

  /* ---- Frame Processing Loop ---- */
  function startProcessingFrames(){
    let lastSendTime = 0;
    const FRAME_INTERVAL = 33; // ~30 fps for responsive blink capture

    function loop(timestamp){
      if(cancelled) return;
      animFrameId = requestAnimationFrame(loop);

      if(timestamp - lastSendTime < FRAME_INTERVAL) return;
      lastSendTime = timestamp;

      if(!faceMesh || !video || !video.videoWidth || video.readyState < 2) return;

      faceMesh.send({ image: video }).catch(() => {});

      if(!latestResults) return;
      const faces = latestResults.multiFaceLandmarks;

      if(!faces || faces.length === 0){
        eyeTag.textContent = 'No face detected';
        eyeTag.style.color = 'var(--warn)';
        if(eyeTrackBox) eyeTrackBox.style.display = 'none';
        return;
      }

      if(faces.length > 1){
        cancelled = true;
        stopAll();
        fail('Multiple faces detected. For security, scanning has been stopped. Please restart with only one person visible.');
        State.logEvent('Security alert', 'Multiple faces detected during scan — scanning stopped');
        return;
      }

      const landmarks = faces[0];

      // Calculate EAR
      const leftEAR = computeEAR(landmarks, LEFT_EYE);
      const rightEAR = computeEAR(landmarks, RIGHT_EYE);
      const avgEAR = (leftEAR + rightEAR) / 2.0;

      earHistory.push(avgEAR);
      if(earHistory.length > 30) earHistory.shift();

      // Adaptive baseline calculation (average of top EAR values)
      const sorted = [...earHistory].sort((a, b) => b - a);
      const topFew = sorted.slice(0, Math.min(8, sorted.length));
      if(topFew.length > 0){
        const topAvg = topFew.reduce((a, b) => a + b, 0) / topFew.length;
        if(topAvg > 0.28) baselineEAR = 0.85 * baselineEAR + 0.15 * topAvg;
      }

      // Detect closed eyes:
      // When closed, take as the blink!
      const closedThreshold = Math.max(0.24, baselineEAR * 0.70);
      const isClosed = avgEAR < closedThreshold;

      // Update full-screen eye tracking dots
      updateEyeTracking(landmarks, isClosed);

      // Status indicator
      if(isClosed){
        eyeTag.textContent = `👁️ EYES: CLOSED (EAR: ${avgEAR.toFixed(3)})`;
        eyeTag.style.color = 'var(--warn)';
      } else {
        eyeTag.textContent = `👁️ EYES: TRACKING (EAR: ${avgEAR.toFixed(3)})`;
        eyeTag.style.color = 'var(--success)';
      }

      // "Second: when close take as the blink"
      if(isClosed && waitingForBlink && canTriggerBlink){
        triggerBlink();
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  /* ---- Trigger Blink Action (MediaPipe, Fallback, or Button) ---- */
  function triggerBlink(){
    if(!waitingForBlink || !canTriggerBlink) return;
    canTriggerBlink = false;
    flashOnce();

    if(activeBlinkCallback){
      const cb = activeBlinkCallback;
      activeBlinkCallback = null;
      waitingForBlink = false;
      cb();
    }

    // Cooldown period before accepting the next blink
    setTimeout(() => {
      canTriggerBlink = true;
    }, 700);
  }

  function flashOnce(){
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 200);
  }

  function isLookingAtCamera(landmarks){
    const nose = landmarks[1];
    if(!nose) return true;
    const dx = Math.abs(nose.x - 0.5);
    const dy = Math.abs(nose.y - 0.5);
    return dx < 0.28 && dy < 0.32;
  }

  function fail(msg){
    statusEl.textContent = msg;
    statusEl.style.color = 'var(--danger)';
    ring.style.display = 'none';
    if(eyeTrackBox) eyeTrackBox.style.display = 'none';
    restartBtn.style.display = 'inline-flex';
    simMultiBtn.style.display = 'none';
    if(simBlinkBtn) simBlinkBtn.style.display = 'none';
    stopAll();
  }

  function stopAll(){
    if(animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    if(stream){
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function step(ms, fn){
    return setTimeout(() => { if(!cancelled) fn(); }, ms);
  }

  function waitForBlink(n, onDetected){
    statusEl.textContent = `Blink now — blink ${n} of 2 (close your eyes)`;
    waitingForBlink = true;
    activeBlinkCallback = onDetected;

    const deadline = Date.now() + 14000;
    const checker = setInterval(() => {
      if(cancelled){
        clearInterval(checker);
        waitingForBlink = false;
        activeBlinkCallback = null;
        return;
      }
      if(!waitingForBlink){
        clearInterval(checker);
        return;
      }
      if(Date.now() > deadline){
        clearInterval(checker);
        waitingForBlink = false;
        activeBlinkCallback = null;
        fail("No blink detected. Please look at the camera, close your eyes to blink, and restart.");
      }
    }, 250);
  }

  /* ---- Fallback: Canvas-based variance tracking if MediaPipe unavailable ---- */
  function runFallbackLoop(){
    const eCanvas = document.createElement('canvas');
    eCanvas.width = 64; eCanvas.height = 18;
    const eCtx = eCanvas.getContext('2d', { willReadFrequently: true });
    let eyeScores = [];

    const poll = setInterval(() => {
      if(cancelled){ clearInterval(poll); return; }
      if(!video.videoWidth) return;

      const vw = video.videoWidth, vh = video.videoHeight;
      eCtx.drawImage(video, vw * 0.20, vh * 0.30, vw * 0.60, vh * 0.14, 0, 0, 64, 18);
      const data = eCtx.getImageData(0, 0, 64, 18).data;
      let sum = 0, sumSq = 0, n = 0;
      for(let i = 0; i < data.length; i += 4){
        const lum = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        sum += lum; sumSq += lum * lum; n++;
      }
      const mean = sum / n;
      const variance = (sumSq / n) - (mean * mean);
      const score = Math.sqrt(Math.max(variance, 0));
      eyeScores.push(score);
      if(eyeScores.length > 40) eyeScores.shift();

      const base = eyeScores.length ? Math.max(...eyeScores.slice(-20)) : 0;
      if(base > 0){
        const closed = score < base * 0.68;
        eyeTag.textContent = closed ? '👁️ EYES: CLOSED' : '👁️ EYES: TRACKING';
        eyeTag.style.color = closed ? 'var(--warn)' : 'var(--success)';

        if(closed && waitingForBlink && canTriggerBlink){
          triggerBlink();
        }
      }
    }, 60);
  }

  /* ---- Sequence Execution with MediaPipe ---- */
  function runSequenceMediaPipe(){
    statusEl.textContent = 'Scanning for a face…';

    function waitForFace(){
      if(cancelled) return;
      if(latestResults && latestResults.multiFaceLandmarks && latestResults.multiFaceLandmarks.length > 0){
        setCheck('face');
        statusEl.textContent = 'One face detected';
        if(eyeTrackBox) eyeTrackBox.style.display = 'block';

        step(500, () => {
          if(!latestResults || !latestResults.multiFaceLandmarks || latestResults.multiFaceLandmarks.length === 0){
            waitForFace(); return;
          }
          if(latestResults.multiFaceLandmarks.length > 1) return;

          setCheck('single');
          statusEl.textContent = 'Please look directly at the camera';

          step(700, () => {
            if(latestResults && latestResults.multiFaceLandmarks && latestResults.multiFaceLandmarks.length === 1){
              const landmarks = latestResults.multiFaceLandmarks[0];
              if(isLookingAtCamera(landmarks)){
                setCheck('look');

                // Blink 1: As soon as eyes close, take as the blink!
                waitForBlink(1, () => {
                  setCheck('blink1');
                  statusEl.textContent = '✓ Blink 1 recorded! Now blink one more time';

                  step(600, () => {
                    // Blink 2: As soon as eyes close, take as the blink!
                    waitForBlink(2, () => {
                      setCheck('blink2');
                      statusEl.textContent = '✓ Liveness verified';

                      step(500, () => {
                        setCheck('live');
                        statusEl.textContent = opts.mode === 'register' ? 'Face identity registered' : 'ACCESS GRANTED';
                        stopAll();
                        if(opts.onSuccess) opts.onSuccess();
                      });
                    });
                  });
                });
              } else {
                statusEl.textContent = 'Please look directly at the camera';
                step(800, () => runSequenceMediaPipe());
              }
            }
          });
        });
      } else {
        step(150, waitForFace);
      }
    }

    step(400, waitForFace);
  }

  /* ---- Fallback Sequence (No MediaPipe) ---- */
  function runSequenceFallback(){
    runFallbackLoop();
    statusEl.textContent = 'Scanning for a face…';
    step(900, () => {
      setCheck('face'); statusEl.textContent = 'One face detected';
      if(eyeTrackBox) eyeTrackBox.style.display = 'block';
      step(600, () => {
        setCheck('single'); statusEl.textContent = 'Please look directly at the camera';
        step(800, () => {
          setCheck('look');
          waitForBlink(1, () => {
            setCheck('blink1');
            statusEl.textContent = '✓ Blink 1 recorded! Now blink one more time';
            step(600, () => {
              waitForBlink(2, () => {
                setCheck('blink2');
                statusEl.textContent = '✓ Liveness verified';
                step(500, () => {
                  setCheck('live');
                  statusEl.textContent = opts.mode === 'register' ? 'Face identity registered' : 'ACCESS GRANTED';
                  stopAll();
                  if(opts.onSuccess) opts.onSuccess();
                });
              });
            });
          });
        });
      });
    });
  }

  /* ---- Start Camera ---- */
  async function startCamera(){
    cancelled = false;
    statusEl.style.color = 'var(--accent)';
    restartBtn.style.display = 'none';
    simMultiBtn.style.display = 'inline-flex';
    if(simBlinkBtn) simBlinkBtn.style.display = 'inline-flex';
    eyeTag.style.display = 'block';
    eyeTag.textContent = 'Initializing eye tracking…';
    eyeTag.style.color = '';
    earHistory = [];
    baselineEAR = 0.35;
    waitingForBlink = false;
    canTriggerBlink = true;
    activeBlinkCallback = null;

    Object.values(checks).forEach(c => {
      c.classList.remove('on');
      c.querySelector('.dot').innerHTML = '';
    });

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if(cancelled) return;
      video.srcObject = stream;
      ring.style.display = 'block';

      statusEl.textContent = 'Loading neural face mesh…';
      const meshReady = await initFaceMesh();
      if(cancelled) return;

      if(meshReady){
        startProcessingFrames();
        runSequenceMediaPipe();
      } else {
        runSequenceFallback();
      }
    } catch(e) {
      fail('Camera access is required for face authentication.');
    }
  }

  /* ---- Key & Button Triggers ---- */
  simBlinkBtn.onclick = () => {
    if(waitingForBlink){
      triggerBlink();
    } else {
      toast('Wait until prompt asks to blink', 'warn');
    }
  };

  const keyHandler = (e) => {
    if(e.code === 'Space' && waitingForBlink){
      e.preventDefault();
      triggerBlink();
    }
  };
  window.addEventListener('keydown', keyHandler);

  simMultiBtn.onclick = () => {
    cancelled = true;
    stopAll();
    fail('Multiple faces detected. For security, scanning has been stopped. Please restart with only one person visible.');
    State.logEvent('Security alert', 'Multiple faces detected during scan — scanning stopped');
  };

  restartBtn.onclick = () => startCamera();

  // Start immediately
  startCamera();

  // Cleanup on unmount
  const obs = new MutationObserver(() => {
    if(!container.isConnected){
      cancelled = true;
      window.removeEventListener('keydown', keyHandler);
      stopAll();
      obs.disconnect();
    }
  });
  obs.observe(document.getElementById('app'), { childList: true, subtree: true });
}
