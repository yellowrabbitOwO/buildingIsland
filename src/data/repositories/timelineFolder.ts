import { db, newId } from "../db";
import type { TimelineFolder } from "../types";

export async function listTimelineFolders(worldId: string): Promise<TimelineFolder[]> {
  return db.timelineFolders.where({ worldId }).toArray();
}

export async function createTimelineFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<TimelineFolder> {
  const folder: TimelineFolder = { id: newId(), worldId, name, description, tagColor };
  await db.timelineFolders.add(folder);
  return folder;
}

export async function updateTimelineFolder(id: string, patch: Partial<TimelineFolder>): Promise<void> {
  await db.timelineFolders.update(id, patch);
}

/** 找出（沒有就自動建立）這個世界的「角色時間線」資料夾——每個角色自己的時間線、以及彙整
 * 全部角色的「全部角色」時間線，第一次自動同步時都會歸檔進這個資料夾，供 characterTimeline.ts
 * 用。用 name 比對既有資料夾而非另外存一個固定 id 欄位——這個資料夾本身沒有特殊識別需求，
 * 純粹是自動幫使用者整理，找到既有的就沿用，找不到才建立新的，不會重複建立 */
export async function getOrCreateCharacterTimelineFolder(worldId: string): Promise<TimelineFolder> {
  const existing = await db.timelineFolders.where({ worldId }).filter((f) => f.name === "角色時間線").first();
  if (existing) return existing;
  return createTimelineFolder(worldId, "角色時間線");
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的時間線 */
export async function deleteTimelineFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.timelines, db.timelineFolders], async () => {
    await db.timelines.where({ folderId: id }).modify({ folderId: undefined });
    await db.timelineFolders.delete(id);
  });
}
