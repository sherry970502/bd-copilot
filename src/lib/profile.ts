import { getDb, now } from "./db";

export interface Profile {
  content: string;
  updated_at: string;
}

/** 工作区档案：一次建档、全部项目与专员共享（内测单用户，单行） */
export function getProfile(): Profile | undefined {
  return getDb().prepare("SELECT content, updated_at FROM profile WHERE id = 1").get() as
    | Profile
    | undefined;
}

export function saveProfile(content: string): Profile {
  getDb()
    .prepare(
      "INSERT INTO profile (id, content, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at"
    )
    .run(content.trim(), now());
  return getProfile()!;
}
