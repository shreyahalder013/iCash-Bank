/* =========================================================
   ICASH — Express API Server
   Serves the frontend and provides REST APIs backed by SQLite
========================================================= */
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: 'icash-demo-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */
function requireSession(req, res, next){
  if(!req.session.userId){
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/* =========================================================
   API ROUTES
========================================================= */

/* ---------- REGISTER ---------- */
app.post('/api/register', (req, res) => {
  try {
    const { user, transactions, balance } = req.body;
    if(!user || !user.name || !user.normalPin){
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userId = db.createUser(user);

    // Insert seed transactions
    if(transactions && Array.isArray(transactions)){
      for(const tx of transactions){
        db.createTransaction(userId, tx);
      }
    }

    // Update balance if provided
    if(balance !== undefined){
      db.updateUser(userId, { balance });
    }

    // Create session
    req.session.userId = userId;
    db.createSession(userId, 'register');
    db.logSecurityEvent(userId, 'Registration', 'iCash ID created — face identity registered');

    res.json({ success: true, userId });
  } catch(e){
    console.error('Register error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LOGIN ---------- */
app.post('/api/login', (req, res) => {
  try {
    const { method, pin } = req.body;

    // For demo, get the first user (single-user demo)
    const user = db.getFirstUser();
    if(!user){
      return res.status(404).json({ error: 'No user registered' });
    }

    if(method === 'pin'){
      if(pin === user.emergencyPin){
        return res.json({ success: true, emergency: true, userId: user.id });
      }
      if(pin !== user.normalPin){
        return res.status(401).json({ error: 'Incorrect PIN' });
      }
    }

    // Create session
    req.session.userId = user.id;
    db.createSession(user.id, method || 'face');
    db.logSecurityEvent(user.id, 'Login', `${method || 'Face'} authentication successful`);

    // Update last login
    const now = new Date().toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
    db.updateUser(user.id, { lastLogin: now });

    res.json({ success: true, userId: user.id });
  } catch(e){
    console.error('Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LOGOUT ---------- */
app.post('/api/logout', (req, res) => {
  if(req.session.userId){
    db.deactivateSession(req.session.userId);
  }
  req.session.destroy();
  res.json({ success: true });
});

/* ---------- GET USER (+ full state) ---------- */
app.get('/api/user', (req, res) => {
  try {
    let userId = req.session.userId;

    // If no session, try first user for demo mode
    if(!userId){
      const firstUser = db.getFirstUser();
      if(!firstUser) return res.status(404).json({ error: 'No user found' });
      // Don't create session, just return user data for landing page
      return res.json({
        user: firstUser,
        transactions: db.getTransactions(firstUser.id),
        balance: firstUser.balance,
        session: null,
        events: db.getSecurityEvents(firstUser.id)
      });
    }

    const user = db.getUserById(userId);
    if(!user) return res.status(404).json({ error: 'User not found' });

    const activeSession = db.getActiveSession(userId);

    res.json({
      user,
      transactions: db.getTransactions(userId),
      balance: user.balance,
      session: activeSession ? { active: true, method: activeSession.method } : null,
      events: db.getSecurityEvents(userId)
    });
  } catch(e){
    console.error('Get user error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- UPDATE USER ---------- */
app.put('/api/user', (req, res) => {
  try {
    let userId = req.session.userId;
    if(!userId){
      const firstUser = db.getFirstUser();
      if(firstUser) userId = firstUser.id;
      else return res.status(401).json({ error: 'Not authenticated' });
    }

    const { user, transactions, balance, session: sessionData, events } = req.body;

    // Update user fields
    if(user){
      db.updateUser(userId, {
        name: user.name,
        phone: user.phone,
        email: user.email,
        seniorMode: user.seniorMode,
        lastLogin: user.lastLogin,
        normalPin: user.normalPin,
        emergencyPin: user.emergencyPin,
        emergencyContact: user.emergencyContact
      });
    }

    // Update balance
    if(balance !== undefined){
      db.updateUser(userId, { balance });
    }

    // Handle session
    if(sessionData){
      if(sessionData.active){
        db.createSession(userId, sessionData.method || 'unknown');
        req.session.userId = userId;
      } else {
        db.deactivateSession(userId);
      }
    }

    // Sync transactions if provided
    if(transactions && Array.isArray(transactions)){
      const existing = db.getTransactions(userId);
      const existingIds = new Set(existing.map(t => t.id));

      for(const tx of transactions){
        if(!existingIds.has(tx.id)){
          db.createTransaction(userId, tx);
        }
      }
    }

    res.json({ success: true });
  } catch(e){
    console.error('Update user error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- TRANSACTIONS ---------- */
app.get('/api/transactions', requireSession, (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      date: req.query.date,
      search: req.query.search
    };
    const txs = db.getTransactions(req.session.userId, filters);
    res.json(txs);
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transactions', requireSession, (req, res) => {
  try {
    const tx = req.body;
    db.createTransaction(req.session.userId, tx);

    if(req.body.updateBalance !== undefined){
      db.updateUser(req.session.userId, { balance: req.body.updateBalance });
    }

    res.json({ success: true });
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

/* ---------- BALANCE ---------- */
app.get('/api/balance', requireSession, (req, res) => {
  try {
    const user = db.getUserById(req.session.userId);
    res.json({ balance: user.balance });
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

/* ---------- SECURITY EVENTS ---------- */
app.get('/api/events', (req, res) => {
  try {
    const userId = req.session.userId;
    if(!userId){
      const firstUser = db.getFirstUser();
      if(!firstUser) return res.json([]);
      return res.json(db.getSecurityEvents(firstUser.id));
    }
    res.json(db.getSecurityEvents(userId));
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', (req, res) => {
  try {
    let userId = req.session.userId;
    if(!userId){
      const firstUser = db.getFirstUser();
      if(firstUser) userId = firstUser.id;
      else return res.status(401).json({ error: 'Not authenticated' });
    }
    const { type, desc } = req.body;
    db.logSecurityEvent(userId, type, desc);
    res.json({ success: true });
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   START SERVER (async for sql.js initialization)
========================================================= */
async function start(){
  // Initialize database
  await db.initDb();

  app.listen(PORT, () => {
    console.log(`
  ┌──────────────────────────────────────────┐
  │   iCash Banking Server                    │
  │   Running on http://localhost:${PORT}        │
  │   SQLite database: server/icash.db        │
  └──────────────────────────────────────────┘
    `);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
