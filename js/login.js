/* =========================================================
   ICASH — Secure Login + Biometric Verification
========================================================= */
let selectedLoginUser = null;

route('login', function(){
  navbar();
  const shell = el(`<div class="auth-shell"><div class="glass auth-card" id="loginBox"></div></div>`);
  mount(shell);
  renderLoginHome();
});

async function renderLoginHome(){
  const box = document.getElementById('loginBox');
  const targetUser = selectedLoginUser || State.user || { name: 'Siddharth Pal', phone: '+91 98765 43210', id: 1 };

  box.innerHTML = `
    <div class="auth-head">
      <h2>Welcome back</h2>
      <p>Sign in to <b>${targetUser.name}</b> (${targetUser.phone})</p>
    </div>
    <button class="btn btn-primary btn-block" id="faceLoginBtn" style="margin-bottom:10px;">${iconSvg('face')} Secure Face Login</button>
    <button class="btn btn-ghost btn-block" id="pinLoginBtn" style="margin-bottom:12px;">Use PIN instead</button>
    <button class="btn btn-outline btn-block btn-sm" id="switchAccBtn" style="margin-bottom:18px;">Switch account / phone</button>
    <div style="text-align:center; border-top:1px solid var(--border); padding-top:14px;">
      <button class="btn btn-outline btn-sm" id="emgBtn" style="color:var(--danger); border-color:rgba(255,92,122,0.35);">${iconSvg('alert')} Emergency PIN</button>
    </div>
    <p style="text-align:center; color:var(--muted2); font-size:12.5px; margin-top:16px;">No account? <a href="#register" style="color:var(--accent)">Create one</a></p>`;

  /* ---------- FACE LOGIN ---------- */
  document.getElementById('faceLoginBtn').onclick = async () => {
    box.innerHTML = `
      <div class="auth-head">
        <h2>Initializing Biometrics</h2>
        <p>Connecting to secure authentication server…</p>
      </div>
      <div style="text-align:center; padding:30px;"><div class="dot" style="margin:0 auto; width:28px; height:28px; border:2px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div></div>`;

    try {
      // 1. Request cryptographic single-use challenge from server for target account
      const res = await fetch(API + '/auth/biometric/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: targetUser.id, phone: targetUser.phone })
      });
      const data = await res.json();

      // If account does not have Face ID enrolled yet
      if (!res.ok && data.error === 'NO_BIOMETRIC_ENROLLED') {
        box.innerHTML = `
          <div class="auth-head">
            <h2 style="color:var(--warn)">Face ID Not Enrolled</h2>
            <p>${data.message || 'No biometric profile is enrolled for this account.'}</p>
          </div>
          <div style="padding:10px 0 20px; font-size:13.5px; color:var(--muted); line-height:1.6;">
            To authenticate with your face, you must first enroll your Face ID.
          </div>
          <button class="btn btn-primary btn-block" id="enrollFaceNowBtn" style="margin-bottom:10px;">${iconSvg('face')} Enroll Face ID Now</button>
          <button class="btn btn-ghost btn-block" id="enrollFallbackPinBtn">Sign In With PIN Instead</button>`;

        document.getElementById('enrollFaceNowBtn').onclick = () => renderEnrollFaceFlow(targetUser);
        document.getElementById('enrollFallbackPinBtn').onclick = renderLoginHome;
        return;
      }

      if (!res.ok || !data.challengeId) {
        toast(data.error || 'Could not initiate biometric challenge', 'danger');
        renderLoginHome();
        return;
      }

      // 2. Mount face scanner with live challenge
      box.innerHTML = `
        <div class="auth-head">
          <h2>Biometric Verification</h2>
          <p>Verifying identity for <b>${targetUser.name}</b></p>
        </div>
        <div id="loginFaceHolder"></div>`;

      mountFaceScanner(document.getElementById('loginFaceHolder'), {
        challenge: data,
        onSuccess: async (authData) => {
          // SECURITY FIX (VULN-3): Explicitly verify that the backend confirmed success.
          // Never navigate to dashboard based on a network call alone — the response must
          // contain success:true. Any ambiguity = authentication denied.
          if (!authData || authData.success !== true) {
            toast('Authentication rejected — identity verification failed', 'danger');
            renderLoginHome();
            return;
          }

          // Reload full user state from the server-issued session
          await State.load();

          // SECURITY: If server session is not established, do not proceed
          if (!State.session || !State.session.active) {
            toast('Session could not be established — please try again', 'danger');
            renderLoginHome();
            return;
          }

          toast('Identity verified — access granted ✓', 'ok');
          setTimeout(() => nav('dashboard'), 500);
        },
        onCancel: renderLoginHome,
        onFailure: (err) => {
          console.warn('[Face Login] Verification failed:', err);
        }
      });


    } catch (e) {
      console.error('Challenge error:', e);
      toast('Network error connecting to biometric server', 'danger');
      renderLoginHome();
    }
  };

  /* ---------- PIN LOGIN ---------- */
  document.getElementById('pinLoginBtn').onclick = () => {
    box.innerHTML = `
      <div class="auth-head">
        <h2>Enter your PIN</h2>
        <p>Sign in to <b>${targetUser.name}</b></p>
      </div>
      <div class="field">
        <div class="pin-wrap">
          <input type="password" id="loginPin" maxlength="6" placeholder="••••" autofocus>
          <button type="button" class="pin-toggle" id="lpToggle">Show</button>
        </div>
        <div class="err" id="lpErr">Incorrect PIN.</div>
      </div>
      <button class="btn btn-primary btn-block" id="lpSubmit">Sign in</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="lpBack">Back</button>`;

    document.getElementById('lpToggle').onclick = () => {
      const i = document.getElementById('loginPin');
      i.type = i.type === 'password' ? 'text' : 'password';
    };
    document.getElementById('lpBack').onclick = renderLoginHome;

    document.getElementById('lpSubmit').onclick = async () => {
      const p = val('loginPin');
      if (!p) { toast('Please enter your PIN', 'warn'); return; }

      try {
        const res = await fetch(API + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ method: 'pin', pin: p, accountId: targetUser.id })
        });
        const d = await res.json();

        if (d.emergency) {
          triggerEmergencyMode(targetUser);
          return;
        }

        if (!res.ok) {
          document.getElementById('lpErr').style.display = 'block';
          toast(d.error || 'Incorrect PIN', 'danger');
          return;
        }

        await State.load();
        toast('Welcome back', 'ok');
        nav('dashboard');
      } catch (err) {
        toast('Login request failed', 'danger');
      }
    };
  };

  /* ---------- SWITCH ACCOUNT ---------- */
  document.getElementById('switchAccBtn').onclick = () => {
    box.innerHTML = `
      <div class="auth-head">
        <h2>Select Account</h2>
        <p>Enter phone number for the account</p>
      </div>
      <div class="field">
        <label>Account Phone Number</label>
        <input id="swPhone" placeholder="+91 XXXXX XXXXX" value="${targetUser.phone || ''}">
      </div>
      <button class="btn btn-primary btn-block" id="swSubmit">Select Account</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="swBack">Back</button>`;

    document.getElementById('swBack').onclick = renderLoginHome;
    document.getElementById('swSubmit').onclick = () => {
      const ph = val('swPhone');
      if (!ph) { toast('Enter phone number', 'warn'); return; }
      selectedLoginUser = { phone: ph, name: ph, id: targetUser.id };
      renderLoginHome();
    };
  };

  /* ---------- EMERGENCY PIN ---------- */
  document.getElementById('emgBtn').onclick = () => {
    box.innerHTML = `
      <div class="auth-head">
        <h2 style="color:var(--danger)">Emergency PIN</h2>
        <p>Entering this PIN activates the covert emergency protocol</p>
      </div>
      <div class="field">
        <div class="pin-wrap">
          <input type="password" id="emgPin" maxlength="6" placeholder="••••">
        </div>
      </div>
      <button class="btn btn-danger btn-block" id="emgSubmit">Confirm</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="emgBack">Back</button>`;

    document.getElementById('emgBack').onclick = renderLoginHome;
    document.getElementById('emgSubmit').onclick = async () => {
      const ep = val('emgPin');
      if (!ep) return;

      try {
        const res = await fetch(API + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ method: 'emergency', pin: ep, accountId: targetUser.id })
        });
        const d = await res.json();
        if (d.emergency || res.ok) {
          triggerEmergencyMode(targetUser);
        } else {
          toast('Incorrect PIN', 'danger');
        }
      } catch (err) {
        toast('Connection error', 'danger');
      }
    };
  };
}

