import { db, newId } from "../db";
import type { WritingFolder } from "../types";

export async function listWritingFolders(worldId: string): Promise<WritingFolder[]> {
  return db.writingFolders.where({ worldId }).toArray();
}

export async function createWritingFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<WritingFolder> {
  const folder: WritingFolder = { id: newId(), worldId, name, description, tagColor };
  await db.writingFolders.add(folder);
  return folder;
}

export async function updateWritingFolder(id: string, patch: Partial<WritingFolder>): Promise<void> {
  await db.writingFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的文件 */
export async function deleteWritingFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.writingDocs, db.writingFolders], async () => {
    await db.writingDocs.where({ folderId: id }).modify({ folderId: undefined });
    await db.writingFolders.delete(id);
  });
}
