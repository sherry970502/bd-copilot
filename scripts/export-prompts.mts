/**
 * 从代码生成提示词全集文档（保证与线上逐字一致）。
 * 用法：npx tsx scripts/export-prompts.mts [输出路径]
 */
import { readFileSync, writeFileSync } from "fs";
import { STAGES, SCENE } from "../src/lib/scene-pack";

const out = process.argv[2] ?? `${process.env.HOME}/Desktop/BD-Copilot-提示词全集.md`;
const today = new Date().toISOString().slice(0, 10);

function extract(file: string, constName: string): string {
  const src = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  const m = src.match(new RegExp(`const ${constName} = \`([\\s\\S]*?)\`;`));
  if (!m) throw new Error(`未找到 ${constName}`);
  return m[1].trim();
}

const COMMON = extract("ai/agent.ts", "COMMON_PROTOCOL");
const avail = STAGES.filter((s) => !s.coming);
const stageListText = avail
  .map(
    (s) =>
      `- ${s.key}（${s.name}）：${s.description}——专员：${s.agent?.name}，可交付任务：${(s.tasks ?? []).map((t) => t.label).join("、")}`
  )
  .join("\n");
const NAV = extract("ai/navigator.ts", "NAV_SYSTEM_BASE")
  .replace("{STAGE_LIST}", stageListText)
  .replace("{STAGE_KEYS}", avail.map((s) => s.key).join(" / "));

const agentSections = avail
  .map((s) => {
    const a = s.agent!;
    const tasks = (s.tasks ?? [])
      .map(
        (t) => `#### 任务：${t.label}${t.webSearch ? " 🌐联网" : ""}
> 对应：${t.cardRef ?? "—"}${t.skillRef ? `｜skillRef: ${t.skillRef}` : "｜skillRef: 待工程交付换装"}

**用户消息（点击任务发出）**：${t.prompt.includes("贴在这里") ? "（先填入输入框待粘贴材料）" : ""}
\`\`\`
${t.prompt}
\`\`\`
**任务方法论（System 注入）**：
\`\`\`
${t.taskPrompt}
\`\`\`
`
      )
      .join("\n");
    return `### ${a.emoji} ${a.name}（${s.key} · ${s.name}）

**自我介绍**：${a.intro}

**人格底座（自由聊天时的 System）**：
\`\`\`
${a.basePrompt}
\`\`\`

${tasks}`;
  })
  .join("\n---\n\n");

const doc = `# BD Copilot — 商务场景提示词全集（由代码生成于 ${today}）

> 本文档由 \`scripts/export-prompts.mts\` 从源码直接生成，与线上逐字一致。改提示词后重跑：\`npx tsx scripts/export-prompts.mts\`
> 结构：环节(6) → 专员(人格面) → **任务(一等公民)**——每个任务对应雷达一张需求卡，有独立方法论与 skillRef 换装点。
> 模型默认 claude-sonnet-5；联网搜索按任务开启（标 🌐）。

## 〇、System Prompt 拼装

**点任务** = 角色头 + 该任务方法论 + 通用协议 + 项目档案上下文
**自由聊天** = 角色头 + 专员人格底座 + 通用协议 + 项目档案上下文
**领航员** = 领航员提示词（注入环节×任务坐标系）+ 领航员版上下文

角色头模板：\`你是「{专员名}」（BD Copilot 的 AI 专员），当前服务环节：{环节名}——{环节描述}。\`

## 一、通用协议（全员共享）

\`\`\`
${COMMON}
\`\`\`

## 二、项目档案上下文（专员版）

\`\`\`
—— 项目档案 ——
我方情况（工作区档案）：{profile 建档内容}

目标对象：{target}
这次的处境与目标（用户建项目时的描述）：{situation}

已确认的产出物与进展纪要（全体专员共享，按时间序）：
【{环节名}｜{标题}】{正文}（依次全部已入档项）
\`\`\`

## 三、领航员

\`\`\`
${NAV}
\`\`\`

领航员版上下文额外含：项目时间线（近 10 条）+ 已入档产出物（每项截 1500 字）。
机器块行为：summary→纪要自动入档+时间线；plan→活计划（地图渲染）；next→「现在该做的事」按钮；status→项目状态变更。

## 四、${SCENE.name}：六位专员 × ${avail.reduce((n, s) => n + (s.tasks?.length ?? 0), 0)} 个任务

${agentSections}

## 五、参数备忘

| 项 | 值 |
|---|---|
| 模型 | BDC_MODEL，默认 claude-sonnet-5 |
| max_tokens | 专员 8000 / 领航员 4000 |
| 联网搜索 | 按任务开启（背调专员 4 个任务），≤6 次/回合 |
| 每日预算 | BDC_DAILY_AI_LIMIT 默认 100 |
| 对话记忆 | 各环节独立，近 12 条 |
| skillRef 换装点 | **任务级**——生产工程交付哪个 skill 就换哪个任务的方法论 |
`;

writeFileSync(out, doc);
console.log(`已生成：${out}（${avail.reduce((n, s) => n + (s.tasks?.length ?? 0), 0)} 个任务）`);
