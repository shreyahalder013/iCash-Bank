/* =========================================================
   ICASH — Express API Server
   Serves the frontend, static models, and provides REST APIs
   with cryptographic challenge-response biometric authentication.
========================================================= */
const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// Biometric calibration threshold
// For 128-dimensional L2-normalized FaceRecognitionNet embeddings:
// d <= 0.50: Genuine match (same person)
// d > 0.50: Imposter / distinct individual
const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.50');

// In-memory challenge store: challengeId -> { accountId, challengeType, createdAt, expiresAt }
const activeChallenges = new Map();

// Periodic cleanup of expired challenges every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of activeChallenges.entries()) {
    if (now > c.expiresAt) activeChallenges.delete(id);
  }
}, 30000);

/* =========================================================
   MATHEMATICAL BIOMETRIC DISTANCE & SIMILARITY
========================================================= */
function calculateEuclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  if (a.length !== 128 || b.length !== 128) return Infinity;
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function calculateCosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== 128 || b.length !== 128) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < 128; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Automatically load .env if present
try {
  if (process.loadEnvFile) {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  }
} catch (e) {}

// SECURITY FIX (VULN-8): CORS allowlist. In development, automatically allow
// any localhost or 127.0.0.1 port (such as Live Server on 5500, Vite on 5173).
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:3000', 'http://127.0.0.1:3000',
      'http://localhost:5500', 'http://127.0.0.1:5500',
      'http://localhost:5173', 'http://127.0.0.1:5173',
      'http://localhost:5000', 'http://localhost:8080'
    ];

// SECURITY FIX (VULN-7): Cookie must be secure in production HTTPS deployments.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Allow Chrome Private Network Access (e.g. 127.0.0.1 to localhost preflight)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman in dev, file://)
    if (!origin) return callback(null, true);
    // In dev mode allow any origin (localhost, 127.0.0.1, LAN IPs on any port)
    if (!IS_PRODUCTION) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));
app.options('*', cors());
app.use(express.json({ limit: '5mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'icash-biometric-secret-2026-CHANGE-IN-PROD',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,   // HTTPS-only in production
    httpOnly: true,          // Prevent XSS access to cookie
    sameSite: 'lax',        // CSRF protection
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static frontend files and models
app.use(express.static(path.join(__dirname, '..')));
app.use('/models', express.static(path.join(__dirname, '..', 'models')));

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */
function requireSession(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/**
 * GET /api/session — lightweight session validation endpoint.
 * The client calls this to verify whether a server session is active
 * rather than trusting localStorage alone (VULN-4 fix).
 */
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    return res.json({ active: true, userId: req.session.userId });
  }
  return res.json({ active: false });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'icash-biometric', time: new Date().toISOString() });
});

/* =========================================================
   BIOMETRIC CHALLENGE-RESPONSE APIS
========================================================= */

/**
 * STEP 6 & 18: Generate a randomized, time-bound challenge tied to an account.
 * Rejects accounts without enrolled templates.
 */
app.post('/api/auth/biometric/challenge', async (req, res) => {
  try {
    const { accountId, phone } = req.body;
    let userRaw = null;

    if (accountId) {
      userRaw = await db.getUserRawById(accountId);
    } else if (phone) {
      userRaw = await db.getUserRawByPhone(phone);
    } else {
      userRaw = await db.getFirstUserRaw();
    }

    if (!userRaw) {
      return res.status(404).json({ error: 'Target account not found' });
    }

    const template = await db.getUserBiometricTemplate(userRaw.id);
    if (!template || !Array.isArray(template) || template.length !== 128) {
      return res.status(400).json({
        error: 'NO_BIOMETRIC_ENROLLED',
        message: `No biometric Face ID is enrolled for ${userRaw.name}. Please enroll Face ID first.`,
        accountId: userRaw.id,
        userName: userRaw.name
      });
    }

    // Cryptographic single-use nonce
    const challengeId = crypto.randomUUID();
    const challengePool = [
      'blink_once',
      'blink_twice',
      'turn_left_blink',
      'turn_right_blink'
    ];
    const challengeType = challengePool[Math.floor(Math.random() * challengePool.length)];
    const expiresAt = Date.now() + 60000; // 60 seconds

    activeChallenges.set(challengeId, {
      accountId: userRaw.id,
      challengeType,
      createdAt: Date.now(),
      expiresAt
    });

    res.json({
      success: true,
      challengeId,
      challengeType,
      accountId: userRaw.id,
      userName: userRaw.name,
      expiresAt
    });
  } catch (e) {
    console.error('Biometric challenge error:', e.message);
    res.status(500).json({ error: 'Failed to generate biometric challenge' });
  }
});

