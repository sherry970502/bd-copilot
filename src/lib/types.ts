export type StageStatus = "pending" | "active" | "done" | "skipped";

export interface Project {
  id: number;
  name: string;
  my_profile: string;
  target: string | null;
  current_stage: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ProjectStage {
  project_id: number;
  stage_key: string;
  status: StageStatus;
  updated_at: string;
}

export interface Artifact {
  id: number;
  project_id: number;
  stage_key: string;
  title: string;
  content: string;
  status: "draft" | "confirmed";
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  project_id: number;
  stage_key: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
}

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: "未开始",
  active: "进行中",
  done: "已完成",
  skipped: "已跳过",
};
