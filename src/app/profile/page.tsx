"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TEMPLATE = `【我们是谁 / 做什么的】


【产品或服务的核心优势】


【手里有什么资源可以拿去交换】（用户量 / 渠道 / 内容 / 技术 / 数据…）


【想通过商务合作得到什么】
`;

export default function ProfilePage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setContent(d.profile.content);
          setExisting(true);
        } else {
          setContent(TEMPLATE);
        }
      });
  }, []);

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.push("/");
    else setError(data.error ?? "保存失败");
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto p-6 flex flex-col gap-5">
      <header className="pt-4">
        {existing && (
          <Link href="/" className="text-xs text-muted hover:text-foreground">← 返回项目</Link>
        )}
        <h1 className="text-xl font-bold mt-2">
          {existing ? "工作区档案" : "先花两分钟建档 📋"}
        </h1>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          这份档案是你的 AI 专员团队全程的工作依据——背调专员靠它找合作切入点、
          外联专员靠它写破冰、提案专员靠它设计权益交换。写得越具体，团队干得越好。
          所有项目共用，随时可以回来改。
        </p>
      </header>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={18}
        autoFocus
        className="card-soft bg-panel border border-line rounded-2xl p-4 text-sm leading-relaxed outline-none focus:border-accent resize-none"
      />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        onClick={save}
        disabled={busy || content.trim().length < 20}
        className="self-end bg-accent text-white font-semibold text-sm rounded-xl px-6 py-2.5 disabled:opacity-40 hover:opacity-90"
      >
        {busy ? "保存中…" : existing ? "保存修改" : "建档完成，开始 →"}
      </button>
    </main>
  );
}
