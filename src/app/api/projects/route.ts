import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/projects";
import { getTodayAiCalls, dailyLimit } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    projects: listProjects(),
    aiCalls: getTodayAiCalls(),
    aiLimit: dailyLimit(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    my_profile?: string;
    target?: string;
  };
  const myProfile = body.my_profile?.trim();
  if (!myProfile || myProfile.length < 10) {
    return NextResponse.json(
      { error: "请先介绍一下你自己/你的产品（至少一两句话），专员们全程都要用它" },
      { status: 400 }
    );
  }
  if (!body.target?.trim()) {
    return NextResponse.json(
      { error: "MVP 版本需要明确的目标对象（线索挖掘环节即将上线）" },
      { status: 400 }
    );
  }
  const project = createProject(myProfile, body.target ?? "");
  return NextResponse.json({ project }, { status: 201 });
}
