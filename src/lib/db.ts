import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  my_profile TEXT,
  situation TEXT,
  plan TEXT,
  target TEXT,
  current_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline(project_id);

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
  kind TEXT DEFAULT 'doc',
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
  artifact_id INTEGER,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, stage_key);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  created_at TEXT NOT NULL,
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);

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
  migrate(db);
  return db;
}

/** 轻量迁移：给已有库补新列 */
function migrate(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  for (const col of ["situation", "plan"]) {
    if (!have.has(col)) db.exec(`ALTER TABLE projects ADD COLUMN ${col} TEXT`);
  }
  const msgCols = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  if (msgCols.length > 0 && !msgCols.some((c) => c.name === "artifact_id")) {
    db.exec(`ALTER TABLE messages ADD COLUMN artifact_id INTEGER`);
  }
  const artCols = db.prepare("PRAGMA table_info(artifacts)").all() as { name: string }[];
  if (artCols.length > 0 && !artCols.some((c) => c.name === "kind")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN kind TEXT DEFAULT 'doc'`);
  }
}

/** 项目时间线：用户可见的进展叙事（“发生了什么”而非“走到第几格”） */
export function addTimeline(projectId: number, kind: string, text: string) {
  getDb()
    .prepare("INSERT INTO timeline (project_id, kind, text, ts) VALUES (?, ?, ?, ?)")
    .run(projectId, kind, text, now());
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
