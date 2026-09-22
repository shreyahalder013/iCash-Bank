/* =========================================================
   ICASH — SQLite Database Layer (using sql.js)
   Pure JavaScript SQLite — no native build tools required.
   Database is persisted to disk as a file.
========================================================= */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'icash.db');

let db = null;
let SQL = null;

async function initDb(){
  if(db) return db;

  SQL = await initSqlJs();

  // Load existing database or create new one
  if(fs.existsSync(DB_PATH)){
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  initTables();
  seedIfEmpty();
  saveToFile();
  return db;
}

function getDb(){
  if(!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function saveToFile(){
  if(!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initTables(){
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      aadhaar TEXT,
      email TEXT,
      dob TEXT,
      age INTEGER,
      senior INTEGER DEFAULT 0,
      normal_pin TEXT NOT NULL,
      emergency_pin TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relation TEXT,
      face_registered INTEGER DEFAULT 0,
      last_login TEXT,
      senior_mode INTEGER DEFAULT 0,
      balance REAL DEFAULT 48750,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      txn_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'Completed',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      method TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

function seedIfEmpty(){
  const result = db.exec('SELECT COUNT(*) as c FROM users');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if(count > 0) return;

  // Seed demo user
  db.run(`
    INSERT INTO users (name, phone, aadhaar, email, dob, age, senior, normal_pin, emergency_pin,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      face_registered, last_login, senior_mode, balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'Siddharth Pal', '+91 98765 43210', '482145678921', 'siddharth.demo@icash.app',
    '1999-04-12', 25, 0, '2468', '9999',
    'Ravi Pal', '+91 91234 56789', 'Father',
    1, '20 Sep 2026, 09:14', 0, 48750
  ]);

  // Get the user ID (last inserted row)
  const userIdResult = db.exec('SELECT last_insert_rowid() as id');
  const userId = userIdResult[0].values[0][0];

  // Seed demo transactions
  const seedTx = [
    ['TXN-9F21A', '2026-09-20', 'Salary Credit', 'in', null, 5000, 'Completed'],
    ['TXN-8C10B', '2026-09-19', 'Grocery Store', 'out', 'Food', 1200, 'Completed'],
    ['TXN-7A02D', '2026-09-18', 'ATM Withdrawal', 'out', 'Cash', 2000, 'Completed'],
    ['TXN-6E88F', '2026-09-16', 'Electricity Bill', 'out', 'Bills', 500, 'Completed'],
    ['TXN-5D77C', '2026-09-14', 'Cab Ride', 'out', 'Transport', 750, 'Completed'],
  ];

  for(const [txnId, date, desc, type, cat, amount, status] of seedTx){
    db.run(`
      INSERT INTO transactions (user_id, txn_id, date, description, type, category, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, txnId, date, desc, type, cat, amount, status]);
  }

  console.log('✓ Database seeded with demo user and transactions');
}

/* ---------- Helper: run query and get rows as objects ---------- */
function queryAll(sql, params = []){
  const stmt = db.prepare(sql);
  if(params.length) stmt.bind(params);
  const rows = [];
  while(stmt.step()){
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []){
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/* ---------- Query Functions ---------- */

function createUser(userData){
  db.run(`
    INSERT INTO users (name, phone, aadhaar, email, dob, age, senior, normal_pin, emergency_pin,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      face_registered, last_login, senior_mode, balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userData.name, userData.phone, userData.aadhaar, userData.email,
    userData.dob, userData.age, userData.senior ? 1 : 0,
    userData.normalPin, userData.emergencyPin,
    userData.emergencyContact?.name || null,
    userData.emergencyContact?.phone || null,
    userData.emergencyContact?.relation || null,
    userData.faceRegistered ? 1 : 0,
    userData.lastLogin || 'Just now',
    userData.seniorMode ? 1 : 0,
    48750
  ]);
  const result = db.exec('SELECT last_insert_rowid() as id');
  const userId = result[0].values[0][0];
  saveToFile();
  return userId;
}

function formatUser(row){
  if(!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    aadhaar: row.aadhaar,
    email: row.email,
    dob: row.dob,
    age: row.age,
    senior: !!row.senior,
    normalPin: row.normal_pin,
    emergencyPin: row.emergency_pin,
    emergencyContact: {
      name: row.emergency_contact_name,
      phone: row.emergency_contact_phone,
      relation: row.emergency_contact_relation
    },
    faceRegistered: !!row.face_registered,
    lastLogin: row.last_login,
    seniorMode: !!row.senior_mode,
    balance: row.balance
  };
}

function getUserById(id){
  const row = queryOne('SELECT * FROM users WHERE id = ?', [id]);
  return formatUser(row);
}

function getUserByPhone(phone){
  const row = queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
  return formatUser(row);
}

function getFirstUser(){
  const row = queryOne('SELECT * FROM users ORDER BY id ASC LIMIT 1');
  return formatUser(row);
}

function updateUser(id, data){
  const fields = [];
  const values = [];

  if(data.name !== undefined){ fields.push('name = ?'); values.push(data.name); }
  if(data.phone !== undefined){ fields.push('phone = ?'); values.push(data.phone); }
  if(data.email !== undefined){ fields.push('email = ?'); values.push(data.email); }
  if(data.seniorMode !== undefined){ fields.push('senior_mode = ?'); values.push(data.seniorMode ? 1 : 0); }
  if(data.lastLogin !== undefined){ fields.push('last_login = ?'); values.push(data.lastLogin); }
  if(data.balance !== undefined){ fields.push('balance = ?'); values.push(data.balance); }
  if(data.normalPin !== undefined){ fields.push('normal_pin = ?'); values.push(data.normalPin); }
  if(data.emergencyPin !== undefined){ fields.push('emergency_pin = ?'); values.push(data.emergencyPin); }
  if(data.emergencyContact){
    fields.push('emergency_contact_name = ?', 'emergency_contact_phone = ?', 'emergency_contact_relation = ?');
    values.push(data.emergencyContact.name, data.emergencyContact.phone, data.emergencyContact.relation);
  }

  if(fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  saveToFile();
}

function getTransactions(userId, filters = {}){
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];

  if(filters.type){
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  if(filters.date){
    sql += ' AND date = ?';
    params.push(filters.date);
  }
  if(filters.search){
    sql += ' AND (description LIKE ? OR txn_id LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  sql += ' ORDER BY created_at DESC';

  return queryAll(sql, params).map(row => ({
    id: row.txn_id,
    date: row.date,
    desc: row.description,
    type: row.type,
    cat: row.category,
    amount: row.amount,
    status: row.status
  }));
}

function createTransaction(userId, tx){
  db.run(`
    INSERT INTO transactions (user_id, txn_id, date, description, type, category, amount, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, tx.id, tx.date, tx.desc, tx.type, tx.cat || null, tx.amount, tx.status || 'Completed']);
  saveToFile();
}

function getSecurityEvents(userId, limit = 12){
  return queryAll('SELECT * FROM security_events WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?', [userId, limit])
    .map(row => ({
      type: row.type,
      desc: row.description,
      time: row.timestamp
    }));
}

function logSecurityEvent(userId, type, description){
  db.run('INSERT INTO security_events (user_id, type, description) VALUES (?, ?, ?)', [userId, type, description]);
  saveToFile();
}

function createSession(userId, method){
  // Deactivate old sessions
  db.run('UPDATE sessions SET active = 0 WHERE user_id = ?', [userId]);
  db.run('INSERT INTO sessions (user_id, method, active) VALUES (?, ?, 1)', [userId, method]);
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveToFile();
  return result[0].values[0][0];
}

function deactivateSession(userId){
  db.run('UPDATE sessions SET active = 0 WHERE user_id = ?', [userId]);
  saveToFile();
}

function getActiveSession(userId){
  return queryOne('SELECT * FROM sessions WHERE user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1', [userId]);
}

module.exports = {
  initDb,
  getDb,
  createUser,
  getUserById,
  getUserByPhone,
  getFirstUser,
  updateUser,
  getTransactions,
  createTransaction,
  getSecurityEvents,
  logSecurityEvent,
  createSession,
  deactivateSession,
  getActiveSession
};
