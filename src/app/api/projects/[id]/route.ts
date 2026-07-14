import { NextResponse } from "next/server";
import { getProjectDetail, setStageStatus, setProjectStatus } from "@/lib/projects";
import { getStage } from "@/lib/scene-pack";
import { PROJECT_STATUS_LABELS, type ProjectStatus, type StageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const detail = getProjectDetail(Number(id));
  if (!detail) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json(detail);
}

/** 环节流转 {stage, status} 或 项目状态 {project_status} */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    stage?: string;
    status?: StageStatus;
    project_status?: ProjectStatus;
  };
  if (body.project_status) {
    if (!(body.project_status in PROJECT_STATUS_LABELS)) {
      return NextResponse.json({ error: "无效的项目状态" }, { status: 400 });
    }
    if (!getProjectDetail(Number(id))) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    setProjectStatus(Number(id), body.project_status);
    return NextResponse.json({ ok: true });
  }
  if (!body.stage || !getStage(body.stage) || !body.status) {
    return NextResponse.json({ error: "无效的环节或状态" }, { status: 400 });
  }
  if (getStage(body.stage)?.coming && body.status === "active") {
    return NextResponse.json({ error: "该环节即将上线" }, { status: 400 });
  }
  if (!getProjectDetail(Number(id))) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  setStageStatus(Number(id), body.stage, body.status);
  return NextResponse.json({ ok: true });
}