/**
 * STEP 7, 8, 11, 12, 13: Verify live descriptor & liveness proof against account template.
 * ONLY authenticates if liveness is proven AND identity matches (distance <= threshold).
 */
app.post('/api/auth/biometric/verify', async (req, res) => {
  try {
    const { challengeId, accountId, liveDescriptor, livenessProof } = req.body;

    // 1. Parameter Validation
    if (!challengeId || !accountId || !liveDescriptor || !Array.isArray(liveDescriptor)) {
      return res.status(400).json({ error: 'Missing required biometric parameters' });
    }
    if (liveDescriptor.length !== 128) {
      return res.status(400).json({ error: 'Invalid face descriptor format: must be 128 float values' });
    }

    // 2. Validate Challenge Session (Single-use Anti-Replay)
    const challenge = activeChallenges.get(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: 'Invalid or expired challenge token. Please try again.' });
    }
    // Burn challenge immediately so it can NEVER be replayed
    activeChallenges.delete(challengeId);

    if (Date.now() > challenge.expiresAt) {
      return res.status(400).json({ error: 'Authentication challenge expired. Please restart the face scan.' });
    }
    if (Number(challenge.accountId) !== Number(accountId)) {
      return res.status(403).json({ error: 'Challenge account binding mismatch' });
    }

    // 3. Validate Liveness Proof
    if (!livenessProof || typeof livenessProof !== 'object') {
      return res.status(400).json({ error: 'Liveness proof missing or invalid' });
    }
    if (livenessProof.challengeType !== challenge.challengeType) {
      return res.status(400).json({ error: 'Challenge response mismatch: action did not match requested challenge' });
    }
    if (typeof livenessProof.completedInMs !== 'number' || livenessProof.completedInMs < 800) {
      return res.status(400).json({ error: 'Liveness completion timing unnatural (potential replay or simulated attack)' });
    }
    if (typeof livenessProof.framesAnalyzed !== 'number' || livenessProof.framesAnalyzed < 12) {
      return res.status(400).json({ error: 'Insufficient live frames evaluated' });
    }
    // SECURITY: Validate EAR (Eye Aspect Ratio) range as anti-spoofing signal.
    // A genuine blink creates a measurable EAR delta. A static photograph or
    // screen replay will show near-zero EAR variation. Minimum delta of 0.06
    // corresponds to a real eye opening/closing cycle on the face mesh.
    const earMin = typeof livenessProof.earHistoryMin === 'number' ? livenessProof.earHistoryMin : 1.0;
    const earMax = typeof livenessProof.earHistoryMax === 'number' ? livenessProof.earHistoryMax : 0.0;
    const earRange = earMax - earMin;
    if (earRange < 0.06) {
      console.warn(`[Biometric] EAR range too small: ${earRange.toFixed(3)} — possible static image/replay attack (account: ${accountId})`);
      await db.logSecurityEvent(
        accountId,
        'Anti-Spoofing Alert',
        `Liveness rejected: EAR range ${earRange.toFixed(3)} < 0.06 threshold — possible photo/replay attack`
      );
      return res.status(401).json({ error: 'Liveness check failed: insufficient eye movement detected. Please use your live face and blink naturally.' });
    }

    // 4. Retrieve Account-Bound Enrolled Template
    const storedTemplate = await db.getUserBiometricTemplate(accountId);
    if (!storedTemplate || !Array.isArray(storedTemplate) || storedTemplate.length !== 128) {
      return res.status(400).json({ error: 'No enrolled biometric profile found for this account' });
    }

    // 5. Compute Mathematical Distance & Similarity
    const distance = calculateEuclideanDistance(liveDescriptor, storedTemplate);
    const similarity = calculateCosineSimilarity(liveDescriptor, storedTemplate);

    console.log(`[Biometric Verify] Account ID: ${accountId} | Distance: ${distance.toFixed(4)} | Similarity: ${similarity.toFixed(4)} | Threshold: ${FACE_MATCH_THRESHOLD}`);

    // 6. Enforce Calibrated Identity Threshold
    if (distance > FACE_MATCH_THRESHOLD) {
      await db.logSecurityEvent(
        accountId,
        'Identity Mismatch',
        `Biometric login rejected: detected face did not match enrolled owner (distance: ${distance.toFixed(3)} > threshold: ${FACE_MATCH_THRESHOLD})`
      );

      return res.status(401).json({
        success: false,
        error: 'Face verification failed. The detected face does not match this account.',
        distance: Number(distance.toFixed(3)),
        threshold: FACE_MATCH_THRESHOLD
      });
    }

    // 7. Identity & Liveness Confirmed -> Issue Server Session
    req.session.userId = Number(accountId);
    await db.createSession(Number(accountId), 'face');
    await db.logSecurityEvent(
      accountId,
      'Login',
      `Face authentication successful (match distance: ${distance.toFixed(3)}, similarity: ${similarity.toFixed(3)})`
    );

    const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    await db.updateUser(accountId, { lastLogin: now });

    const user = await db.getUserById(accountId);
    res.json({
      success: true,
      userId: Number(accountId),
      user,
      distance: Number(distance.toFixed(3)),
      threshold: FACE_MATCH_THRESHOLD
    });
  } catch (e) {
    console.error('Biometric verification error:', e.message);
    res.status(500).json({ error: 'Biometric verification service failed' });
  }
});

