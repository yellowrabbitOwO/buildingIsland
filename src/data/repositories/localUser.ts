import { db, newId, nowISO } from "../db";
import type { LocalUser } from "../types";
import { ensureSampleWorld } from "../seed";
import { deleteWorld } from "./world";

export async function listLocalUsers(): Promise<LocalUser[]> {
  return db.localUsers.toArray();
}

export async function getLocalUser(id: string): Promise<LocalUser | undefined> {
  return db.localUsers.get(id);
}

/** 建立本地使用者後立刻幫他建一份專屬的範例世界（見 ensureSampleWorld），
 * 讓每個使用者一開始都有東西可以看、可以參考，不是空的世界列表 */
export async function createLocalUser(input: { name: string; avatar?: string }): Promise<LocalUser> {
  const user: LocalUser = { id: newId(), createdAt: nowISO(), ...input };
  await db.localUsers.add(user);
  await ensureSampleWorld(user.id);
  return user;
}

export async function updateLocalUser(id: string, patch: Partial<Pick<LocalUser, "name" | "avatar">>): Promise<void> {
  await db.localUsers.update(id, patch);
}

/** 刪除本地使用者連同他名下所有世界——呼叫端要自己先用 useConfirm() 警告清楚這是不可逆操作，
 * 這裡只負責執行。逐一重用既有的 deleteWorld()（world.ts）清理每個世界底下的關聯資料，
 * 不重新刻一次刪除邏輯，最後才刪 localUsers 這筆 */
export async function deleteLocalUser(id: string): Promise<void> {
  const worlds = await db.worlds.where({ localUserId: id }).toArray();
  for (const world of worlds) await deleteWorld(world.id);
  await db.localUsers.delete(id);
}
