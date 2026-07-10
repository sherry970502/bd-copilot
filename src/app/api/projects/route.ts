import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { getProfile } from "@/lib/profile";
import { getTodayAiCalls, dailyLimit } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    projects: listProjects(),
    hasProfile: !!getProfile(),
    aiCalls: getTodayAiCalls(),
    aiLimit: dailyLimit(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    target?: string;
    situation?: string;
  };
  if (!getProfile()) {
    return NextResponse.json({ error: "请先完成建档" }, { status: 400 });
  }
  if (!body.target?.trim()) {
    return NextResponse.json(
      { error: "需要明确的目标对象（线索挖掘环节即将上线）" },
      { status: 400 }
    );
  }
  const situation = body.situation?.trim();
  if (!situation || situation.length < 5) {
    return NextResponse.json(
      { error: "说说你现在的处境和想达成什么——领航员靠它排计划" },
      { status: 400 }
    );
  }
  const project = createProject(body.target, situation);
  return NextResponse.json({ project }, { status: 201 });
}
