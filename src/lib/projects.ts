import { getDb, now, trackEvent, addTimeline } from "./db";
import { STAGES, DEFAULT_START_STAGE } from "./scene-pack";
import type { Project, ProjectStage, Artifact, ChatMessage, StageStatus, TimelineEvent } from "./types";

export function createProject(target: string, situation: string): Project {
  const db = getDb();
  const ts = now();
  const name = `与${target.trim().slice(0, 20)}的合作`;
  const info = db
    .prepare(
      "INSERT INTO projects (name, situation, target, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name, situation.trim(), target.trim(), DEFAULT_START_STAGE, ts, ts);
  const id = Number(info.lastInsertRowid);
  const stageStmt = db.prepare(
    "INSERT INTO project_stages (project_id, stage_key, status, updated_at) VALUES (?, ?, 'pending', ?)"
  );
  for (const s of STAGES) {
    stageStmt.run(id, s.key, ts);
  }
  addTimeline(id, "created", `项目创建：${situation.trim().slice(0, 60)}`);
  trackEvent("project_created", target, id);
  return getProject(id)!;
}

export function getProject(id: number): Project | undefined {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function listProjects(): (Project & { artifactCount: number; latestEvent: string | null })[] {
  const db = getDb();
  const projects = db
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all() as Project[];
  return projects.map((p) => {
    const a = db
      .prepare("SELECT COUNT(*) AS n FROM artifacts WHERE project_id = ? AND status = 'confirmed'")
      .get(p.id) as { n: number };
    const t = db
      .prepare("SELECT text FROM timeline WHERE project_id = ? ORDER BY id DESC LIMIT 1")
      .get(p.id) as { text: string } | undefined;
    return { ...p, artifactCount: a.n, latestEvent: t?.text ?? null };
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
  const timeline = db
    .prepare("SELECT * FROM timeline WHERE project_id = ? ORDER BY id DESC LIMIT 50")
    .all(id) as TimelineEvent[];
  return { project, stages, artifacts, timeline };
}

export function setProjectStatus(id: number, status: Project["status"], byUser = true) {
  const db = getDb();
  db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
  if (byUser) addTimeline(id, "status", `项目状态调整为「${status}」`);
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
  if (status === "done") {
    const stage = STAGES.find((s) => s.key === stageKey);
    addTimeline(projectId, "stage_done", `完成环节：${stage?.name ?? stageKey}`);
  }
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
    addTimeline(a.project_id, "artifact", `产出物入档：${a.title}`);
    trackEvent("artifact_confirmed", a.title, a.project_id, a.stage_key);
  }
  return db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Artifact;
}

export function deleteArtifact(id: number) {
  getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
}