/* =========================================================
   ENROLL FACE ID FLOW
========================================================= */
function renderEnrollFaceFlow(user) {
  const box = document.getElementById('loginBox');
  box.innerHTML = `
    <div class="auth-head">
      <h2>Enroll Face ID</h2>
      <p>Verify normal PIN to enroll biometrics for <b>${user.name}</b></p>
    </div>
    <div class="field">
      <label>Normal Account PIN</label>
      <div class="pin-wrap">
        <input type="password" id="enrollPin" maxlength="6" placeholder="••••">
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="enrollPinSubmit">Continue to Face Scan</button>
    <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="enrollPinBack">Cancel</button>`;

  document.getElementById('enrollPinBack').onclick = renderLoginHome;
  document.getElementById('enrollPinSubmit').onclick = () => {
    const pin = val('enrollPin');
    if (!pin) { toast('Enter your normal PIN to authorize enrollment', 'warn'); return; }

    box.innerHTML = `
      <div class="auth-head">
        <h2>Enroll Face Identity</h2>
        <p>Position your face and complete the liveness check</p>
      </div>
      <div id="enrollFaceHolder"></div>`;

    mountFaceScanner(document.getElementById('enrollFaceHolder'), {
      mode: 'enroll',
      onSuccess: async (result) => {
        try {
          const res = await fetch(API + '/auth/biometric/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              accountId: user.id,
              normalPin: pin,
              biometricTemplate: result.biometricTemplate
            })
          });
          const d = await res.json();
          if (!res.ok) {
            toast(d.error || 'Failed to enroll Face ID', 'danger');
            renderLoginHome();
            return;
          }
          toast('Face ID enrolled successfully ✓', 'ok');
          setTimeout(renderLoginHome, 1000);
        } catch (err) {
          toast('Enrollment failed: network error', 'danger');
          renderLoginHome();
        }
      },
      onCancel: renderLoginHome
    });
  };
}

