import { getDb, now, trackEvent } from "../db";
import {
  AGENT_MODEL,
  assertBudget,
  recordAiCall,
  streamWithServerTools,
  messageText,
} from "./client";
import { getStage, getTask } from "../scene-pack";
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
- 标签外可以写简短的说明或下一步建议；闲聊、答疑、陪练对话不要用 artifact 标签

—— 交付物三条硬规则 ——
1. **一页纸结构**：开头必须是「## 拿来即用」——用户可直接照做/照读/照发的部分；背景分析与理由放在其后的「## 为什么这么做」，能短则短
2. **事实与假设分离**：正文只写有档案依据的内容；所有推测集中到末尾「## ⚠️ 待验证清单」，每条附一句验证方法（如"下次沟通问 X 即可确认"），严禁把假设混进正文当事实
3. **必须给推荐**：凡是给出多个方案/版本，结尾必须有一行「👉 如果只选一个：选 X，因为…」——用户没有经验，不要把选择难题抛回给他

—— 群聊须知 ——
你在一个项目群里和领航员、其他专员共事，历史消息里【】标注了发言者。你只以自己的专业身份发言，不要代替别人的职责；发现问题属于别的专员，明确建议用户找他。`;

/** 统一群聊历史：取最近 N 条（跨全部角色），标注发言者并合并连续同角色消息 */
export function buildHistory(projectId: number, limit = 15): { role: "user" | "assistant"; content: string }[] {
  const db = getDb();
  const rows = (
    db
      .prepare(
        "SELECT stage_key, role, content FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT ?"
      )
      .all(projectId, limit) as { stage_key: string; role: "user" | "assistant"; content: string }[]
  ).reverse();
  const merged: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of rows) {
    const speaker =
      m.role === "assistant"
        ? m.stage_key === "nav"
          ? "【领航员】"
          : `【${getStage(m.stage_key)?.agent?.name ?? m.stage_key}】`
        : "";
    const content = `${speaker}${m.content}`;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else merged.push({ role: m.role, content });
  }
  // API 要求首条为 user
  while (merged.length > 0 && merged[0].role !== "user") merged.shift();
  return merged;
}

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

/**
 * 运行一次专员对话。任务是提示词装配的一等公民：
 * - 带 taskKey：System 用该任务的专属方法论（对应雷达一张需求卡，是 skill 换装点）
 * - 不带：用专员的轻量人格底座（自由交流、推荐任务）
 */
export async function runAgent(
  project: Project,
  stageKey: string,
  userMessage: string,
  taskKey?: string
): Promise<AgentReply> {
  const stage = getStage(stageKey);
  if (!stage?.agent) throw new Error("该环节暂未开放");
  const agent = stage.agent;
  const task = taskKey ? getTask(stageKey, taskKey) : undefined;
  const db = getDb();
  const ts = now();

  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, ts) VALUES (?, ?, 'user', ?, ?)"
  ).run(project.id, stageKey, userMessage, ts);

  // 统一群聊历史（跨全部角色，含刚插入的用户消息）
  const history = buildHistory(project.id);

  const methodology = task
    ? `本次执行专项任务：「${task.label}」，方法论如下（严格遵循）：
${task.taskPrompt}`
    : agent.basePrompt;

  const system = `你是「${agent.name}」（${SCENE_LABEL}的 AI 专员），当前服务环节：${stage.name}——${stage.description}。

${methodology}
${COMMON_PROTOCOL}

${buildContext(project, stageKey)}`;

  assertBudget();
  recordAiCall();
  trackEvent("agent_call", task ? `${agent.key}:${task.key}` : agent.key, project.id, stageKey);

  const message = await streamWithServerTools({
    model: AGENT_MODEL,
    max_tokens: 8000,
    system,
    ...(task?.webSearch
      ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 }] }
      : {}),
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  // 模型偶尔学舌历史格式在开头带【发言者】前缀，剥掉
  const raw = messageText(message).replace(/^【[^】]{1,12}】\s*/, "");
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
    display = raw.replace(m[0], "").trim() || `已完成「${title}」。`;
    trackEvent("artifact_created", title, project.id, stageKey);
  }

  db.prepare(
    "INSERT INTO messages (project_id, stage_key, role, content, artifact_id, ts) VALUES (?, ?, 'assistant', ?, ?, ?)"
  ).run(project.id, stageKey, display, artifact?.id ?? null, now());
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), project.id);

  return { text: display, artifact };
}

const SCENE_LABEL = "BD Copilot";
