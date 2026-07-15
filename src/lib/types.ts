export type StageStatus = "pending" | "active" | "done" | "skipped";

/** 项目结局状态：合作的死亡是一种结局，不是生命周期的一个阶段 */
export type ProjectStatus = "active" | "waiting" | "won" | "shelved";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "推进中",
  waiting: "等待对方",
  won: "已达成 🎉",
  shelved: "已搁置",
};

/** 领航员产出的活计划：每个环节本次需不需要 */
export interface PlanItem {
  stage: string;
  needed: boolean;
  reason: string;
}

/** 领航员建议的下一步（直达对应专员） */
export interface NextAction {
  stage: string;
  action: string;
}

export interface NavPlan {
  items: PlanItem[];
  next: NextAction[];
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  my_profile: string | null; // 遗留字段（档案已迁移到 profile 表）
  situation: string | null; // 建项目时用户描述的处境与目标
  plan: string | null; // JSON NavPlan
  target: string | null;
  current_stage: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: number;
  project_id: number;
  kind: string;
  text: string;
  ts: string;
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
  /** doc=普通文档；directions=方向集（content 为 JSON，UI 渲染成可勾选卡片） */
  kind: "doc" | "directions" | null;
  created_at: string;
  updated_at: string;
}

/** 方向集中的一个切入方向（发散→用户筛选→深化 的载体） */
export interface Direction {
  title: string;
  hook: string;
  give: string;
  get: string;
  risk: string;
  recommended?: boolean;
}

export interface ChatMessage {
  id: number;
  project_id: number;
  /** 发言的专员（nav=领航员；其余为环节 key）——群聊统一流中标识"谁说的" */
  stage_key: string;
  role: "user" | "assistant";
  content: string;
  /** 该消息产出的产出物（流内渲染成卡片） */
  artifact_id: number | null;
  ts: string;
}

/** 人类待办：AI 能干的都交给 AI，需要人拍板/动手的进这里 */
export interface Todo {
  id: number;
  project_id: number;
  text: string;
  status: "pending" | "done";
  source: string | null;
  created_at: string;
  done_at: string | null;
}

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: "未开始",
  active: "进行中",
  done: "已完成",
  skipped: "已跳过",
};
