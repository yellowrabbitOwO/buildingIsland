import { db, newId } from "../db";
import type { StoryboardFolder } from "../types";

export async function listStoryboardFolders(worldId: string): Promise<StoryboardFolder[]> {
  return db.storyboardFolders.where({ worldId }).toArray();
}

export async function createStoryboardFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<StoryboardFolder> {
  const folder: StoryboardFolder = { id: newId(), worldId, name, description, tagColor };
  await db.storyboardFolders.add(folder);
  return folder;
}

export async function updateStoryboardFolder(id: string, patch: Partial<StoryboardFolder>): Promise<void> {
  await db.storyboardFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的故事板 */
export async function deleteStoryboardFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.storyboards, db.storyboardFolders], async () => {
    await db.storyboards.where({ folderId: id }).modify({ folderId: undefined });
    await db.storyboardFolders.delete(id);
  });
}
