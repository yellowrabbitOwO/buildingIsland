import { db, newId } from "../db";
import type { Category } from "../types";
import { deleteRelationsForEntry, scrubEntryLinkReferences } from "./relation";
import { deleteCharacterTimelineForEntry } from "./characterTimeline";

export async function listCategories(worldId: string): Promise<Category[]> {
  const cats = await db.categories.where({ worldId }).toArray();
  return cats.sort((a, b) => a.order - b.order);
}

export async function createCategory(worldId: string, name: string, icon?: string): Promise<Category> {
  const existing = await db.categories.where({ worldId }).toArray();
  const nextOrder = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0;
  const category: Category = {
    id: newId(),
    worldId,
    name,
    icon,
    isBuiltIn: false,
    order: nextOrder,
    defaultTemplateId: undefined,
  };
  await db.categories.add(category);
  return category;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) throw new Error("找不到分類");
  if (existing.isBuiltIn && (patch.name !== undefined || patch.icon !== undefined)) {
    throw new Error("內建分類名稱無法修改");
  }
  await db.categories.update(id, patch);
}

/** 依傳入順序重新指派 order（用於拖曳調整分類順序，內建與自訂分類皆可調整順序） */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.categories.bulkUpdate(orderedIds.map((id, order) => ({ key: id, changes: { order } })));
}

export async function deleteCategory(id: string): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) return;
  if (existing.isBuiltIn) throw new Error("內建分類無法刪除");

  let entries: { id: string; worldId: string }[] = [];
  await db.transaction(
    "rw",
    [db.entries, db.relations, db.folders, db.templates, db.groups, db.modules, db.categories],
    async () => {
      entries = await db.entries.where({ categoryId: id }).toArray();
      for (const entry of entries) {
        await deleteRelationsForEntry(entry.id);
      }
      await db.entries.bulkDelete(entries.map((e) => e.id));
      await scrubEntryLinkReferences(entries.map((e) => e.id));
      await db.folders.where({ categoryId: id }).delete();
      await db.templates.where({ categoryId: id }).delete();
      // 群組／模組的「限定分類」若引用了這個被刪除的分類，一併清掉該引用，
      // 否則該群組／模組會因為引用的分類 id 永遠比對不到任何現存分類，變成無法在任何分類下被選用
      // （update() 的型別因 FieldDef 內 NestedOptionNode 自我遞迴而推導失敗，比照 template.ts 以 any 繞過）
      const restrictedGroups = await db.groups.filter((g) => (g.restrictedCategoryIds ?? []).includes(id)).toArray();
      for (const g of restrictedGroups) {
        await (db.groups as any).update(g.id, { restrictedCategoryIds: g.restrictedCategoryIds!.filter((c) => c !== id) });
      }
      const restrictedModules = await db.modules.filter((m) => (m.restrictedCategoryIds ?? []).includes(id)).toArray();
      for (const m of restrictedModules) {
        await (db.modules as any).update(m.id, { restrictedCategoryIds: m.restrictedCategoryIds!.filter((c) => c !== id) });
      }
      await db.categories.delete(id);
    }
  );
  // 跟 deleteEntry／deleteEntries 一樣，角色時間線清理放在主交易之外做（deleteTimeline 涉及
  // timelines/timelineBranches/timelineEvents，沒有一起包進上面的交易表清單裡）——分類底下若有
  // 已設定出生日期的「角色」資訊卡，這裡漏做的話會留下指向已刪除 entryId 的幽靈時間線與事件
  for (const entry of entries) {
    await deleteCharacterTimelineForEntry(entry.id, entry.worldId);
  }
}
