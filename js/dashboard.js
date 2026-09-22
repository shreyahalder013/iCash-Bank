/* =========================================================
   ICASH — Dashboard
========================================================= */
route('dashboard', function(){
  if(!requireAuth()) return;
  navbar();
  const spent = State.tx.filter(t=>t.type==='out').reduce((s,t)=>s+t.amount,0);
  const received = State.tx.filter(t=>t.type==='in').reduce((s,t)=>s+t.amount,0);
  const shell = el(`<div class="app-shell"><div class="wrap">
    ${State.user.seniorMode ? `<div class="senior-banner">${iconSvg('contact')} Senior Citizen Mode enabled — larger text, simplified navigation, extra confirmations.</div>` : ''}
    <div class="dash-grid">
      <div class="card balance-card">
        <div class="balance-label">Available Balance <span class="pill" style="margin-left:8px;">DEMO ACCOUNT</span></div>
        <div class="balance-amt">${fmtINR(State.balance)}</div>
        <div class="balance-sub">
          <div><b>${State.user.name}</b>Account holder</div>
          <div><b>${State.user.age} · ${State.user.senior?'Senior':'Standard'}</b>User type</div>
          <div><b>Face + PIN</b>Auth methods</div>
        </div>
      </div>
      <div class="mini-stats">
        <div class="card mini-stat"><div class="l">Total Spent</div><div class="v down">${fmtINR(spent)}</div></div>
        <div class="card mini-stat"><div class="l">Money Received</div><div class="v up">${fmtINR(received)}</div></div>
        <div class="card mini-stat"><div class="l">Money Sent</div><div class="v">${fmtINR(State.tx.filter(t=>t.desc.includes('Send')||t.cat==='Transfer').reduce((s,t)=>s+t.amount,0))}</div></div>
        <div class="card mini-stat"><div class="l">Monthly Expenses</div><div class="v down">${fmtINR(spent)}</div></div>
      </div>
    </div>
    <div class="section-title"><h3>Quick actions</h3></div>
    <div class="qa-grid">
      <button class="card qa" onclick="nav('withdraw')"><div class="ic">${iconSvg('withdraw')}</div><span>Withdraw</span></button>
      <button class="card qa" onclick="nav('send')"><div class="ic">${iconSvg('send')}</div><span>Send Money</span></button>
      <button class="card qa" onclick="nav('receive')"><div class="ic">${iconSvg('receive')}</div><span>Receive</span></button>
      <button class="card qa" onclick="nav('history')"><div class="ic">${iconSvg('history')}</div><span>History</span></button>
      <button class="card qa" onclick="nav('profile')"><div class="ic">${iconSvg('contact')}</div><span>Emergency Contact</span></button>
      <button class="card qa" onclick="nav('security')"><div class="ic">${iconSvg('shield')}</div><span>Face Security</span></button>
    </div>
    <div class="section-title"><h3>Recent transactions</h3><a href="#history" style="color:var(--accent); font-size:13px;">View all →</a></div>
    <div class="card" style="padding:8px 12px;" id="recentTxHolder"></div>
  </div></div>`);
  mount(shell);
  document.getElementById('recentTxHolder').appendChild(txTable(State.tx.slice(0,5)));
});

/* ---------- TRANSACTION TABLE HELPER ---------- */
function txTable(rows){
  const catIcon = {Food:'🍔',Cash:'🏧',Bills:'💡',Transport:'🚗',Healthcare:'🩺',Shopping:'🛍️',Other:'💳',Transfer:'↔️'};
  const table = el(`<table class="tx"><thead><tr><th>Description</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody></tbody></table>`);
  const tb = table.querySelector('tbody');
  rows.forEach(t=>{
    const amtClass = t.type==='in' ? 'amt-in' : t.type==='mid' ? 'amt-mid' : 'amt-out';
    const sign = t.type==='in' ? '+' : t.type==='mid' ? '' : '−';
    tb.appendChild(el(`<tr>
      <td><div class="tx-desc"><div class="tx-ic">${catIcon[t.cat]||(t.type==='in'?'⬇️':'⬆️')}</div><div><div>${t.desc}</div><div style="color:var(--muted2); font-size:11.5px;">${t.id}</div></div></div></td>
      <td style="color:var(--muted)">${t.date}</td>
      <td style="color:var(--muted)">${t.type==='in'?'Received':t.type==='mid'?'Transfer':'Spent'}</td>
      <td class="${amtClass}">${sign}${fmtINR(t.amount)}</td>
      <td><span class="pill ok">${t.status}</span></td>
    </tr>`));
  });
  return table;
}
