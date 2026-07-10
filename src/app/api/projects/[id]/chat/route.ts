import { NextResponse } from "next/server";
import { getProject } from "@/lib/projects";
import { runAgent } from "@/lib/ai/agent";

export const dynamic = "force-dynamic";

/** 专员对话：{stage, message}。消耗 1 次 AI 调用（背调专员含联网搜索） */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const project = getProject(Number(id));
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as {
    stage?: string;
    message?: string;
  };
  if (!body.stage || !body.message?.trim()) {
    return NextResponse.json({ error: "缺少环节或消息内容" }, { status: 400 });
  }
  try {
    const reply = await runAgent(project, body.stage, body.message.trim());
    return NextResponse.json(reply);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "专员开小差了，请重试" },
      { status: 500 }
    );
  }
}
