/* =========================================================
   ICASH — Core Application Module
   State management, router, helpers, navbar, modal, toast
========================================================= */

/* ---------- API BASE ---------- */
const API = (function() {
  if (typeof window !== 'undefined') {
    // If the frontend is accessed via file:// or a dev server on another port (e.g. Live Server on 5500)
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000')) {
      return 'http://localhost:3000/api';
    }
  }
  return '/api';
})();

/* ---------- DEFAULT TX (for seeding) ---------- */
const DEFAULT_TX = [
  {id:'TXN-9F21A', date:'2026-09-20', desc:'Salary Credit', type:'in', amount:5000, status:'Completed'},
  {id:'TXN-8C10B', date:'2026-09-19', desc:'Grocery Store', type:'out', cat:'Food', amount:1200, status:'Completed'},
  {id:'TXN-7A02D', date:'2026-09-18', desc:'ATM Withdrawal', type:'out', cat:'Cash', amount:2000, status:'Completed'},
  {id:'TXN-6E88F', date:'2026-09-16', desc:'Electricity Bill', type:'out', cat:'Bills', amount:500, status:'Completed'},
  {id:'TXN-5D77C', date:'2026-09-14', desc:'Cab Ride', type:'out', cat:'Transport', amount:750, status:'Completed'},
];

/* ---------- STATE ---------- */
const State = {
  user: null,
  tx: [],
  balance: 48750,
  session: null,
  events: [],

  async load(){
    try {
      const res = await fetch(API + '/user', { credentials: 'include' });
      if(res.ok){
        const data = await res.json();
        this.user = data.user;
        this.tx = data.transactions || [];
        this.balance = data.balance ?? 48750;
        this.session = data.session;
        this.events = data.events || [];
      } else {
        // No session — load defaults for landing page
        this.user = null;
        this.session = null;
        // Try loading user from localStorage as fallback (for offline / initial setup)
        this._loadLocal();
      }
    } catch(e) {
      console.warn('API unavailable, using localStorage fallback:', e.message);
      this._loadLocal();
    }
  },

  _loadLocal(){
    this.user = JSON.parse(localStorage.getItem('icash_user') || 'null');
    this.tx = JSON.parse(localStorage.getItem('icash_tx') || 'null') || DEFAULT_TX.slice();
    this.balance = parseFloat(localStorage.getItem('icash_balance') || '48750');
    this.events = JSON.parse(localStorage.getItem('icash_events') || '[]');
    // SECURITY FIX (VULN-10): Never restore session.active=true from localStorage.
    // An attacker could set localStorage to appear authenticated. Session validity
    // must ALWAYS be verified server-side via /api/user. We only restore non-auth
    // user metadata (name, phone) for display purposes on the login page.
    this.session = null;
    if(!this.user){
      this.user = {
        name:'Siddharth Pal', phone:'+91 98765 43210', aadhaar:'482145678921',
        email:'siddharth.demo@icash.app', dob:'1999-04-12', age: this.calcAge('1999-04-12'),
        senior:false,
        emergencyContact:{name:'Ravi Pal', phone:'+91 91234 56789', relation:'Father'},
        faceRegistered:true, lastLogin:'20 Sep 2026, 09:14', seniorMode:false
      };
      this._saveLocal();
    }
  },

  calcAge(dob){
    const d = new Date(dob); const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if(m < 0 || (m===0 && t.getDate() < d.getDate())) age--;
    return age;
  },

  async save(){
    // Save to API
    try {
      await fetch(API + '/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user: this.user,
          transactions: this.tx,
          balance: this.balance,
          session: this.session,
          events: this.events
        })
      });
    } catch(e) {
      // Fallback to localStorage
    }
    this._saveLocal();
  },

  _saveLocal(){
    localStorage.setItem('icash_user', JSON.stringify(this.user));
    localStorage.setItem('icash_tx', JSON.stringify(this.tx));
    localStorage.setItem('icash_balance', String(this.balance));
    localStorage.setItem('icash_session', JSON.stringify(this.session));
    localStorage.setItem('icash_events', JSON.stringify(this.events));
  },

  async logEvent(type, desc){
    this.events.unshift({
      type, desc,
      time: new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
    });
    this.events = this.events.slice(0,12);

    // Log to API
    try {
      await fetch(API + '/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, desc })
      });
    } catch(e) { /* fallback already saved locally */ }

    this._saveLocal();
  }
};

// Initial load (synchronous fallback for immediate render)
State._loadLocal();

/* ---------- ROUTER ---------- */
const routes = {};
function route(name, fn){ routes[name] = fn; }
function nav(name){ location.hash = '#'+name; }
function currentRoute(){ return (location.hash || '#landing').slice(1).split('?')[0]; }
window.addEventListener('hashchange', render);
// SECURITY FIX (VULN-4): requireAuth() must NOT trust localStorage for session validity.
// We check State.session which is now only populated by a successful server response
// (see State.load() and _loadLocal() fix). If session is missing, redirect to login.
// For synchronous route rendering we rely on the load() having been called at boot;
// any route that needs auth should also call State.load() and wait for it.
function requireAuth(){
  if(!State.session || !State.session.active){ nav('login'); return false; }
  return true;
}
function render(){
  const r = currentRoute();
  const fn = routes[r] || routes['landing'];
  document.getElementById('app').innerHTML = '';
  document.body.setAttribute('data-senior', State.user && State.user.seniorMode ? '1':'0');
  fn();
  window.scrollTo(0,0);
}

