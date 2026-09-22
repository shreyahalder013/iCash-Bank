/* =========================================================
   ICASH — ATM Simulation
========================================================= */
route('atm', function(){
  if(!requireAuth()) return;
  navbar();
  const shell = el(`<div class="auth-shell"><div class="glass auth-card" id="atmBox" style="background:linear-gradient(160deg,#0d1b26,#080b11); border-color:var(--border-hi);"></div></div>`);
  mount(shell);
  renderAtmWelcome();
});

function renderAtmWelcome(){
  const box = document.getElementById('atmBox');
  box.innerHTML = `
    <div class="auth-head"><div class="eyebrow" style="justify-content:center;">iCASH ATM · DEMO KIOSK</div><h2 style="margin-top:8px;">Welcome to iCash</h2><p>No card needed — authenticate with your face</p></div>
    <button class="btn btn-primary btn-block" id="atmAuthBtn">${iconSvg('face')} Authenticate with Face</button>`;
  document.getElementById('atmAuthBtn').onclick = ()=>{
    box.innerHTML = `<div class="auth-head"><h2>Verifying</h2></div><div id="atmFaceHolder"></div>`;
    mountFaceScanner(document.getElementById('atmFaceHolder'), {
      onSuccess: ()=>{
        box.innerHTML = `
          <div class="auth-head"><h2>Welcome, ${State.user.name.split(' ')[0]}</h2><p>Available balance</p></div>
          <div class="balance-amt" style="text-align:center; margin-bottom:20px;">${fmtINR(State.balance)}</div>
          <div class="qa-grid" style="grid-template-columns:repeat(2,1fr);">
            <button class="card qa" onclick="nav('withdraw')"><div class="ic">${iconSvg('withdraw')}</div><span>Withdraw</span></button>
            <button class="card qa" onclick="toast('Demo deposits aren\\'t enabled in this prototype','warn')"><div class="ic">${iconSvg('receive')}</div><span>Deposit</span></button>
            <button class="card qa" onclick="nav('send')"><div class="ic">${iconSvg('send')}</div><span>Send Money</span></button>
            <button class="card qa" onclick="nav('history')"><div class="ic">${iconSvg('history')}</div><span>Check Balance</span></button>
          </div>
          <button class="btn btn-outline btn-block" style="margin-top:16px; color:var(--danger); border-color:rgba(255,92,122,0.35);" onclick="nav('login')">${iconSvg('alert')} Emergency Assistance</button>
        `;
      }
    });
  };
}
