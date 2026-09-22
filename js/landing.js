/* =========================================================
   ICASH — Landing Page
========================================================= */
route('landing', function(){
  navbar();
  const hero = el(`
  <div class="hero">
    <div class="wrap hero-grid">
      <div>
        <div class="eyebrow"><span class="dot"></span> FACE AUTHENTICATION ACTIVE</div>
        <h1 class="display">Bank Without<br><span class="grad">Your Card.</span></h1>
        <p class="lede">Authenticate with your face. Access your money securely. Send, withdraw, and manage transactions without carrying a physical card.</p>
        <div class="hero-cta">
          <button class="btn btn-primary" onclick="nav('register')">Register</button>
          <button class="btn btn-ghost" onclick="nav('login')">Login</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <span class="pill ok">${iconSvg('check')} Cardless</span>
          <span class="pill ok">${iconSvg('shield')} Secure</span>
          <span class="pill ok">${iconSvg('contact')} Accessible</span>
        </div>
      </div>
      <div class="hero-visual">
        <canvas id="heroCanvas"></canvas>
        <div class="scan-caption">FACE AUTHENTICATION ACTIVE<span class="sub">CARDLESS · SECURE · ACCESSIBLE</span></div>
      </div>
    </div>
  </div>`);
  mount(hero);
  initHeroScene();

  mount(el(`
  <div class="section" id="how">
    <div class="wrap">
      <div class="section-head"><h2>How iCash works</h2><p>Four steps between you and your money — no plastic required.</p></div>
      <div class="steps4">
        <div class="card step-card"><div class="step-num">01</div><div class="step-icon">${iconSvg('contact')}</div><h3>Register</h3><p>Create your secure iCash identity in minutes.</p></div>
        <div class="card step-card"><div class="step-num">02</div><div class="step-icon">${iconSvg('face')}</div><h3>Verify your face</h3><p>Complete face authentication and liveness verification.</p></div>
        <div class="card step-card"><div class="step-num">03</div><div class="step-icon">${iconSvg('shield')}</div><h3>Access your wallet</h3><p>Use your face instead of a physical card.</p></div>
        <div class="card step-card"><div class="step-num">04</div><div class="step-icon">${iconSvg('send')}</div><h3>Transact</h3><p>Withdraw, send, or receive money securely.</p></div>
      </div>
    </div>
  </div>`));

  mount(el(`
  <div class="section" id="features">
    <div class="wrap">
      <div class="section-head"><h2>Built for every user</h2><p>One interface, tuned to who's using it.</p></div>
      <div class="feat-strip">
        <div class="card feat"><h4>${iconSvg('contact')} Senior Citizen Mode</h4><p>Users aged 60+ automatically get larger text, simplified navigation, and extra transaction confirmations — no separate app.</p></div>
        <div class="card feat"><h4>${iconSvg('alert')} Emergency PIN</h4><p>A dedicated PIN quietly triggers a simulated emergency protocol — notifying your emergency contact and locking transactions.</p></div>
        <div class="card feat"><h4>${iconSvg('shield')} Liveness Verified</h4><p>Single-face detection plus a blink-based liveness check stops screenshots and photos from being used to authenticate.</p></div>
      </div>
    </div>
  </div>`));

  mount(el(`
  <div class="section" id="security">
    <div class="wrap">
      <div class="glass" style="padding:34px; display:flex; align-items:center; gap:28px; flex-wrap:wrap;">
        <div style="flex:1; min-width:240px;">
          <div class="eyebrow">SECURITY, BY DESIGN</div>
          <h2 style="font-family:var(--font-d); font-size:24px; margin:10px 0;">One face. One person. Verified live.</h2>
          <p style="color:var(--muted); font-size:14px; line-height:1.6;">If more than one face enters the frame, scanning stops immediately and access is denied until you restart the camera with only yourself visible. All biometric data in this prototype is simulated and never leaves your browser.</p>
        </div>
        <button class="btn btn-primary" onclick="nav('register')">Create your iCash ID</button>
      </div>
    </div>
  </div>`));

  mount(el(`
  <footer><div class="wrap fr">
    <div>© 2026 iCash — demo prototype. All financial data shown is simulated.</div>
    <div>Built for accessibility · face-first, card-never</div>
  </div></footer>`));
});

