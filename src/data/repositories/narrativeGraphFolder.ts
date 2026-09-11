import { db, newId } from "../db";
import type { NarrativeGraphFolder } from "../types";

export async function listNarrativeGraphFolders(worldId: string): Promise<NarrativeGraphFolder[]> {
  return db.narrativeGraphFolders.where({ worldId }).toArray();
}

export async function createNarrativeGraphFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<NarrativeGraphFolder> {
  const folder: NarrativeGraphFolder = { id: newId(), worldId, name, description, tagColor };
  await db.narrativeGraphFolders.add(folder);
  return folder;
}

export async function updateNarrativeGraphFolder(id: string, patch: Partial<NarrativeGraphFolder>): Promise<void> {
  await db.narrativeGraphFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的分支敘事圖 */
export async function deleteNarrativeGraphFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.narrativeGraphs, db.narrativeGraphFolders], async () => {
    await db.narrativeGraphs.where({ folderId: id }).modify({ folderId: undefined });
    await db.narrativeGraphFolders.delete(id);
  });
}
