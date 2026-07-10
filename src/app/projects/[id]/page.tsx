"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { STAGES, getStage } from "@/lib/scene-pack";
import type { Artifact, ChatMessage, Project, ProjectStage, StageStatus } from "@/lib/types";

const STAGE_PILL: Record<StageStatus, string> = {
  pending: "border-line text-muted",
  active: "border-accent/70 text-accent bg-accent/10",
  done: "border-good/50 text-good bg-good/10",
  skipped: "border-line text-muted/50 line-through",
};

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewArtifact, setViewArtifact] = useState<Artifact | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (stageKey?: string) => {
      const key = stageKey ?? selected;
      const res = await fetch(`/api/projects/${projectId}${key ? `?stage=${key}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data.project);
        setStages(data.stages);
        setArtifacts(data.artifacts);
        if (key) setMessages(data.messages);
        if (!selected) setSelected(data.project.current_stage);
      }
    },
    [projectId, selected]
  );

  useEffect(() => {
    load(selected || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, selected]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const stageDef = getStage(selected);
  const stageState = stages.find((s) => s.stage_key === selected);
  const stageArtifacts = artifacts.filter((a) => a.stage_key === selected);
  const confirmedAll = artifacts.filter((a) => a.status === "confirmed");

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((m) => [
      ...m,
      { id: -1, project_id: projectId, stage_key: selected, role: "user", content: text, ts: "" },
    ]);
    // 进入环节即视为激活
    if (stageState?.status === "pending") {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: selected, status: "active" }),
      });
    }
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected, message: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error ?? "出错了，请重试");
    await load(selected);
  }

  async function setStage(status: StageStatus) {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: selected, status }),
    });
    // 完成后自动推进到下一个未完成的可用环节
    if (status === "done") {
      const idx = STAGES.findIndex((s) => s.key === selected);
      const next = STAGES.slice(idx + 1).find(
        (s) => !s.coming && stages.find((x) => x.stage_key === s.key)?.status !== "done"
      );
      if (next) {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: next.key, status: "active" }),
        });
        setSelected(next.key);
        return;
      }
    }
    await load(selected);
  }

  async function patchArtifact(id: number, body: Record<string, string>) {
    await fetch(`/api/artifacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load(selected);
  }

  if (!project) {
    return <main className="flex-1 flex items-center justify-center text-muted text-sm">加载中…</main>;
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* 顶栏 */}
      <header className="border-b border-line bg-panel px-5 py-3 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-muted hover:text-foreground text-sm">← 项目</Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[15px] truncate">{project.name}</h1>
        </div>
        <span className="text-[11px] text-muted hidden sm:block">
          目标：{project.target ?? "未明确"}
        </span>
      </header>

      {/* 旅程条 */}
      <div className="border-b border-line bg-panel/60 px-5 py-2.5 flex items-center gap-1.5 overflow-x-auto shrink-0">
        {STAGES.map((s, i) => {
          const st = stages.find((x) => x.stage_key === s.key)?.status ?? "pending";
          return (
            <div key={s.key} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && <span className="text-muted/40 text-xs">→</span>}
              <button
                disabled={!!s.coming}
                onClick={() => setSelected(s.key)}
                title={s.description}
                className={`text-xs border rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors ${
                  s.coming
                    ? "border-line/50 text-muted/40 cursor-not-allowed"
                    : selected === s.key
                      ? "border-accent text-accent bg-accent/15 font-bold"
                      : STAGE_PILL[st]
                }`}
              >
                {st === "done" ? "✓ " : ""}
                {s.name}
                {s.coming ? "（V2）" : ""}
              </button>
            </div>
          );
        })}
      </div>

      {/* 工作台 */}
      <div className="flex-1 flex min-h-0">
        {/* 左：专员对话 */}
        <div className="flex-1 flex flex-col min-w-0">
          {stageDef?.agent ? (
            <>
              <div className="px-5 py-3 border-b border-line/60 flex items-start gap-3 shrink-0">
                <span className="text-2xl">{stageDef.agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm">{stageDef.agent.name}</h2>
                    <span className="text-[10px] text-muted">{stageDef.name}</span>
                    {stageState?.status !== "done" ? (
                      <button
                        onClick={() => setStage("done")}
                        className="ml-auto text-[11px] border border-good/40 text-good rounded-lg px-2.5 py-1 hover:bg-good/10"
                      >
                        标记完成 →
                      </button>
                    ) : (
                      <button
                        onClick={() => setStage("active")}
                        className="ml-auto text-[11px] border border-line text-muted rounded-lg px-2.5 py-1 hover:text-foreground"
                      >
                        重新打开
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{stageDef.agent.intro}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                {messages.length === 0 && (
                  <div className="flex flex-col gap-2 items-start">
                    <p className="text-xs text-muted">一键任务（也可以直接在下面输入）：</p>
                    {stageDef.agent.tasks.map((t) => (
                      <button
                        key={t.key}
                        disabled={busy}
                        onClick={() =>
                          t.prompt.includes("粘贴在这里") ? setInput(t.prompt) : send(t.prompt)
                        }
                        className="text-sm border border-accent/40 text-accent rounded-xl px-4 py-2 hover:bg-accent/10 disabled:opacity-40 text-left"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-accent/15 border border-accent/30"
                          : "bg-panel border border-line"
                      }`}
                    >
                      <div className="prose-sm prose-invert [&_p]:my-1.5 [&_ul]:my-1.5 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-sm">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-accent animate-pulse">
                    {stageDef.agent.emoji} {stageDef.agent.name}工作中…
                    {stageDef.agent.webSearch ? "（含联网搜索，约 1-2 分钟）" : ""}
                  </div>
                )}
                {error && <p className="text-xs text-bad">{error}</p>}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-line px-5 py-3 shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    rows={Math.min(6, Math.max(1, input.split("\n").length))}
                    placeholder={`对${stageDef.agent.name}说…（Enter 发送，Shift+Enter 换行）`}
                    className="flex-1 bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={busy || !input.trim()}
                    className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-3 disabled:opacity-40 hover:opacity-90"
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">
              该环节即将上线（V2）
            </div>
          )}
        </div>

        {/* 右：产出物档案 */}
        <aside className="w-80 border-l border-line bg-panel/40 overflow-y-auto p-4 flex flex-col gap-4 shrink-0 hidden lg:flex">
          <div>
            <h3 className="text-xs text-muted font-semibold mb-2">本环节产出物（{stageArtifacts.length}）</h3>
            <div className="flex flex-col gap-2">
              {stageArtifacts.length === 0 && (
                <p className="text-[11px] text-muted/60">专员产出的报告/文案会出现在这里</p>
              )}
              {stageArtifacts.map((a) => (
                <div key={a.id} className="bg-panel border border-line rounded-xl p-3 flex flex-col gap-2">
                  <button onClick={() => setViewArtifact(a)} className="text-left">
                    <div className="text-[13px] font-medium leading-snug hover:text-accent">📄 {a.title}</div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    {a.status === "confirmed" ? (
                      <span className="text-[10px] border border-good/40 bg-good/10 text-good rounded px-1.5 py-0.5">
                        ✓ 已入档
                      </span>
                    ) : (
                      <button
                        onClick={() => patchArtifact(a.id, { status: "confirmed" })}
                        className="text-[10px] border border-accent/50 text-accent rounded px-2 py-0.5 hover:bg-accent/10"
                      >
                        确认入档 →
                      </button>
                    )}
                    <button
                      onClick={() => setViewArtifact(a)}
                      className="text-[10px] text-muted hover:text-foreground"
                    >
                      查看
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <h3 className="text-xs text-muted font-semibold mb-2">
              项目档案（已入档 {confirmedAll.length}，全体专员共享）
            </h3>
            <div className="flex flex-col gap-1">
              {confirmedAll.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setViewArtifact(a)}
                  className="text-left text-[11px] text-muted hover:text-foreground truncate"
                >
                  {getStage(a.stage_key)?.agent?.emoji ?? "📄"} {a.title}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 产出物查看/编辑 */}
      {viewArtifact && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setViewArtifact(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-panel border border-line rounded-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2 shrink-0">
              <h2 className="font-bold text-sm flex-1">📄 {viewArtifact.title}</h2>
              {viewArtifact.status === "draft" && (
                <button
                  onClick={async () => {
                    await patchArtifact(viewArtifact.id, { status: "confirmed" });
                    setViewArtifact(null);
                  }}
                  className="text-xs bg-accent text-black font-semibold rounded-lg px-3 py-1.5 hover:opacity-90"
                >
                  确认入档 →
                </button>
              )}
              <button
                onClick={async () => {
                  if (confirm("删除这份产出物？")) {
                    await fetch(`/api/artifacts/${viewArtifact.id}`, { method: "DELETE" });
                    setViewArtifact(null);
                    await load(selected);
                  }
                }}
                className="text-xs text-muted hover:text-bad px-2"
              >
                删除
              </button>
              <button onClick={() => setViewArtifact(null)} className="text-muted hover:text-foreground text-lg px-1">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-5 prose-sm prose-invert [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_p]:my-2 [&_table]:text-xs">
              <ReactMarkdown>{viewArtifact.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