/* ---------- THREE.JS HERO SCENE ---------- */
function initHeroScene(){
  const canvas = document.getElementById('heroCanvas');
  if(!canvas || typeof THREE==='undefined') return;
  const w = canvas.clientWidth || 500, h = canvas.clientHeight || 420;
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true});
  renderer.setSize(w, h); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 100);
  camera.position.set(0,0,9);
  const group = new THREE.Group(); scene.add(group);

  // scanning rings
  const ringGeo1 = new THREE.TorusGeometry(2.6, 0.03, 16, 100);
  const ringMat1 = new THREE.MeshBasicMaterial({color:0x4fd1ff, transparent:true, opacity:0.85});
  const ring1 = new THREE.Mesh(ringGeo1, ringMat1); group.add(ring1);

  const ringGeo2 = new THREE.TorusGeometry(2.2, 0.018, 16, 100);
  const ringMat2 = new THREE.MeshBasicMaterial({color:0x38e6c4, transparent:true, opacity:0.6});
  const ring2 = new THREE.Mesh(ringGeo2, ringMat2); ring2.rotation.x = Math.PI/2.4; group.add(ring2);

  const ringGeo3 = new THREE.TorusGeometry(3.1, 0.012, 16, 100);
  const ringMat3 = new THREE.MeshBasicMaterial({color:0x4fd1ff, transparent:true, opacity:0.3});
  const ring3 = new THREE.Mesh(ringGeo3, ringMat3); ring3.rotation.x = Math.PI/1.6; group.add(ring3);

  // inner shield core (icosahedron wireframe)
  const coreGeo = new THREE.IcosahedronGeometry(1.35, 1);
  const coreMat = new THREE.MeshBasicMaterial({color:0x9be9ff, wireframe:true, transparent:true, opacity:0.55});
  const core = new THREE.Mesh(coreGeo, coreMat); group.add(core);

  // particles
  const pCount = 140;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(pCount*3);
  for(let i=0;i<pCount;i++){
    const r = 3.6 + Math.random()*1.8;
    const th = Math.random()*Math.PI*2, ph = Math.acos((Math.random()*2)-1);
    positions[i*3] = r*Math.sin(ph)*Math.cos(th);
    positions[i*3+1] = r*Math.sin(ph)*Math.sin(th);
    positions[i*3+2] = r*Math.cos(ph);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const pMat = new THREE.PointsMaterial({color:0x4fd1ff, size:0.045, transparent:true, opacity:0.75});
  const points = new THREE.Points(pGeo, pMat); scene.add(points);

  let mx=0,my=0;
  canvas.addEventListener('mousemove', e=>{
    const r = canvas.getBoundingClientRect();
    mx = ((e.clientX - r.left)/r.width - 0.5);
    my = ((e.clientY - r.top)/r.height - 0.5);
  });

  let raf;
  function animate(t){
    raf = requestAnimationFrame(animate);
    ring1.rotation.z += 0.006;
    ring2.rotation.z -= 0.004;
    ring3.rotation.y += 0.003;
    core.rotation.y += 0.004; core.rotation.x += 0.002;
    points.rotation.y += 0.0009;
    group.rotation.y += (mx*0.5 - group.rotation.y)*0.03;
    group.rotation.x += (-my*0.3 - group.rotation.x)*0.03;
    renderer.render(scene, camera);
  }
  animate();
  window.addEventListener('resize', ()=>{
    if(!canvas.isConnected){ cancelAnimationFrame(raf); return; }
    const nw=canvas.clientWidth, nh=canvas.clientHeight;
    if(nw&&nh){ renderer.setSize(nw,nh); camera.aspect=nw/nh; camera.updateProjectionMatrix(); }
  });
  // stop loop when navigating away
  const obs = new MutationObserver(()=>{ if(!canvas.isConnected){ cancelAnimationFrame(raf); obs.disconnect(); } });
  obs.observe(document.getElementById('app'), {childList:true, subtree:true});
}
