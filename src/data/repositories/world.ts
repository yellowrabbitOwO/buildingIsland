import Dexie from "dexie";
import { db, newId, nowISO } from "../db";
import type { World } from "../types";
import { ensureBuiltInCategories } from "../seed";
import { ensureBuiltInLandmarkIconTypes } from "./landmarkIconType";
import { skipVersionHistoryFor } from "../versionHistory";

export async function listWorlds(): Promise<World[]> {
  return db.worlds.orderBy("updatedAt").reverse().toArray();
}

export async function getWorld(id: string): Promise<World | undefined> {
  return db.worlds.get(id);
}

export async function createWorld(input: {
  name: string;
  description?: string;
  coverImage?: string;
  coverColor?: string;
  tagColor?: string;
  localUserId: string;
}): Promise<World> {
  const world: World = {
    id: newId(),
    isSample: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...input,
  };
  await db.worlds.add(world);
  await ensureBuiltInCategories(world.id);
  await ensureBuiltInLandmarkIconTypes(world.id);
  return world;
}

export async function updateWorld(id: string, patch: Partial<World>): Promise<void> {
  const existing = await db.worlds.get(id);
  if (!existing) throw new Error("找不到世界");
  if (existing.isSample) throw new Error("範例世界無法修改");
  await db.worlds.update(id, { ...patch, updatedAt: nowISO() });
}

/** 分類色塊目前刻意允許在範例世界修改（之後會鎖回範例世界唯讀），故不走 updateWorld 的唯讀檢查 */
export async function updateWorldCategoryColors(id: string, categoryColors: Record<string, string>): Promise<void> {
  await db.worlds.update(id, { categoryColors, updatedAt: nowISO() });
}

/** 世界預設曆法：新增時間欄位時自動代入，減少每個時間欄位都要手動選曆法的重複操作
 * （見 FieldSlotEditor.tsx、resolveTemplateFields）。比照 updateWorldCategoryColors，
 * 是偏好設定而非世界內容，允許在範例世界修改，不走 updateWorld 的唯讀檢查 */
export async function updateWorldDefaultCalendar(id: string, calendarId: string | undefined): Promise<void> {
  await db.worlds.update(id, { defaultCalendarId: calendarId, updatedAt: nowISO() });
}

export async function deleteWorld(id: string): Promise<void> {
  const categories = await db.categories.where({ worldId: id }).toArray();
  const categoryIds = categories.map((c) => c.id);
  const entries = await db.entries.where({ worldId: id }).toArray();
  const entryIds = entries.map((e) => e.id);

  const narrativeGraphIds = (await db.narrativeGraphs.where({ worldId: id }).toArray()).map((g) => g.id);
  const storyboardIds = (await db.storyboards.where({ worldId: id }).toArray()).map((b) => b.id);
  const timelineIds = (await db.timelines.where({ worldId: id }).toArray()).map((t) => t.id);
  const storyOutlineIds = (await db.storyOutlines.where({ worldId: id }).toArray()).map((o) => o.id);

  await db.transaction(
    "rw",
    [
      db.worlds,
      db.categories,
      db.folders,
      db.entries,
      db.groups,
      db.modules,
      db.templates,
      db.relations,
      db.colorSwatches,
      db.managerFolders,
      db.relationGraphs,
      db.relationGraphFolders,
      db.maps,
      db.mapFolders,
      db.narrativeGraphs,
      db.narrativeGraphFolders,
      db.passages,
      db.writingFolders,
      db.writingDocs,
      db.storyboardFolders,
      db.storyboards,
      db.storyboardCards,
      db.scriptFolders,
      db.scriptDocs,
      db.calendars,
      db.timelineFolders,
      db.timelines,
      db.timelineBranches,
      db.timelineEvents,
      db.landmarkIconTypes,
      db.storyOutlines,
      db.storyOutlineFolders,
      db.storyChapters,
      db.contentVersions,
      db.assets,
    ],
    async () => {
      if (Dexie.currentTransaction) skipVersionHistoryFor(Dexie.currentTransaction);
      await db.relations
        .filter((r) => entryIds.includes(r.fromEntryId) || entryIds.includes(r.toEntryId))
        .delete();
      await db.entries.bulkDelete(entryIds);
      await db.folders.where({ worldId: id }).delete();
      await db.categories.bulkDelete(categoryIds);
      await db.groups.where({ worldId: id }).delete();
      await db.modules.where({ worldId: id }).delete();
      await db.templates.where({ worldId: id }).delete();
      await db.colorSwatches.filter((c) => c.worldId === id).delete();
      await db.managerFolders.where({ worldId: id }).delete();
      await db.relationGraphs.where({ worldId: id }).delete();
      await db.relationGraphFolders.where({ worldId: id }).delete();
      await db.maps.where({ worldId: id }).delete();
      await db.mapFolders.where({ worldId: id }).delete();
      await db.passages.where("graphId").anyOf(narrativeGraphIds).delete();
      await db.narrativeGraphs.where({ worldId: id }).delete();
      await db.narrativeGraphFolders.where({ worldId: id }).delete();
      await db.writingDocs.where({ worldId: id }).delete();
      await db.writingFolders.where({ worldId: id }).delete();
      await db.storyboardCards.where("storyboardId").anyOf(storyboardIds).delete();
      await db.storyboards.where({ worldId: id }).delete();
      await db.storyboardFolders.where({ worldId: id }).delete();
      await db.scriptDocs.where({ worldId: id }).delete();
      await db.scriptFolders.where({ worldId: id }).delete();
      await db.timelineEvents.where("timelineId").anyOf(timelineIds).delete();
      await db.timelineBranches.where("timelineId").anyOf(timelineIds).delete();
      await db.timelines.where({ worldId: id }).delete();
      await db.timelineFolders.where({ worldId: id }).delete();
      await db.calendars.where({ worldId: id }).delete();
      await db.landmarkIconTypes.where({ worldId: id }).delete();
      await db.assets.where({ worldId: id }).delete();
      await db.storyChapters.where("outlineId").anyOf(storyOutlineIds).delete();
      await db.storyOutlines.where({ worldId: id }).delete();
      await db.storyOutlineFolders.where({ worldId: id }).delete();
      await db.worlds.delete(id);
      // 上面各張表刪除時 hook 都會各自留一筆「刪除前」快照到 contentVersions，
      // 但沒有人會主動清掉整個世界過去累積的版本歷史——世界都刪了，這些快照
      // 永遠不會被復原，不清掉的話會永久佔用空間
      await db.contentVersions.where({ worldId: id }).delete();
      await db.contentVersions.where({ entityType: "worlds", entityId: id }).delete();
    }
  );
}
