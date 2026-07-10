import { getDb, now, trackEvent } from "./db";
import { STAGES, DEFAULT_START_STAGE } from "./scene-pack";
import type { Project, ProjectStage, Artifact, ChatMessage, StageStatus } from "./types";

export function createProject(myProfile: string, target: string): Project {
  const db = getDb();
  const ts = now();
  const name = target.trim() ? `与${target.trim().slice(0, 20)}的合作` : "新的 BD 项目";
  const info = db
    .prepare(
      "INSERT INTO projects (name, my_profile, target, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, myProfile.trim(), target.trim() || null, DEFAULT_START_STAGE, ts, ts);
  const id = Number(info.lastInsertRowid);
  const stageStmt = db.prepare(
    "INSERT INTO project_stages (project_id, stage_key, status, updated_at) VALUES (?, ?, ?, ?)"
  );
  for (const s of STAGES) {
    stageStmt.run(id, s.key, s.key === DEFAULT_START_STAGE ? "active" : "pending", ts);
  }
  trackEvent("project_created", target, id);
  return getProject(id)!;
}

export function getProject(id: number): Project | undefined {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function listProjects(): (Project & { artifactCount: number; doneStages: number })[] {
  const db = getDb();
  const projects = db
    .prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC")
    .all() as Project[];
  return projects.map((p) => {
    const a = db
      .prepare("SELECT COUNT(*) AS n FROM artifacts WHERE project_id = ? AND status = 'confirmed'")
      .get(p.id) as { n: number };
    const d = db
      .prepare("SELECT COUNT(*) AS n FROM project_stages WHERE project_id = ? AND status = 'done'")
      .get(p.id) as { n: number };
    return { ...p, artifactCount: a.n, doneStages: d.n };
  });
}

export function getProjectDetail(id: number) {
  const db = getDb();
  const project = getProject(id);
  if (!project) return undefined;
  const stages = db
    .prepare("SELECT * FROM project_stages WHERE project_id = ?")
    .all(id) as ProjectStage[];
  const artifacts = db
    .prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY id DESC")
    .all(id) as Artifact[];
  return { project, stages, artifacts };
}

export function getStageMessages(projectId: number, stageKey: string): ChatMessage[] {
  return getDb()
    .prepare(
      "SELECT * FROM messages WHERE project_id = ? AND stage_key = ? ORDER BY id ASC LIMIT 200"
    )
    .all(projectId, stageKey) as ChatMessage[];
}

/** 环节状态流转；进入某环节时把它设为 active 并更新 current_stage */
export function setStageStatus(projectId: number, stageKey: string, status: StageStatus) {
  const db = getDb();
  db.prepare(
    "UPDATE project_stages SET status = ?, updated_at = ? WHERE project_id = ? AND stage_key = ?"
  ).run(status, now(), projectId, stageKey);
  if (status === "active") {
    db.prepare("UPDATE projects SET current_stage = ?, updated_at = ? WHERE id = ?").run(
      stageKey,
      now(),
      projectId
    );
  }
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), projectId);
  trackEvent("stage_" + status, stageKey, projectId, stageKey);
}

export function updateArtifact(
  id: number,
  patch: { status?: "draft" | "confirmed"; content?: string; title?: string }
): Artifact | undefined {
  const db = getDb();
  const a = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Artifact | undefined;
  if (!a) return undefined;
  db.prepare(
    "UPDATE artifacts SET title = ?, content = ?, status = ?, updated_at = ? WHERE id = ?"
  ).run(patch.title ?? a.title, patch.content ?? a.content, patch.status ?? a.status, now(), id);
  if (patch.status === "confirmed" && a.status !== "confirmed") {
    trackEvent("artifact_confirmed", a.title, a.project_id, a.stage_key);
  }
  return db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Artifact;
}

export function deleteArtifact(id: number) {
  getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
}
