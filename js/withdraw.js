/* =========================================================
   ICASH — Withdraw
========================================================= */
route('withdraw', function(){
  if(!requireAuth()) return;
  navbar();
  const shell = el(`<div class="auth-shell"><div class="glass auth-card" id="wdBox"></div></div>`);
  mount(shell); renderWithdraw();
});

function renderWithdraw(amount){
  const box = document.getElementById('wdBox');
  box.innerHTML = `
    <div class="auth-head"><h2>Withdraw money</h2><p>Available balance: ${fmtINR(State.balance)}</p></div>
    <div class="chip-row" id="chipRow">
      ${[500,1000,2000,5000].map(a=>`<button class="chip" data-a="${a}">₹${a}</button>`).join('')}
      <button class="chip" data-a="custom">Custom</button>
    </div>
    <div class="big-amt-wrap"><span class="cur">₹</span><input class="big-amt-input" id="wdAmt" type="number" placeholder="0" value="${amount||''}"></div>
    <button class="btn btn-primary btn-block" id="wdNext" style="margin-top:14px;">Continue</button>`;

  box.querySelectorAll('.chip').forEach(c=>{
    c.onclick = ()=>{
      box.querySelectorAll('.chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      if(c.dataset.a!=='custom') document.getElementById('wdAmt').value = c.dataset.a;
      else document.getElementById('wdAmt').focus();
    };
  });

  document.getElementById('wdNext').onclick = ()=>{
    const amt = parseFloat(document.getElementById('wdAmt').value);
    if(!amt || amt<=0){ toast('Enter a withdrawal amount','warn'); return; }
    if(amt > State.balance){ toast('Insufficient demo balance.','danger'); return; }
    box.innerHTML = `<div class="auth-head"><h2>Verify it's you</h2><p>Face verification required to withdraw ${fmtINR(amt)}</p></div><div id="wdFaceHolder"></div>`;
    mountFaceScanner(document.getElementById('wdFaceHolder'), {
      onSuccess: ()=>{
        box.innerHTML = `
          <div class="auth-head"><h2>Confirm with PIN</h2><p>Enter your normal PIN to finish</p></div>
          <div class="field"><input type="password" id="wdPin" maxlength="6" placeholder="••••"></div>
          <button class="btn btn-primary btn-block" id="wdPinSubmit">Confirm withdrawal</button>`;
        document.getElementById('wdPinSubmit').onclick = ()=>{
          if(val('wdPin') !== State.user.normalPin){ toast('Incorrect PIN.','danger'); return; }
          State.balance -= amt;
          const id = genTxId();
          State.tx.unshift({id, date:new Date().toISOString().slice(0,10), desc:'ATM Withdrawal', type:'out', cat:'Cash', amount:amt, status:'Completed'});
          State.logEvent('Transaction', `Withdrew ${fmtINR(amt)} — ${id}`);
          State.save();
          box.innerHTML = `
            <div class="success-anim">
              <div class="check-circle">${iconSvg('check')}</div>
              <h2 style="font-family:var(--font-d); margin-bottom:6px;">Withdrawal Successful</h2>
              <p style="color:var(--muted); margin-bottom:16px;">${fmtINR(amt)} withdrawn</p>
              <div class="review-row"><span>Transaction ID</span><span>${id}</span></div>
              <div class="review-row"><span>Remaining balance</span><span>${fmtINR(State.balance)}</span></div>
              <button class="btn btn-primary btn-block" style="margin-top:20px;" onclick="nav('dashboard')">Back to Dashboard</button>
            </div>`;
        };
      }
    });
  };
}
