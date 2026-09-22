/* =========================================================
   ICASH — Login + Emergency Mode
========================================================= */
route('login', function(){
  navbar();
  const shell = el(`<div class="auth-shell"><div class="glass auth-card" id="loginBox"></div></div>`);
  mount(shell);
  renderLoginHome();
});

function renderLoginHome(){
  const box = document.getElementById('loginBox');
  box.innerHTML = `
    <div class="auth-head"><h2>Welcome back</h2><p>Sign in to ${State.user?.name?.split(' ')[0]||'your'} iCash account</p></div>
    <button class="btn btn-primary btn-block" id="faceLoginBtn" style="margin-bottom:10px;">${iconSvg('face')} Face Login</button>
    <button class="btn btn-ghost btn-block" id="pinLoginBtn" style="margin-bottom:18px;">Use PIN instead</button>
    <div style="text-align:center; border-top:1px solid var(--border); padding-top:14px;">
      <button class="btn btn-outline btn-sm" id="emgBtn" style="color:var(--danger); border-color:rgba(255,92,122,0.35);">${iconSvg('alert')} Emergency PIN</button>
    </div>
    <p style="text-align:center; color:var(--muted2); font-size:12.5px; margin-top:16px;">No account? <a href="#register" style="color:var(--accent)">Create one</a></p>`;

  document.getElementById('faceLoginBtn').onclick = ()=>{
    box.innerHTML = `<div class="auth-head"><h2>Face login</h2><p>Look at the camera to continue</p></div><div id="loginFaceHolder"></div>`;
    mountFaceScanner(document.getElementById('loginFaceHolder'), {
      onSuccess: ()=>{
        State.session={active:true, method:'face'};
        State.user.lastLogin = new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        State.logEvent('Login', 'Face authentication successful');
        State.save();
        toast('Access granted','ok');
        setTimeout(()=>nav('dashboard'), 500);
      }
    });
  };

  document.getElementById('pinLoginBtn').onclick = ()=>{
    box.innerHTML = `
      <div class="auth-head"><h2>Enter your PIN</h2><p>Normal PIN login</p></div>
      <div class="field"><div class="pin-wrap"><input type="password" id="loginPin" maxlength="6" placeholder="••••" autofocus><button type="button" class="pin-toggle" id="lpToggle">Show</button></div><div class="err" id="lpErr">Incorrect PIN.</div></div>
      <button class="btn btn-primary btn-block" id="lpSubmit">Sign in</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="lpBack">Back</button>`;
    document.getElementById('lpToggle').onclick = ()=>{ const i=document.getElementById('loginPin'); i.type = i.type==='password'?'text':'password'; };
    document.getElementById('lpBack').onclick = renderLoginHome;
    document.getElementById('lpSubmit').onclick = ()=>{
      const p = val('loginPin');
      if(p === State.user.emergencyPin){ triggerEmergencyMode(); return; }
      if(p !== State.user.normalPin){ document.getElementById('lpErr').style.display='block'; return; }
      State.session={active:true, method:'pin'}; State.logEvent('Login','PIN authentication successful'); State.save();
      toast('Welcome back','ok'); nav('dashboard');
    };
  };

  document.getElementById('emgBtn').onclick = ()=>{
    box.innerHTML = `
      <div class="auth-head"><h2 style="color:var(--danger)">Emergency PIN</h2><p>Entering this PIN activates the emergency protocol</p></div>
      <div class="field"><div class="pin-wrap"><input type="password" id="emgPin" maxlength="6" placeholder="••••"></div></div>
      <button class="btn btn-danger btn-block" id="emgSubmit">Confirm</button>
      <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="emgBack">Back</button>`;
    document.getElementById('emgBack').onclick = renderLoginHome;
    document.getElementById('emgSubmit').onclick = ()=>{
      if(val('emgPin') === State.user.emergencyPin){ State.session={active:true, method:'emergency'}; State.save(); triggerEmergencyMode(); }
      else toast('Incorrect PIN','danger');
    };
  };
}

/* =========================================================
   EMERGENCY MODE
========================================================= */
function triggerEmergencyMode(){
  const eventId = 'SOS-ICASH-2026-' + Math.floor(10000+Math.random()*89999);
  State.logEvent('Emergency', 'Emergency PIN detected — SOS protocol simulated ('+eventId+')');
  State.save();
  const scr = el(`
  <div class="emergency-screen">
    <div class="glass emg-card">
      <div class="emg-title">${iconSvg('alert')} EMERGENCY MODE ACTIVATED</div>
      <div class="emg-sub">SOS SIGNAL INITIATED — DEMO / SIMULATED</div>
      <div class="emg-row"><span>User</span><b>${State.user.name}</b></div>
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
    document.getElementById('safeConfirm').onclick = ()=>{
      if(val('safePin') !== State.user.normalPin){ toast('Incorrect PIN','danger'); return; }
      closeModal(); scr.remove();
      State.session={active:true, method:'pin'}; State.save();
      nav('dashboard');
    };
  };
}
