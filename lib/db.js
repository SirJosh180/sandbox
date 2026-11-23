// Database access.
// - When DATABASE_URL (or POSTGRES_URL) is set, we use real Postgres, e.g. Neon on Vercel.
// - Otherwise we use PGlite, an embedded Postgres stored in ./data, so local dev needs no setup.
// Both speak the same SQL, so the rest of the app doesn't care which one is running.
const path = require('node:path');

const CONNECTION = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS applications (
    id          SERIAL PRIMARY KEY,
    ref         TEXT NOT NULL UNIQUE,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    school      TEXT NOT NULL,
    course      TEXT NOT NULL,
    year        TEXT NOT NULL,
    roles       JSONB NOT NULL,
    level       TEXT NOT NULL,
    skills      JSONB NOT NULL DEFAULT '[]',
    hours       TEXT NOT NULL,
    portfolio   TEXT NOT NULL DEFAULT '',
    motivation  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_app_email ON applications(email);

  CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at  BIGINT NOT NULL
  );

  ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_path TEXT;

  CREATE TABLE IF NOT EXISTS students (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS student_sessions (
    token_hash  TEXT PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    expires_at  BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_progress (
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    module_id   TEXT NOT NULL,
    done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, module_id)
  );

  CREATE TABLE IF NOT EXISTS paths (
    id          TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    sender      TEXT NOT NULL CHECK (sender IN ('admin', 'student')),
    admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_id, id);

  CREATE TABLE IF NOT EXISTS submissions (
    id           SERIAL PRIMARY KEY,
    student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    path_id      TEXT NOT NULL,
    module_id    TEXT NOT NULL,
    link         TEXT NOT NULL,
    note         TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'returned')),
    score        INTEGER,
    feedback     TEXT NOT NULL DEFAULT '',
    attempt      INTEGER NOT NULL DEFAULT 1,
    reviewer_id  INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at  TIMESTAMPTZ,
    UNIQUE (student_id, module_id)
  );
  CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status, submitted_at);

  CREATE TABLE IF NOT EXISTS projects (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    client       TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    meeting_url  TEXT NOT NULL DEFAULT '',
    repo_url     TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT '',
    is_lead      BOOLEAN NOT NULL DEFAULT false,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    key       TEXT PRIMARY KEY,
    hits      INTEGER NOT NULL,
    reset_at  BIGINT NOT NULL
  );
`;

let clientPromise;

async function createClient() {
  if (CONNECTION) {
    const { Pool } = require('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(CONNECTION);
    const pool = new Pool({
      connectionString: CONNECTION,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    await pool.query(SCHEMA);
    return { query: (text, params) => pool.query(text, params).then((r) => r.rows), kind: 'postgres' };
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add a Neon Postgres database to this Vercel project (Storage tab) and redeploy.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pglite');
  require('node:fs').mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  await db.exec(SCHEMA);
  return { query: (text, params) => db.query(text, params).then((r) => r.rows), kind: 'pglite' };
}

function client() {
  if (!clientPromise) clientPromise = createClient().catch((err) => { clientPromise = null; throw err; });
  return clientPromise;
}

// query(sql, params) -> array of rows
async function query(text, params = []) {
  const c = await client();
  return c.query(text, params);
}
async function one(text, params) {
  return (await query(text, params))[0] || null;
}

module.exports = { query, one, client };
