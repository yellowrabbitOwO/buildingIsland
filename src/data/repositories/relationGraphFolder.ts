import { db, newId } from "../db";
import type { RelationGraphFolder } from "../types";

export async function listRelationGraphFolders(worldId: string): Promise<RelationGraphFolder[]> {
  return db.relationGraphFolders.where({ worldId }).toArray();
}

export async function createRelationGraphFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<RelationGraphFolder> {
  const folder: RelationGraphFolder = { id: newId(), worldId, name, description, tagColor };
  await db.relationGraphFolders.add(folder);
  return folder;
}

export async function updateRelationGraphFolder(id: string, patch: Partial<RelationGraphFolder>): Promise<void> {
  await db.relationGraphFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的關係圖——
 * 關係圖是使用者調整過的個人化設定，不是像條目一樣的內容本體 */
export async function deleteRelationGraphFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.relationGraphs, db.relationGraphFolders], async () => {
    await db.relationGraphs.where({ folderId: id }).modify({ folderId: undefined });
    await db.relationGraphFolders.delete(id);
  });
}
