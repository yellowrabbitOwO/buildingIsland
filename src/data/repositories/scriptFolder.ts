import { db, newId } from "../db";
import type { ScriptFolder } from "../types";

export async function listScriptFolders(worldId: string): Promise<ScriptFolder[]> {
  return db.scriptFolders.where({ worldId }).toArray();
}

export async function createScriptFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<ScriptFolder> {
  const folder: ScriptFolder = { id: newId(), worldId, name, description, tagColor };
  await db.scriptFolders.add(folder);
  return folder;
}

export async function updateScriptFolder(id: string, patch: Partial<ScriptFolder>): Promise<void> {
  await db.scriptFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的文件 */
export async function deleteScriptFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.scriptDocs, db.scriptFolders], async () => {
    await db.scriptDocs.where({ folderId: id }).modify({ folderId: undefined });
    await db.scriptFolders.delete(id);
  });
}
