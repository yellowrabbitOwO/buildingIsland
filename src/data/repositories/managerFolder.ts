import { db, newId } from "../db";
import type { ManagerFolder, ManagerKind, Scope } from "../types";

export async function listManagerFolders(kind: ManagerKind, worldId: string): Promise<ManagerFolder[]> {
  const all = await db.managerFolders.where({ kind }).toArray();
  return all.filter((f) => f.scope === "global" || f.worldId === worldId).sort((a, b) => a.order - b.order);
}

export async function createManagerFolder(
  kind: ManagerKind,
  name: string,
  scope: Scope,
  worldId: string,
  tagColor?: string,
  parentFolderId?: string
): Promise<ManagerFolder> {
  const existing = await db.managerFolders.where({ kind }).toArray();
  const nextOrder = existing.length ? Math.max(...existing.map((f) => f.order)) + 1 : 0;
  const folder: ManagerFolder = {
    id: newId(),
    kind,
    worldId: scope === "world" ? worldId : undefined,
    scope,
    name,
    order: nextOrder,
    tagColor: tagColor || "#c9a463",
    parentFolderId,
  };
  await db.managerFolders.add(folder);
  return folder;
}

export async function updateManagerFolder(id: string, patch: Partial<ManagerFolder>): Promise<void> {
  await db.managerFolders.update(id, patch);
}

export interface ManagerFolderNode {
  folder: ManagerFolder;
  children: ManagerFolderNode[];
}

/** 把扁平的資料夾清單組成樹狀結構（同一個 order 排序在每一層都保留）；
 * parentFolderId 指到的父層若不在目前清單內（例如被篩掉的其他 kind／世界），該資料夾視為頂層 */
export function buildFolderTree(folders: ManagerFolder[]): ManagerFolderNode[] {
  const byId = new Set(folders.map((f) => f.id));
  const childrenOf = new Map<string, ManagerFolder[]>();
  const roots: ManagerFolder[] = [];
  for (const f of folders) {
    if (f.parentFolderId && byId.has(f.parentFolderId)) {
      if (!childrenOf.has(f.parentFolderId)) childrenOf.set(f.parentFolderId, []);
      childrenOf.get(f.parentFolderId)!.push(f);
    } else {
      roots.push(f);
    }
  }
  const build = (f: ManagerFolder): ManagerFolderNode => ({
    folder: f,
    children: (childrenOf.get(f.id) ?? []).map(build),
  });
  return roots.map(build);
}

/** 把資料夾樹壓平成一個陣列，保留「父層先、子層緊接在後」的順序，並附上巢狀深度；
 * 用於資料夾選擇面板，讓縮排能正確反映親子關係（而不只是隨機順序加縮排） */
export function flattenFolderTree(nodes: ManagerFolderNode[], depth = 0): { folder: ManagerFolder; depth: number }[] {
  const result: { folder: ManagerFolder; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ folder: node.folder, depth });
    result.push(...flattenFolderTree(node.children, depth + 1));
  }
  return result;
}

/** 某資料夾自己＋所有子孫資料夾的 id 集合；用來做遞迴刪除，或防止把資料夾移進自己的子孫底下形成循環 */
export function descendantFolderIds(folderId: string, folders: ManagerFolder[]): Set<string> {
  const result = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parentFolderId && result.has(f.parentFolderId) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
    }
  }
  return result;
}

/** 依 folderId 將項目分組到各資料夾；沒有對應資料夾（或 folderId 未設定）的項目歸入 unfiled */
export function partitionByFolder<T extends { folderId?: string }>(
  items: T[],
  folders: ManagerFolder[]
): { byFolder: Map<string, T[]>; unfiled: T[] } {
  const byFolder = new Map<string, T[]>();
  folders.forEach((f) => byFolder.set(f.id, []));
  const unfiled: T[] = [];
  for (const item of items) {
    if (item.folderId && byFolder.has(item.folderId)) byFolder.get(item.folderId)!.push(item);
    else unfiled.push(item);
  }
  return { byFolder, unfiled };
}

/** 刪除管理資料夾時，其中的項目會一併刪除（而非移回未分類），子資料夾（含其內容）也會一併遞迴刪除；
 * 已套用於既有條目的內容不受影響 */
export async function deleteManagerFolder(id: string): Promise<void> {
  const target = await db.managerFolders.get(id);
  if (!target) return;
  const sameKind = await db.managerFolders.where({ kind: target.kind }).toArray();
  const ids = [...descendantFolderIds(id, sameKind)];

  // storyChapterTemplates 的 blocks 型別跟 template.ts 的 templates 同源，含 NestedOptionNode 這種
  // 自我遞迴型別，加進 db.transaction() 的表格清單會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  // （比照 storyChapter.ts/template.ts 既有的既有做法）
  const chapterTemplatesTable = db.storyChapterTemplates as any;
  await db.transaction(
    "rw",
    [db.managerFolders, db.templates, chapterTemplatesTable, db.groups, db.modules, db.colorSwatches, db.calendars, db.assets],
    async () => {
      await db.managerFolders.bulkDelete(ids);
      for (const fid of ids) {
        const templates = await db.templates.filter((t) => t.folderId === fid).toArray();
        await db.templates.bulkDelete(templates.map((t) => t.id));
        const chapterTemplates = await chapterTemplatesTable.filter((t: { folderId?: string }) => t.folderId === fid).toArray();
        await chapterTemplatesTable.bulkDelete(chapterTemplates.map((t: { id: string }) => t.id));
        const groups = await db.groups.filter((g) => g.folderId === fid).toArray();
        await db.groups.bulkDelete(groups.map((g) => g.id));
        const modules = await db.modules.filter((m) => m.folderId === fid).toArray();
        await db.modules.bulkDelete(modules.map((m) => m.id));
        const colors = await db.colorSwatches.filter((c) => c.folderId === fid).toArray();
        await db.colorSwatches.bulkDelete(colors.map((c) => c.id));
        // 曆法不像範本/群組/模組/標籤色彩那樣「刪了只是不再套用」——時間線的 calendarId 會變成懸空參照，
        // 呼叫端（TemplateManagerPage 的 handleDeleteFolder）必須先用 listTimelinesUsingCalendar
        // 確認資料夾內（含子資料夾）沒有曆法正被使用中，這裡只負責實際刪除
        const calendars = await db.calendars.filter((c) => c.folderId === fid).toArray();
        await db.calendars.bulkDelete(calendars.map((c) => c.id));
        const assets = await db.assets.filter((a) => a.folderId === fid).toArray();
        await db.assets.bulkDelete(assets.map((a) => a.id));
      }
    }
  );
}
