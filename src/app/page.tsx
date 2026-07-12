"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SCENE } from "@/lib/scene-pack";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/types";

interface ProjectItem {
  id: number;
  name: string;
  target: string | null;
  status: ProjectStatus;
  updated_at: string;
  artifactCount: number;
  latestEvent: string | null;
}

const STATUS_CLS: Record<ProjectStatus, string> = {
  active: "text-accent border-accent/40 bg-accent/10",
  waiting: "text-warn border-warn/40 bg-warn/10",
  won: "text-good border-good/40 bg-good/10",
  shelved: "text-muted border-line bg-panel2",
};

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [ai, setAi] = useState({ calls: 0, limit: 100 });
  const [showCreate, setShowCreate] = useState(false);
  const [target, setTarget] = useState("");
  const [situation, setSituation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
      setHasProfile(data.hasProfile);
      setAi({ calls: data.aiCalls, limit: data.aiLimit });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (hasProfile === false) router.replace("/profile");
  }, [hasProfile, router]);

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, situation }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.push(`/projects/${data.project.id}`);
    else setError(data.error ?? "创建失败");
  }

  if (hasProfile === null || hasProfile === false) {
    return <main className="flex-1 flex items-center justify-center text-muted text-sm">加载中…</main>;
  }

  return (
    <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col gap-6">
      <header className="flex items-center gap-4 pt-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            <span className="text-accent">◆</span> BD Copilot
          </h1>
          <p className="text-sm text-muted mt-1">{SCENE.tagline}</p>
        </div>
        <Link href="/profile" className="text-[11px] text-muted hover:text-foreground border border-line rounded-lg px-2.5 py-1.5">
          📋 我的档案
        </Link>
        <span className="text-[11px] text-muted">AI {ai.calls}/{ai.limit}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent text-white font-semibold text-sm rounded-xl px-5 py-2.5 hover:opacity-90 shadow-lg shadow-accent/20"
        >
          ＋ 新的合作目标
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center max-w-md">
            <p className="text-4xl mb-4">🤝</p>
            <h2 className="font-bold text-lg mb-2">你想和谁谈成一次合作？</h2>
            <p className="text-sm text-muted leading-relaxed">
              告诉领航员你的处境，它会为这件事排一份专属计划——需要的环节才做，
              不需要的直接跳过。之后每次有新进展，回来说一声就能继续推进。
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 bg-accent text-white font-semibold text-sm rounded-xl px-6 py-2.5 hover:opacity-90"
            >
              开始第一个项目
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="card-soft bg-panel border border-line rounded-xl p-4 flex flex-col gap-2.5 hover:border-accent/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-bold flex-1">{p.name}</h2>
                <span className={`text-[11px] border rounded px-1.5 py-0.5 ${STATUS_CLS[p.status]}`}>
                  {PROJECT_STATUS_LABELS[p.status]}
                </span>
              </div>
              {p.latestEvent && (
                <p className="text-xs text-muted leading-relaxed line-clamp-2">
                  🕐 {p.latestEvent}
                </p>
              )}
              <span className="text-[10px] text-muted/70">档案 {p.artifactCount} 份</span>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg card-soft bg-panel border border-line rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="font-bold">新的合作目标 🤝</h2>
              <p className="text-xs text-muted mt-1">
                领航员会根据你的处境排一份专属计划——不用担心流程，说人话就行。
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted font-semibold">目标对象（公司/机构名）</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoFocus
                placeholder="例如：Suno"
                className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted font-semibold">你现在的处境、想达成什么？</span>
              <textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                rows={4}
                placeholder={"随便举几个例子：\n· 想找他们谈联名合作，但还没任何接触\n· 下周三要和他们开会了，帮我准备\n· 对方把合同发过来了，帮我看看"}
                className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
              />
            </label>
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="text-sm text-muted hover:text-foreground px-3 py-2">
                取消
              </button>
              <button
                onClick={create}
                disabled={busy || situation.trim().length < 5 || !target.trim()}
                className="bg-accent text-white font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
              >
                {busy ? "创建中…" : "开始 →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