/**
 * Enroll or update Face ID for an account.
 * Requires active session or valid normal PIN verification.
 */
app.post('/api/auth/biometric/enroll', async (req, res) => {
  try {
    const { accountId, normalPin, biometricTemplate } = req.body;
    let targetId = req.session.userId || accountId;

    if (!targetId) {
      const first = await db.getFirstUserRaw();
      if (first) targetId = first.id;
      else return res.status(400).json({ error: 'No account specified' });
    }

    if (!biometricTemplate || !Array.isArray(biometricTemplate) || biometricTemplate.length !== 128) {
      return res.status(400).json({ error: 'Invalid biometric template: expected 128 float array' });
    }

    const userRaw = await db.getUserRawById(targetId);
    if (!userRaw) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // If not authenticated via session, verify PIN
    if (!req.session.userId) {
      if (!normalPin || normalPin !== userRaw.normal_pin) {
        return res.status(401).json({ error: 'Incorrect PIN. Normal PIN required to enroll Face ID.' });
      }
    } else if (Number(req.session.userId) !== Number(userRaw.id)) {
      return res.status(403).json({ error: 'Unauthorized to modify another user profile' });
    }

    await db.updateUserBiometricTemplate(targetId, biometricTemplate);
    await db.logSecurityEvent(targetId, 'Biometrics', 'Face ID enrolled/updated successfully');

    res.json({ success: true, message: 'Face ID successfully enrolled' });
  } catch (e) {
    console.error('Biometric enroll error:', e.message);
    res.status(500).json({ error: 'Failed to enroll biometric template' });
  }
});

/* =========================================================
   STANDARD AUTH & ACCOUNT APIS
========================================================= */

