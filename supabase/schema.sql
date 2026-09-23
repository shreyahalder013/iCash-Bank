-- =========================================================
--  iCash Banking — Supabase Schema
--  Paste this into Supabase SQL Editor and click "Run"
-- =========================================================

-- Users table
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
);

-- Transactions table
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
);

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method     TEXT,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
--  Seed: Demo user (only if users table is empty)
-- =========================================================
DO $$
DECLARE
  v_user_id INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM users) = 0 THEN

    INSERT INTO users (
      name, phone, aadhaar, email, dob, age, senior,
      normal_pin, emergency_pin,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      face_registered, last_login, senior_mode, balance
    ) VALUES (
      'Siddharth Pal', '+91 98765 43210', '482145678921', 'siddharth.demo@icash.app',
      '1999-04-12', 25, FALSE,
      '2468', '9999',
      'Ravi Pal', '+91 91234 56789', 'Father',
      TRUE, '20 Sep 2026, 09:14', FALSE, 48750
    ) RETURNING id INTO v_user_id;

    INSERT INTO transactions (user_id, txn_id, date, description, type, category, amount, status) VALUES
      (v_user_id, 'TXN-9F21A', '2026-09-20', 'Salary Credit',   'in',  NULL,        5000, 'Completed'),
      (v_user_id, 'TXN-8C10B', '2026-09-19', 'Grocery Store',   'out', 'Food',      1200, 'Completed'),
      (v_user_id, 'TXN-7A02D', '2026-09-18', 'ATM Withdrawal',  'out', 'Cash',      2000, 'Completed'),
      (v_user_id, 'TXN-6E88F', '2026-09-16', 'Electricity Bill','out', 'Bills',      500, 'Completed'),
      (v_user_id, 'TXN-5D77C', '2026-09-14', 'Cab Ride',        'out', 'Transport',  750, 'Completed');

    RAISE NOTICE 'Demo user seeded with id=%', v_user_id;
  END IF;
END $$;
