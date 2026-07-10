import { getDb, now, trackEvent } from "../db";
import {
  AGENT_MODEL,
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./client";
import { getStage } from "../scene-pack";
import { getProfile } from "../profile";
import type { Project, Artifact } from "../types";

/**
 * 产出物协议：专员把正式交付物包在 <artifact> 里，系统提取存档。
 * 档案接力：已确认的产出物会注入后续所有专员的上下文——这是"引导式"的实质。
 */
const COMMON_PROTOCOL = `

—— 通用协议 ——
- 全程中文，务实具体，严禁空话套话（"赋能""双赢""领军企业"等词禁用）
- 用户是没有 BD 经验的个人或小团队，解释术语、给出可直接照做的步骤
- 当你产出正式交付物（报告/文案/方案/清单）时，把交付物完整包裹在下面的标签里（一条消息最多一个）：
<artifact title="交付物标题">
（Markdown 格式的交付物正文）
</artifact>
- 标签外可以写简短的说明或下一步建议；闲聊、答疑、陪练对话不要用 artifact 标签`;

function buildContext(project: Project, stageKey: string): string {
  const db = getDb();
  const profile = getProfile();
  const confirmed = db
    .prepare(
      "SELECT stage_key, title, content FROM artifacts WHERE project_id = ? AND status = 'confirmed' ORDER BY id ASC"
    )
    .all(project.id) as Pick<Artifact, "stage_key" | "title" | "content">[];
  const archiveText =
    confirmed.length > 0
      ? confirmed
          .map((a) => {
            const stage = getStage(a.stage_key);
            return `【${stage?.name ?? "进展纪要"}｜${a.title}】\n${a.content}`;
          })
          .join("\n\n---\n\n")
      : "（暂无已确认的产出物——如果你的工作依赖前置环节的结论，请提醒用户先完成对应环节）";

  return `—— 项目档案 ——
我方情况（工作区档案）：
${profile?.content ?? project.my_profile ?? "（未建档）"}

目标对象：${project.target || "（尚未明确）"}
这次的处境与目标（用户建项目时的描述）：
${project.situation ?? "（无）"}

已确认的产出物与进展纪要（全体专员共享，按时间序）：
${archiveText}`;
}

export interface AgentReply {
  text: string;
  artifact: { id: number; title: string; content: string } | null;
}

/** 运行一次专员对话：注入档案上下文 + 本环节聊天记录，提取产出物入档（草稿态） */
export async function runAgent(
  project: Project,
  stageKey: string,
  userMessage: string
): Promise<AgentReply> {
  const stage = getStage(stageKey);
  if (!stage?.agent) throw new Error("该环节暂未开放");
  const agent = stage.agent;
  const db = getDb();
  const ts = now();

  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, ts) VALUES (?, ?, 'user', ?, ?)"
  ).run(project.id, stageKey, userMessage, ts);

  // 本环节最近 12 条历史（不含刚插入的这条，稍后拼接）
  const history = (
    db
      .prepare(
        "SELECT role, content FROM messages WHERE project_id = ? AND stage_key = ? ORDER BY id DESC LIMIT 13"
      )
      .all(project.id, stageKey) as { role: "user" | "assistant"; content: string }[]
  ).reverse();

  const system = `你是「${agent.name}」（${SCENE_LABEL}的 AI 专员），当前服务环节：${stage.name}——${stage.description}。

${agent.systemPrompt}
${COMMON_PROTOCOL}

${buildContext(project, stageKey)}`;

  assertBudget();
  recordAiCall();
  trackEvent("agent_call", agent.key, project.id, stageKey);

  const message = await streamWithServerTools({
    model: AGENT_MODEL,
    max_tokens: 8000,
    system,
    ...(agent.webSearch
      ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 }] }
      : {}),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  const raw = messageText(message);
  if (!raw.trim()) throw new Error(`专员没有返回内容（stop_reason: ${message.stop_reason}）`);

  // 提取产出物
  let artifact: AgentReply["artifact"] = null;
  const m = raw.match(/<artifact title="([^"]*)">([\s\S]*?)<\/artifact>/);
  let display = raw;
  if (m) {
    const title = m[1].trim() || "未命名产出物";
    const content = m[2].trim();
    const info = db
      .prepare(
        "INSERT INTO artifacts (project_id, stage_key, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)"
      )
      .run(project.id, stageKey, title, content, now(), now());
    artifact = { id: Number(info.lastInsertRowid), title, content };
    display = raw.replace(m[0], `📄 已产出：**${title}**（见右侧产出物栏，确认后会进入项目档案供后续环节使用）`);
    trackEvent("artifact_created", title, project.id, stageKey);
  }

  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, ts) VALUES (?, ?, 'assistant', ?, ?)"
  ).run(project.id, stageKey, display, now());
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), project.id);

  return { text: display, artifact };
}

const SCENE_LABEL = "BD Copilot";
