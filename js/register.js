/* =========================================================
   ICASH — Registration Wizard
========================================================= */
const RegState = {};

route('register', function(){
  navbar();
  RegState.step = RegState.step || 1;
  const shell = el(`<div class="auth-shell"><div class="glass auth-card wide" id="wizBox"></div></div>`);
  mount(shell);
  renderWizardStep();
});

function wizProgressHtml(step){
  let h = '<div class="wizard-progress">';
  for(let i=1;i<=4;i++) h += `<i class="${i<step?'done':i===step?'active':''}"></i>`;
  return h+'</div>';
}

function renderWizardStep(){
  const box = document.getElementById('wizBox');
  if(!box) return;
  const step = RegState.step;

  if(step===1) box.innerHTML = `
    <div class="auth-head"><h2>Create your iCash ID</h2><p>Step 1 of 4 — Personal information</p></div>
    ${wizProgressHtml(1)}
    <div class="field"><label>Full name</label><input id="rFullName" placeholder="Your full name" value="${RegState.name||''}"></div>
    <div class="row2">
      <div class="field"><label>Phone number</label><input id="rPhone" placeholder="+91 XXXXX XXXXX" value="${RegState.phone||''}"></div>
      <div class="field"><label>Date of birth</label><input type="date" id="rDob" value="${RegState.dob||''}"></div>
    </div>
    <div class="field"><label>Aadhaar number <span class="pill" style="margin-left:6px;">Demo only</span></label><input id="rAadhaar" placeholder="12-digit demo Aadhaar" maxlength="12" value="${RegState.aadhaar||''}"></div>
    <div class="field"><label>Email address</label><input type="email" id="rEmail" placeholder="you@email.com" value="${RegState.email||''}"></div>
    <div id="ageBadge"></div>
    <div class="wizard-footer"><span></span><button class="btn btn-primary" id="next1">Continue</button></div>`;

  if(step===1){
    document.getElementById('rDob').addEventListener('change', e=>{
      const age = State.calcAge(e.target.value);
      document.getElementById('ageBadge').innerHTML = e.target.value ? `<div class="classify-badge">${iconSvg('contact')} Classified as <b>${age>=60?'Senior Citizen / Elderly User':'Standard User'}</b> (age ${age})</div>` : '';
    });
    document.getElementById('next1').onclick = ()=>{
      const name=val('rFullName'), phone=val('rPhone'), dob=val('rDob'), aadhaar=val('rAadhaar'), email=val('rEmail');
      if(!name||!phone||!dob||!aadhaar||!email){ toast('Please fill in every field','warn'); return; }
      if(aadhaar.length!==12 || !/^\d+$/.test(aadhaar)){ toast('Enter a 12-digit demo Aadhaar number','warn'); return; }
      RegState.name=name; RegState.phone=phone; RegState.dob=dob; RegState.aadhaar=aadhaar; RegState.email=email;
      RegState.age = State.calcAge(dob); RegState.senior = RegState.age>=60;
      RegState.step=2; renderWizardStep();
    };
  }

  if(step===2) box.innerHTML = `
    <div class="auth-head"><h2>Secure your account</h2><p>Step 2 of 4 — PIN setup</p></div>
    ${wizProgressHtml(2)}
    <div class="field"><label>Normal PIN (4–6 digits)</label><div class="pin-wrap"><input type="password" id="rPin" maxlength="6" placeholder="••••"><button type="button" class="pin-toggle" data-t="rPin">Show</button></div><div class="strength"><i id="pinStrength"></i></div></div>
    <div class="field"><label>Confirm normal PIN</label><div class="pin-wrap"><input type="password" id="rPin2" maxlength="6" placeholder="••••"><button type="button" class="pin-toggle" data-t="rPin2">Show</button></div><div class="err" id="pinErr">PINs don't match</div></div>
    <div class="field"><label>Emergency PIN (different from normal PIN)</label><div class="pin-wrap"><input type="password" id="rEPin" maxlength="6" placeholder="••••"><button type="button" class="pin-toggle" data-t="rEPin">Show</button></div>
      <div class="hint">Your Emergency PIN activates the emergency assistance protocol.</div></div>
    <div class="wizard-footer"><button class="btn btn-ghost" id="back2">Back</button><button class="btn btn-primary" id="next2">Continue</button></div>`;

  box.querySelectorAll?.('.pin-toggle')?.forEach?.(b=>{
    b.onclick = ()=>{ const i=document.getElementById(b.dataset.t); if(i.type==='password'){i.type='text'; b.textContent='Hide';} else {i.type='password'; b.textContent='Show';} };
  });
  const pinInput = document.getElementById('rPin');
  if(pinInput) pinInput.addEventListener('input', e=>{
    const v=e.target.value; const bar=document.getElementById('pinStrength');
    let pct = Math.min(100, v.length*20); let color = v.length<4?'#ff5c7a':v.length<6?'#f2b84b':'#38e6a8';
    bar.style.width=pct+'%'; bar.style.background=color;
  });

  if(step===2){
    document.getElementById('back2').onclick=()=>{RegState.step=1; renderWizardStep();};
    document.getElementById('next2').onclick=()=>{
      const p=val('rPin'), p2=val('rPin2'), ep=val('rEPin');
      if(p.length<4||p.length>6||!/^\d+$/.test(p)){ toast('Normal PIN must be 4–6 digits','warn'); return; }
      if(p!==p2){ document.getElementById('rPin2').closest('.field').classList.add('invalid'); return; }
      document.getElementById('rPin2').closest('.field').classList.remove('invalid');
      if(!ep||ep.length<4||ep.length>6||!/^\d+$/.test(ep)){ toast('Set an Emergency PIN (4–6 digits)','warn'); return; }
      if(ep===p){ toast('Emergency PIN must differ from your normal PIN','warn'); return; }
      RegState.pin=p; RegState.epin=ep; RegState.step=3; renderWizardStep();
    };
  }

  if(step===3) box.innerHTML = `
    <div class="auth-head"><h2>Emergency contact</h2><p>Step 3 of 4 — who can assist you</p></div>
    ${wizProgressHtml(3)}
    <p style="color:var(--muted); font-size:13px; margin-bottom:16px;">Your emergency contact can be authorized to assist with transactions when you are unable to access your account.</p>
    <div class="field"><label>Contact name</label><input id="rEcName" placeholder="Full name" value="${RegState.ec?.name||''}"></div>
    <div class="row2">
      <div class="field"><label>Phone number</label><input id="rEcPhone" placeholder="+91 XXXXX XXXXX" value="${RegState.ec?.phone||''}"></div>
      <div class="field"><label>Relationship</label>
        <select id="rEcRel">
          ${['Father','Mother','Brother','Sister','Spouse','Guardian','Other'].map(r=>`<option ${RegState.ec?.relation===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="wizard-footer"><button class="btn btn-ghost" id="back3">Back</button><button class="btn btn-primary" id="next3">Continue</button></div>`;

  if(step===3){
    document.getElementById('back3').onclick=()=>{RegState.step=2; renderWizardStep();};
    document.getElementById('next3').onclick=()=>{
      const n=val('rEcName'), p=val('rEcPhone'), r=val('rEcRel');
      if(!n||!p){ toast('Add your emergency contact details','warn'); return; }
      RegState.ec = {name:n, phone:p, relation:r};
      RegState.step=4; renderWizardStep();
    };
  }

  if(step===4) box.innerHTML = `
    <div class="auth-head"><h2>Secure face registration</h2><p>Step 4 of 4 — liveness verification</p></div>
    ${wizProgressHtml(4)}
    <div id="faceRegHolder"></div>
    <div class="demo-tag">DEMO / SIMULATED biometric capture — nothing leaves your browser</div>
    <div class="wizard-footer"><button class="btn btn-ghost" id="back4">Back</button><span></span></div>`;

  if(step===4){
    document.getElementById('back4').onclick=()=>{RegState.step=3; renderWizardStep();};
    mountFaceScanner(document.getElementById('faceRegHolder'), {
      mode:'register', senior:RegState.senior,
      onSuccess: async (result)=>{
        // SECURITY FIX (VULN-2): Validate that we actually captured a real 128-d template
        if (!result || !result.biometricTemplate || !Array.isArray(result.biometricTemplate) || result.biometricTemplate.length !== 128) {
          toast('Biometric capture failed — no valid face template produced. Please retry.', 'danger');
          return;
        }

        State.user = {
          name:RegState.name, phone:RegState.phone, aadhaar:RegState.aadhaar, email:RegState.email,
          dob:RegState.dob, age:RegState.age, senior:RegState.senior,
          normalPin:RegState.pin, emergencyPin:RegState.epin, emergencyContact:RegState.ec,
          faceRegistered:true, lastLogin:'Just now', seniorMode:RegState.senior
        };
        State.tx = DEFAULT_TX.slice(); State.balance = 48750;

        // Register via API — MUST include biometricTemplate or face login will never work
        try {
          const res = await fetch(API + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              user: State.user,
              transactions: State.tx,
              balance: State.balance,
              biometricTemplate: result.biometricTemplate  // ← CRITICAL fix: was missing
            })
          });
          const d = await res.json();
          if (!res.ok) {
            toast(d.error || 'Registration failed — please try again.', 'danger');
            return;
          }
          // Load authenticated session from server response
          await State.load();
        } catch(e) {
          console.warn('[Register] API unavailable, falling back to localStorage:', e.message);
          State.session = {active:true, method:'register'};
        }

        State.logEvent('Registration', 'iCash ID created — face identity enrolled');
        State.save();
        toast('Face identity registered ✓','ok');
        setTimeout(()=>nav('dashboard'), 900);
      }
    });

  }
}
