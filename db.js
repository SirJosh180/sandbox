// SQLite storage using Node's built-in driver (no native packages to compile).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'sandbox.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ref         TEXT NOT NULL UNIQUE,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    school      TEXT NOT NULL,
    course      TEXT NOT NULL,
    year        TEXT NOT NULL,
    roles       TEXT NOT NULL,          -- JSON array of role ids
    level       TEXT NOT NULL,
    skills      TEXT NOT NULL DEFAULT '[]', -- JSON array
    hours       TEXT NOT NULL,
    portfolio   TEXT NOT NULL DEFAULT '',
    motivation  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | shortlisted | accepted | rejected
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_app_email ON applications(email);

  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );
`);

module.exports = db;
