/* =========================================================
   ICASH — Send Money
========================================================= */
route('send', function(){
  if(!requireAuth()) return;
  navbar();
  const shell = el(`<div class="auth-shell"><div class="glass auth-card" id="sendBox"></div></div>`);
  mount(shell);
  document.getElementById('sendBox').innerHTML = `
    <div class="auth-head"><h2>Send money</h2><p>Transfer to another iCash user</p></div>
    <div class="field"><label>Recipient name</label><input id="snName" placeholder="Recipient's full name"></div>
    <div class="field"><label>Account / UPI ID</label><input id="snAcc" placeholder="name@icash or account number"></div>
    <div class="field"><label>Amount</label><input id="snAmt" type="number" placeholder="₹0"></div>
    <div class="field"><label>Note (optional)</label><input id="snNote" placeholder="What's this for?"></div>
    <button class="btn btn-primary btn-block" id="snReview">Review transaction</button>`;
  document.getElementById('snReview').onclick = ()=>{
    const name=val('snName'), acc=val('snAcc'), amt=parseFloat(val('snAmt'))||0, note=val('snNote');
    if(!name||!acc||!amt){ toast('Fill in recipient and amount','warn'); return; }
    if(amt>State.balance){ toast('Insufficient demo balance.','danger'); return; }
    const fee = Math.round(amt*0.005);
    renderSendReview({name,acc,amt,note,fee});
  };
});

function renderSendReview(d){
  const box = document.getElementById('sendBox');
  box.innerHTML = `
    <div class="auth-head"><h2>Review transaction</h2></div>
    <div class="review-row"><span>Recipient</span><span>${d.name}</span></div>
    <div class="review-row"><span>Account / UPI</span><span>${d.acc}</span></div>
    <div class="review-row"><span>Amount</span><span>${fmtINR(d.amt)}</span></div>
    <div class="review-row"><span>Transaction fee</span><span>${fmtINR(d.fee)}</span></div>
    <div class="review-row"><span>Total</span><span>${fmtINR(d.amt+d.fee)}</span></div>
    <button class="btn btn-primary btn-block" style="margin-top:18px;" id="snAuth">Authenticate & send</button>
    <button class="btn btn-ghost btn-block" style="margin-top:10px;" id="snBack">Back</button>`;
  document.getElementById('snBack').onclick = ()=> routes['send'] ? routes['send']() : nav('send');
  document.getElementById('snAuth').onclick = ()=>{
    box.innerHTML = `<div class="auth-head"><h2>Face authentication</h2><p>Confirm it's you to send ${fmtINR(d.amt)}</p></div><div id="snFaceHolder"></div>`;
    mountFaceScanner(document.getElementById('snFaceHolder'), {
      onSuccess: ()=>{
        State.balance -= (d.amt+d.fee);
        const id = genTxId();
        State.tx.unshift({id, date:new Date().toISOString().slice(0,10), desc:'Sent to '+d.name, type:'out', cat:'Transfer', amount:d.amt, status:'Completed'});
        State.logEvent('Transaction', `Sent ${fmtINR(d.amt)} to ${d.name} — ${id}`);
        State.save();
        box.innerHTML = `
          <div class="success-anim">
            <div class="check-circle">${iconSvg('check')}</div>
            <h2 style="font-family:var(--font-d); margin-bottom:6px;">Transaction Successful ✓</h2>
            <p style="color:var(--muted); margin-bottom:16px;">${fmtINR(d.amt)} sent to ${d.name}</p>
            <div class="review-row"><span>Transaction ID</span><span>${id}</span></div>
            <div class="review-row"><span>New balance</span><span>${fmtINR(State.balance)}</span></div>
            <button class="btn btn-primary btn-block" style="margin-top:20px;" onclick="nav('dashboard')">Back to Dashboard</button>
          </div>`;
      }
    });
  };
}
