import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  my_profile TEXT NOT NULL,
  target TEXT,
  current_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_stages (
  project_id INTEGER NOT NULL,
  stage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, stage_key)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  stage_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  stage_key TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, stage_key);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  stage_key TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ts TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);
`;

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function createDb(): Database.Database {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "app.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

const globalForDb = globalThis as unknown as { __bdcDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__bdcDb) {
    globalForDb.__bdcDb = createDb();
  }
  return globalForDb.__bdcDb;
}

export function now(): string {
  return new Date().toISOString();
}

/** 使用埋点（未来回流需求雷达的一手数据） */
export function trackEvent(
  action: string,
  detail?: string,
  projectId?: number,
  stageKey?: string
) {
  getDb()
    .prepare(
      "INSERT INTO usage_events (project_id, stage_key, action, detail, ts) VALUES (?, ?, ?, ?, ?)"
    )
    .run(projectId ?? null, stageKey ?? null, action, detail ?? null, now());
}