/* ---------- HELPERS ---------- */
function fmtINR(n){ return '₹' + Number(n).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function mount(node){ document.getElementById('app').appendChild(node); }
function toast(msg, kind){
  kind = kind || 'ok';
  const colors = {ok:'rgba(56,230,168,0.12)', warn:'rgba(242,184,75,0.14)', danger:'rgba(255,92,122,0.14)'};
  const borders = {ok:'rgba(56,230,168,0.4)', warn:'rgba(242,184,75,0.4)', danger:'rgba(255,92,122,0.4)'};
  const t = el(`<div class="toast glass" style="background:${colors[kind]}; border-color:${borders[kind]}">${msg}</div>`);
  document.getElementById('toastWrap').appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 3200);
}
function genTxId(){ return 'TXN-' + Math.random().toString(16).slice(2,7).toUpperCase(); }
function maskAadhaar(a){ return a ? 'XXXX XXXX ' + a.slice(-4) : ''; }
function val(id){ return (document.getElementById(id)?.value||'').trim(); }

function iconSvg(name){
  const icons = {
    withdraw:'<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    send:'<path d="M4 12l16-8-6 16-3-6-7-2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    receive:'<path d="M12 21V9m0 12l-4-4m4 4l4-4M5 5h14" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    contact:'<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    shield:'<path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    face:'<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9 15c1 1 5 1 6 0" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    check:'<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    alert:'<path d="M12 3l10 18H2L12 3zm0 7v4m0 3h.01" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20">${icons[name]||''}</svg>`;
}

/* ---------- NAV BAR ---------- */
function navbar(){
  const loggedIn = State.session && State.session.active;
  const active = currentRoute();
  const links = loggedIn
    ? [['dashboard','Dashboard'],['withdraw','Withdraw'],['send','Send Money'],['history','Transactions'],['analytics','Analytics'],['security','Security'],['profile','Profile']]
    : [['landing','Home'],['landing-features','Features'],['landing-security','Security'],['login','Login'],['register','Register']];
  const linkHtml = links.map(([r,label])=>{
    if(r.startsWith('landing-')) return `<a href="#landing" onclick="setTimeout(()=>document.getElementById('${r.split('-')[1]}')?.scrollIntoView({behavior:'smooth'}),50)">${label}</a>`;
    return `<a href="#${r}" class="${active===r?'active':''}">${label}</a>`;
  }).join('');
  const bar = el(`
  <div class="topnav">
    <div class="wrap row">
      <a href="#${loggedIn?'dashboard':'landing'}" class="brand"><span class="mark"></span>iCash</a>
      <div class="navlinks">${linkHtml}</div>
      <div class="navcta">
        ${loggedIn
          ? `<button class="btn btn-ghost btn-sm" id="atmBtn">ATM</button><button class="btn btn-outline btn-sm" id="logoutBtn">Logout</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="nav('login')">Login</button><button class="btn btn-primary btn-sm" onclick="nav('register')">Get Started</button>`}
      </div>
      <button class="hamb" id="hambBtn">☰</button>
    </div>
  </div>`);
  mount(bar);
  if(loggedIn){
    bar.querySelector('#logoutBtn').onclick = async ()=>{
      // SECURITY FIX (VULN-5): Always terminate the server session on logout.
      // Previously only localStorage was cleared — the server session remained active,
      // allowing session token reuse by anyone with access to the session cookie.
      try {
        await fetch(API + '/logout', { method: 'POST', credentials: 'include' });
      } catch(e) {
        console.warn('[Logout] Server logout request failed:', e.message);
      }
      State.session = null;
      State.user = null;
      localStorage.removeItem('icash_session');
      toast('Logged out securely');
      nav('landing');
    };
    bar.querySelector('#atmBtn').onclick = ()=> nav('atm');
  }
  bar.querySelector('#hambBtn').onclick = ()=>{
    const existing = links.map(([r,label])=>`<a href="#${r.startsWith('landing-')?'landing':r}" style="display:block;padding:12px 0;border-bottom:1px solid var(--border)">${label}</a>`).join('');
    openModal(`<div class="auth-head"><h2>Menu</h2></div>${existing}`);
  };
}

/* ---------- MODAL ---------- */
function openModal(innerHtml){
  closeModal();
  const bg = el(`<div class="modal-bg" id="modalBg"><div class="glass modal">${innerHtml}</div></div>`);
  bg.addEventListener('click', e=>{ if(e.target.id==='modalBg') closeModal(); });
  document.getElementById('app').appendChild(bg);
}
function closeModal(){ document.getElementById('modalBg')?.remove(); }