/* =========================================================
   EMERGENCY MODE
========================================================= */
function triggerEmergencyMode(targetUser){
  const user = targetUser || State.user || { name: 'Account Holder' };
  const eventId = 'SOS-ICASH-2026-' + Math.floor(10000+Math.random()*89999);
  State.logEvent('Emergency', 'Emergency PIN detected — SOS protocol simulated ('+eventId+')');
  const scr = el(`
  <div class="emergency-screen">
    <div class="glass emg-card">
      <div class="emg-title">${iconSvg('alert')} EMERGENCY MODE ACTIVATED</div>
      <div class="emg-sub">SOS SIGNAL INITIATED — DEMO / SIMULATED</div>
      <div class="emg-row"><span>User</span><b>${user.name}</b></div>
      <div class="emg-row"><span>Status</span><b style="color:var(--danger)">Emergency PIN detected</b></div>
      <div class="emg-row"><span>Location</span><b>Demo ATM Location</b></div>
      <div class="emg-row"><span>Time</span><b>${new Date().toLocaleString('en-IN')}</b></div>
      <div class="emg-row"><span>Event ID</span><b>${eventId}</b></div>
      <div class="emg-actions" id="emgActions">
        <div class="emg-action"><span>Bank Security Notified</span><span id="a1">…</span></div>
        <div class="emg-action"><span>Emergency Contact Notified</span><span id="a2">…</span></div>
        <div class="emg-action"><span>Police Alert Simulated</span><span id="a3">…</span></div>
        <div class="emg-action"><span>Transaction Access Locked</span><span id="a4">…</span></div>
      </div>
      <p style="font-size:11.5px; color:var(--muted2); text-align:center; margin-bottom:18px;">This is a simulated demo. No real bank, police, or emergency service has been contacted.</p>
      <button class="btn btn-outline btn-block" id="safeBtn">Return to Safe Mode</button>
    </div>
  </div>`);
  document.body.appendChild(scr);
  ['a1','a2','a3','a4'].forEach((id,i)=> setTimeout(()=>{ scr.querySelector('#'+id).innerHTML = '<span style="color:var(--success)">✓</span>'; }, 500+i*450));
  scr.querySelector('#safeBtn').onclick = ()=>{
    openModal(`
      <div class="auth-head"><h2>Confirm return to safe mode</h2><p>Re-enter your normal PIN to exit emergency mode</p></div>
      <div class="field"><input type="password" id="safePin" maxlength="6" placeholder="Normal PIN"></div>
      <button class="btn btn-primary btn-block" id="safeConfirm">Confirm</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="safeCancel">Cancel</button>`);
    document.getElementById('safeCancel').onclick = closeModal;
    document.getElementById('safeConfirm').onclick = async ()=>{
      const sp = val('safePin');
      try {
        const res = await fetch(API + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ method: 'pin', pin: sp, accountId: user.id })
        });
        if (!res.ok) { toast('Incorrect PIN', 'danger'); return; }
        closeModal(); scr.remove();
        await State.load();
        nav('dashboard');
      } catch (e) {
        toast('Verification error', 'danger');
      }
    };
  };
}
