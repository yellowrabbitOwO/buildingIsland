import { db, newId } from "../db";
import type { StoryOutlineFolder } from "../types";

export async function listStoryOutlineFolders(worldId: string): Promise<StoryOutlineFolder[]> {
  return db.storyOutlineFolders.where({ worldId }).toArray();
}

export async function createStoryOutlineFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<StoryOutlineFolder> {
  const folder: StoryOutlineFolder = { id: newId(), worldId, name, description, tagColor };
  await db.storyOutlineFolders.add(folder);
  return folder;
}

export async function updateStoryOutlineFolder(id: string, patch: Partial<StoryOutlineFolder>): Promise<void> {
  await db.storyOutlineFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的章節大綱 */
export async function deleteStoryOutlineFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.storyOutlines, db.storyOutlineFolders], async () => {
    await db.storyOutlines.where({ folderId: id }).modify({ folderId: undefined });
    await db.storyOutlineFolders.delete(id);
  });
}
