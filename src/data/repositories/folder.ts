import { db, newId } from "../db";
import type { EntryFolder } from "../types";
import { deleteRelationsForEntry, scrubEntryLinkReferences } from "./relation";
import { deleteCharacterTimelineForEntry } from "./characterTimeline";

export async function listFolders(worldId: string, categoryId: string): Promise<EntryFolder[]> {
  return db.folders.where({ worldId, categoryId }).toArray();
}

export async function createFolder(
  worldId: string,
  categoryId: string,
  name: string,
  description?: string,
  tagColor?: string
): Promise<EntryFolder> {
  const folder: EntryFolder = { id: newId(), worldId, categoryId, name, description, tagColor };
  await db.folders.add(folder);
  return folder;
}

export async function updateFolder(id: string, patch: Partial<EntryFolder>): Promise<void> {
  await db.folders.update(id, patch);
}

/** 刪除資料夾時，其中的條目會一併刪除（而非移回未分類） */
export async function deleteFolder(id: string): Promise<void> {
  let entries: { id: string; worldId: string }[] = [];
  await db.transaction("rw", [db.entries, db.relations, db.folders], async () => {
    entries = await db.entries.where({ folderId: id }).toArray();
    for (const entry of entries) {
      await deleteRelationsForEntry(entry.id);
    }
    await db.entries.bulkDelete(entries.map((e) => e.id));
    await scrubEntryLinkReferences(entries.map((e) => e.id));
    await db.folders.delete(id);
  });
  // 跟 deleteEntry／deleteEntries／deleteCategory 一樣，角色時間線清理放在主交易之外做——資料夾底下
  // 若有已設定出生日期的「角色」資訊卡，這裡漏做的話會留下指向已刪除 entryId 的幽靈時間線與事件
  for (const entry of entries) {
    await deleteCharacterTimelineForEntry(entry.id, entry.worldId);
  }
}