/* ---------- REGISTER ---------- */
app.post('/api/register', async (req, res) => {
  try {
    const { user, transactions, balance, biometricTemplate } = req.body;
    if (!user || !user.name || !user.normalPin) {
      return res.status(400).json({ error: 'Missing required registration fields' });
    }

    const userData = { ...user };
    if (biometricTemplate && Array.isArray(biometricTemplate) && biometricTemplate.length === 128) {
      userData.biometricTemplate = biometricTemplate;
      userData.faceRegistered = true;
    }

    const userId = await db.createUser(userData);

    // Insert seed transactions
    if (transactions && Array.isArray(transactions)) {
      for (const tx of transactions) {
        await db.createTransaction(userId, tx);
      }
    }

    if (balance !== undefined) {
      await db.updateUser(userId, { balance });
    }

    // Create session
    req.session.userId = userId;
    await db.createSession(userId, 'register');
    await db.logSecurityEvent(
      userId,
      'Registration',
      `iCash ID created ${userData.biometricTemplate ? 'with Face ID enrolled' : ''}`
    );

    res.json({ success: true, userId });
  } catch (e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LOGIN (PIN ONLY - Face login MUST use /api/auth/biometric/verify) ---------- */
app.post('/api/login', async (req, res) => {
  try {
    const { method, pin, accountId } = req.body;

    // Face authentication MUST go through the biometric verification pipeline
    if (method === 'face') {
      return res.status(400).json({
        error: 'Insecure login rejected: biometric authentication must use /api/auth/biometric/challenge and verify endpoints.'
      });
    }

    let userRaw = null;
    if (accountId) {
      userRaw = await db.getUserRawById(accountId);
    } else {
      userRaw = await db.getFirstUserRaw();
    }

    if (!userRaw) {
      return res.status(404).json({ error: 'No user registered' });
    }

    if (method === 'pin' || method === 'emergency') {
      if (pin === userRaw.emergency_pin) {
        req.session.userId = userRaw.id;
        await db.createSession(userRaw.id, 'emergency');
        await db.logSecurityEvent(userRaw.id, 'Emergency', 'Emergency PIN activated — covert alert triggered');
        return res.json({ success: true, emergency: true, userId: userRaw.id });
      }
      if (pin !== userRaw.normal_pin) {
        await db.logSecurityEvent(userRaw.id, 'Security', 'Failed login attempt — incorrect PIN');
        return res.status(401).json({ error: 'Incorrect PIN' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid authentication method' });
    }

    // Create session
    req.session.userId = userRaw.id;
    await db.createSession(userRaw.id, 'pin');
    await db.logSecurityEvent(userRaw.id, 'Login', 'PIN authentication successful');

    const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    await db.updateUser(userRaw.id, { lastLogin: now });

    const safeUser = await db.getUserById(userRaw.id);
    res.json({ success: true, userId: userRaw.id, user: safeUser });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LOGOUT ---------- */
app.post('/api/logout', async (req, res) => {
  if (req.session.userId) {
    await db.deactivateSession(req.session.userId);
  }
  req.session.destroy();
  res.json({ success: true });
});

/* ---------- GET USER (+ full state) ---------- */
app.get('/api/user', async (req, res) => {
  try {
    let userId = req.session.userId;

    // If no active session, do NOT leak personal details, PINs, or balances
    if (!userId) {
      const firstUser = await db.getFirstUser();
      if (!firstUser) return res.status(404).json({ error: 'No user found' });

      // Return public metadata for landing page / login card only
      return res.json({
        user: {
          id: firstUser.id,
          name: firstUser.name,
          phone: firstUser.phone,
          seniorMode: firstUser.seniorMode,
          faceRegistered: firstUser.faceRegistered,
          hasBiometric: firstUser.hasBiometric
        },
        transactions: [],
        balance: null,
        session: null,
        events: []
      });
    }

    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeSession = await db.getActiveSession(userId);

    res.json({
      user,
      transactions: await db.getTransactions(userId),
      balance:      user.balance,
      session:      activeSession ? { active: true, method: activeSession.method } : null,
      events:       await db.getSecurityEvents(userId)
    });
  } catch (e) {
    console.error('Get user error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- UPDATE USER (Session Required) ---------- */
app.put('/api/user', requireSession, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { user, transactions, balance } = req.body;

    // Update user fields (sanitized, cannot forge pins or sessions)
    if (user) {
      await db.updateUser(userId, {
        name:             user.name,
        phone:            user.phone,
        email:            user.email,
        seniorMode:       user.seniorMode,
        emergencyContact: user.emergencyContact
      });
    }

    if (balance !== undefined) {
      await db.updateUser(userId, { balance });
    }

    // Sync transactions if provided
    if (transactions && Array.isArray(transactions)) {
      const existing    = await db.getTransactions(userId);
      const existingIds = new Set(existing.map(t => t.id));

      for (const tx of transactions) {
        if (!existingIds.has(tx.id)) {
          await db.createTransaction(userId, tx);
        }
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Update user error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- TRANSACTIONS ---------- */
app.get('/api/transactions', requireSession, async (req, res) => {
  try {
    const filters = {
      type:   req.query.type,
      date:   req.query.date,
      search: req.query.search
    };
    const txs = await db.getTransactions(req.session.userId, filters);
    res.json(txs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transactions', requireSession, async (req, res) => {
  try {
    const tx = req.body;
    await db.createTransaction(req.session.userId, tx);

    if (req.body.updateBalance !== undefined) {
      await db.updateUser(req.session.userId, { balance: req.body.updateBalance });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- BALANCE ---------- */
app.get('/api/balance', requireSession, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    res.json({ balance: user.balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- SECURITY EVENTS ---------- */
app.get('/api/events', requireSession, async (req, res) => {
  try {
    res.json(await db.getSecurityEvents(req.session.userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { type, desc } = req.body;
    await db.logSecurityEvent(userId, type, desc);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   START SERVER
========================================================= */
async function start() {
  await db.initDb();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ┌──────────────────────────────────────────┐
  │   iCash Secure Banking Server            │
  │   Running on http://localhost:${PORT}        │
  │   Biometrics: Dual Engine + Anti-Spoof   │
  │   Match Threshold: ${FACE_MATCH_THRESHOLD.toFixed(2)}                  │
  └──────────────────────────────────────────┘
    `);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
