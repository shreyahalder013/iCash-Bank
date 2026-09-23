/* =========================================================
   ICASH — Supabase / PostgreSQL Database Layer
   Uses node-postgres (pg) Pool.
   Supports individual PG* env vars (recommended) to avoid
   URL-encoding issues with special characters in passwords.
   All exported functions keep the same signature as the old
   sql.js version so server.js requires zero changes.
========================================================= */
const { Pool } = require('pg');

// Prefer individual vars (no URL-encoding needed for password).
// Fall back to a single connection string if PG_HOST is not set.
const pool = process.env.PG_HOST
  ? new Pool({
      host:     process.env.PG_HOST,
      port:     parseInt(process.env.PG_PORT || '6543'),
      database: process.env.PG_DATABASE || 'postgres',
      user:     process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl:      { rejectUnauthorized: false }
    })
  : new Pool({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false }
    });

/* =========================================================
   INIT
========================================================= */
async function initDb() {
  // Startup diagnostics — helps debug env var issues on Render
  console.log('=== DB Connection Diagnostics ===');
  console.log('PG_HOST    :', process.env.PG_HOST     || '(not set)');
  console.log('PG_PORT    :', process.env.PG_PORT     || '(not set)');
  console.log('PG_USER    :', process.env.PG_USER     || '(not set)');
  console.log('PG_PASSWORD:', process.env.PG_PASSWORD ? '(set)' : '(not set)');
  console.log('SUPABASE_DB_URL:', process.env.SUPABASE_DB_URL ? '(set)' : '(not set)');
  console.log('Using mode :', process.env.PG_HOST ? 'individual vars' : 'connection URL');
  console.log('=================================');

  // Verify connection
  const client = await pool.connect();
  client.release();


  // Create tables if they don't exist yet
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                          SERIAL PRIMARY KEY,
      name                        TEXT NOT NULL,
      phone                       TEXT NOT NULL,
      aadhaar                     TEXT,
      email                       TEXT,
      dob                         TEXT,
      age                         INTEGER,
      senior                      BOOLEAN DEFAULT FALSE,
      normal_pin                  TEXT NOT NULL,
      emergency_pin               TEXT,
      emergency_contact_name      TEXT,
      emergency_contact_phone     TEXT,
      emergency_contact_relation  TEXT,
      face_registered             BOOLEAN DEFAULT FALSE,
      biometric_template          TEXT,
      last_login                  TEXT,
      senior_mode                 BOOLEAN DEFAULT FALSE,
      balance                     NUMERIC(12,2) DEFAULT 48750,
      created_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Ensure biometric_template column exists on existing deployments
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_template TEXT;`);
  } catch (err) {
    console.warn('Column migration note:', err.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      txn_id      TEXT NOT NULL,
      date        TEXT NOT NULL,
      description TEXT NOT NULL,
      type        TEXT NOT NULL,
      category    TEXT,
      amount      NUMERIC(12,2) NOT NULL,
      status      TEXT DEFAULT 'Completed',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS security_events (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      description TEXT NOT NULL,
      timestamp   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method     TEXT,
      active     BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await seedIfEmpty();
  console.log('✓ Connected to Supabase PostgreSQL — tables ready');
}

/* =========================================================
   SEED
========================================================= */
async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (parseInt(rows[0].c) > 0) return;

  const { rows: inserted } = await pool.query(`
    INSERT INTO users (
      name, phone, aadhaar, email, dob, age, senior,
      normal_pin, emergency_pin,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      face_registered, last_login, senior_mode, balance
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING id
  `, [
    'Siddharth Pal', '+91 98765 43210', '482145678921', 'siddharth.demo@icash.app',
    '1999-04-12', 25, false,
    '2468', '9999',
    'Ravi Pal', '+91 91234 56789', 'Father',
    true, '20 Sep 2026, 09:14', false, 48750
  ]);

  const userId = inserted[0].id;

  const seedTx = [
    ['TXN-9F21A', '2026-09-20', 'Salary Credit',    'in',  null,         5000],
    ['TXN-8C10B', '2026-09-19', 'Grocery Store',    'out', 'Food',       1200],
    ['TXN-7A02D', '2026-09-18', 'ATM Withdrawal',   'out', 'Cash',       2000],
    ['TXN-6E88F', '2026-09-16', 'Electricity Bill', 'out', 'Bills',       500],
    ['TXN-5D77C', '2026-09-14', 'Cab Ride',         'out', 'Transport',   750],
  ];

  for (const [txnId, date, desc, type, cat, amount] of seedTx) {
    await pool.query(
      'INSERT INTO transactions (user_id,txn_id,date,description,type,category,amount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, txnId, date, desc, type, cat, amount]
    );
  }

  console.log('✓ Database seeded with demo user and transactions');
}

/* =========================================================
   USER HELPERS
========================================================= */
function formatUser(row) {
  if (!row) return null;
  const hasBio = !!(row.biometric_template && row.biometric_template.length > 10);
  return {
    id:            row.id,
    name:          row.name,
    phone:         row.phone,
    aadhaar:       row.aadhaar,
    email:         row.email,
    dob:           row.dob,
    age:           row.age,
    senior:        !!row.senior,
    emergencyContact: {
      name:     row.emergency_contact_name,
      phone:    row.emergency_contact_phone,
      relation: row.emergency_contact_relation
    },
    faceRegistered: !!row.face_registered || hasBio,
    hasBiometric:  hasBio,
    lastLogin:     row.last_login,
    seniorMode:    !!row.senior_mode,
    balance:       parseFloat(row.balance)
  };
}

async function createUser(userData) {
  const bioTemplate = userData.biometricTemplate ? JSON.stringify(userData.biometricTemplate) : null;
  const isFaceReg = userData.faceRegistered || !!bioTemplate;

  const { rows } = await pool.query(`
    INSERT INTO users (
      name, phone, aadhaar, email, dob, age, senior,
      normal_pin, emergency_pin,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      face_registered, biometric_template, last_login, senior_mode, balance
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING id
  `, [
    userData.name, userData.phone, userData.aadhaar, userData.email,
    userData.dob, userData.age, userData.senior ? true : false,
    userData.normalPin, userData.emergencyPin,
    userData.emergencyContact?.name  || null,
    userData.emergencyContact?.phone || null,
    userData.emergencyContact?.relation || null,
    isFaceReg,
    bioTemplate,
    userData.lastLogin || 'Just now',
    userData.seniorMode ? true : false,
    48750
  ]);
  return rows[0].id;
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return formatUser(rows[0] || null);
}

async function getUserByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return formatUser(rows[0] || null);
}

async function getUserRawById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getUserRawByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0] || null;
}

async function getFirstUser() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id ASC LIMIT 1');
  return formatUser(rows[0] || null);
}

async function getFirstUserRaw() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id ASC LIMIT 1');
  return rows[0] || null;
}

async function getUserBiometricTemplate(userId) {
  const { rows } = await pool.query('SELECT biometric_template FROM users WHERE id = $1', [userId]);
  if (!rows[0] || !rows[0].biometric_template) return null;
  try {
    const parsed = JSON.parse(rows[0].biometric_template);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

async function updateUserBiometricTemplate(userId, template) {
  const serialized = JSON.stringify(template);
  await pool.query(
    'UPDATE users SET biometric_template = $1, face_registered = TRUE WHERE id = $2',
    [serialized, userId]
  );
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  let i = 1;

  if (data.name          !== undefined) { fields.push(`name = $${i++}`);          values.push(data.name); }
  if (data.phone         !== undefined) { fields.push(`phone = $${i++}`);         values.push(data.phone); }
  if (data.email         !== undefined) { fields.push(`email = $${i++}`);         values.push(data.email); }
  if (data.seniorMode    !== undefined) { fields.push(`senior_mode = $${i++}`);   values.push(!!data.seniorMode); }
  if (data.lastLogin     !== undefined) { fields.push(`last_login = $${i++}`);    values.push(data.lastLogin); }
  if (data.balance       !== undefined) { fields.push(`balance = $${i++}`);       values.push(data.balance); }
  if (data.normalPin     !== undefined) { fields.push(`normal_pin = $${i++}`);    values.push(data.normalPin); }
  if (data.emergencyPin  !== undefined) { fields.push(`emergency_pin = $${i++}`); values.push(data.emergencyPin); }
  if (data.emergencyContact) {
    fields.push(`emergency_contact_name = $${i++}`, `emergency_contact_phone = $${i++}`, `emergency_contact_relation = $${i++}`);
    values.push(data.emergencyContact.name, data.emergencyContact.phone, data.emergencyContact.relation);
  }

  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values);
}

/* =========================================================
   TRANSACTIONS
========================================================= */
async function getTransactions(userId, filters = {}) {
  let sql = 'SELECT * FROM transactions WHERE user_id = $1';
  const params = [userId];
  let i = 2;

  if (filters.type)   { sql += ` AND type = $${i++}`;             params.push(filters.type); }
  if (filters.date)   { sql += ` AND date = $${i++}`;             params.push(filters.date); }
  if (filters.search) { sql += ` AND (description ILIKE $${i} OR txn_id ILIKE $${i})`; i++; params.push(`%${filters.search}%`); }

  sql += ' ORDER BY created_at DESC';

  const { rows } = await pool.query(sql, params);
  return rows.map(row => ({
    id:     row.txn_id,
    date:   row.date,
    desc:   row.description,
    type:   row.type,
    cat:    row.category,
    amount: parseFloat(row.amount),
    status: row.status
  }));
}

async function createTransaction(userId, tx) {
  await pool.query(
    'INSERT INTO transactions (user_id,txn_id,date,description,type,category,amount,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [userId, tx.id, tx.date, tx.desc, tx.type, tx.cat || null, tx.amount, tx.status || 'Completed']
  );
}

/* =========================================================
   SECURITY EVENTS
========================================================= */
async function getSecurityEvents(userId, limit = 12) {
  const { rows } = await pool.query(
    'SELECT * FROM security_events WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
    [userId, limit]
  );
  return rows.map(row => ({
    type: row.type,
    desc: row.description,
    time: row.timestamp
  }));
}

async function logSecurityEvent(userId, type, description) {
  await pool.query(
    'INSERT INTO security_events (user_id,type,description) VALUES ($1,$2,$3)',
    [userId, type, description]
  );
}

/* =========================================================
   SESSIONS
========================================================= */
async function createSession(userId, method) {
  await pool.query('UPDATE sessions SET active = FALSE WHERE user_id = $1', [userId]);
  const { rows } = await pool.query(
    'INSERT INTO sessions (user_id,method,active) VALUES ($1,$2,TRUE) RETURNING id',
    [userId, method]
  );
  return rows[0].id;
}

async function deactivateSession(userId) {
  await pool.query('UPDATE sessions SET active = FALSE WHERE user_id = $1', [userId]);
}

async function getActiveSession(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM sessions WHERE user_id = $1 AND active = TRUE ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

/* =========================================================
   EXPORTS  (same surface as old db.js)
========================================================= */
module.exports = {
  initDb,
  createUser,
  getUserById,
  getUserByPhone,
  getUserRawById,
  getUserRawByPhone,
  getFirstUser,
  getFirstUserRaw,
  getUserBiometricTemplate,
  updateUserBiometricTemplate,
  updateUser,
  getTransactions,
  createTransaction,
  getSecurityEvents,
  logSecurityEvent,
  createSession,
  deactivateSession,
  getActiveSession
};
