import { db, newId } from "../db";
import type { MapFolder } from "../types";

export async function listMapFolders(worldId: string): Promise<MapFolder[]> {
  return db.mapFolders.where({ worldId }).toArray();
}

export async function createMapFolder(
  worldId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<MapFolder> {
  const folder: MapFolder = { id: newId(), worldId, name, description, tagColor };
  await db.mapFolders.add(folder);
  return folder;
}

export async function updateMapFolder(id: string, patch: Partial<MapFolder>): Promise<void> {
  await db.mapFolders.update(id, patch);
}

/** 刪除資料夾時只解除歸檔（folderId 清空），不連坐刪除裡面的地圖——
 * 比照 deleteRelationGraphFolder，地圖是使用者調整過的個人化內容，不是像條目一樣的內容本體 */
export async function deleteMapFolder(id: string): Promise<void> {
  await db.transaction("rw", [db.maps, db.mapFolders], async () => {
    await db.maps.where({ folderId: id }).modify({ folderId: undefined });
    await db.mapFolders.delete(id);
  });
}
