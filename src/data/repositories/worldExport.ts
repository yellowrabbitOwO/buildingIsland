import { db, nowISO } from "../db";
import { getRelationsForWorld } from "./relation";
import type {
  World,
  Category,
  EntryFolder,
  Entry,
  Relation,
  FieldGroup,
  FieldModule,
  Template,
  StoryChapterTemplate,
  ColorSwatch,
  ManagerFolder,
  Calendar,
  RelationGraphFolder,
  RelationGraphView,
  MapFolder,
  MapView,
  NarrativeGraphFolder,
  NarrativeGraph,
  Passage,
  WritingFolder,
  WritingDoc,
  StoryboardFolder,
  Storyboard,
  StoryboardCard,
  StoryOutlineFolder,
  StoryOutline,
  StoryChapter,
  ScriptFolder,
  ScriptDoc,
  TimelineFolder,
  Timeline,
  TimelineBranch,
  TimelineEvent,
  LandmarkIconType,
} from "../types";

/** 三種匯出範圍共用的資訊 */
interface ExportMeta {
  schemaVersion: 1;
  exportedAt: string;
}

export interface WorldExportBundle extends ExportMeta {
  scope: "world";
  world: World;
  categories: Category[];
  folders: EntryFolder[];
  entries: Entry[];
  relations: Relation[];
  groups: FieldGroup[];
  modules: FieldModule[];
  templates: Template[];
  storyChapterTemplates: StoryChapterTemplate[];
  colorSwatches: ColorSwatch[];
  managerFolders: ManagerFolder[];
  calendars: Calendar[];
  relationGraphFolders: RelationGraphFolder[];
  relationGraphs: RelationGraphView[];
  mapFolders: MapFolder[];
  maps: MapView[];
  narrativeGraphFolders: NarrativeGraphFolder[];
  narrativeGraphs: NarrativeGraph[];
  passages: Passage[];
  writingFolders: WritingFolder[];
  writingDocs: WritingDoc[];
  storyboardFolders: StoryboardFolder[];
  storyboards: Storyboard[];
  storyboardCards: StoryboardCard[];
  storyOutlineFolders: StoryOutlineFolder[];
  storyOutlines: StoryOutline[];
  storyChapters: StoryChapter[];
  scriptFolders: ScriptFolder[];
  scriptDocs: ScriptDoc[];
  timelineFolders: TimelineFolder[];
  timelines: Timeline[];
  timelineBranches: TimelineBranch[];
  timelineEvents: TimelineEvent[];
  landmarkIconTypes: LandmarkIconType[];
}

/** 可複選一或多個分類；relations 只保留兩端都落在這些分類撈到的條目集合內的 */
export interface CategoryExportBundle extends ExportMeta {
  scope: "category";
  categories: Category[];
  folders: EntryFolder[];
  entries: Entry[];
  relations: Relation[];
}

/** 可複選一或多筆條目 */
export interface EntryExportBundle extends ExportMeta {
  scope: "entry";
  entries: Entry[];
  /** entryLink／nested(mode:"category") 欄位存的只是條目 id，這裡額外附一份查表，
   * 讓單一/多筆條目匯出也能知道連結對象叫什麼名字，不用另外再去資料庫查 */
  linkedEntryNames: Record<string, string>;
}

/** 「scope: world/global」型的表只匯出屬於這個世界自己的那一份，global（跨世界共用）的略過——
 * 沿用 template.ts 既有的 `.toArray().filter()` 寫法（這幾張表都沒有替 scope+worldId 建複合索引）。
 * 接純陣列而不是直接吃 Dexie 的 Table 物件，是因為 Table.toArray() 帶多載，讓 TS 沒辦法從
 * 「接一個 table-like 物件」這種寫法正確推導出 T，會整個退化成只符合約束的最小型別 */
function filterWorldScoped<T extends { scope?: string; worldId?: string }>(rows: T[], worldId: string): T[] {
  return rows.filter((row) => row.scope === "world" && row.worldId === worldId);
}

/** 匯出整個世界：26 張表當中屬於這個世界的所有列，是唯一設計成「以後可以拿來重新匯入整個世界」
 * 的完整格式；global（跨世界共用）的範本/模組/群組/曆法/標籤色彩/資料夾不算「這個世界的資料」，不匯出 */
export async function collectWorldExport(worldId: string): Promise<WorldExportBundle> {
  const world = await db.worlds.get(worldId);
  if (!world) throw new Error("找不到這個世界");

  const [
    categories,
    folders,
    entries,
    relations,
    groups,
    modules,
    templates,
    storyChapterTemplates,
    colorSwatches,
    managerFolders,
    calendars,
    relationGraphFolders,
    relationGraphs,
    mapFolders,
    maps,
    narrativeGraphFolders,
    narrativeGraphs,
    passages,
    writingFolders,
    writingDocs,
    storyboardFolders,
    storyboards,
    storyOutlineFolders,
    storyOutlines,
    scriptFolders,
    scriptDocs,
    timelineFolders,
    timelines,
    landmarkIconTypes,
  ] = await Promise.all([
    db.categories.where({ worldId }).toArray(),
    db.folders.where({ worldId }).toArray(),
    db.entries.where({ worldId }).toArray(),
    getRelationsForWorld(worldId),
    db.groups.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.modules.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.templates.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.storyChapterTemplates.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.colorSwatches.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.managerFolders.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.calendars.toArray().then((r) => filterWorldScoped(r, worldId)),
    db.relationGraphFolders.where({ worldId }).toArray(),
    db.relationGraphs.where({ worldId }).toArray(),
    db.mapFolders.where({ worldId }).toArray(),
    db.maps.where({ worldId }).toArray(),
    db.narrativeGraphFolders.where({ worldId }).toArray(),
    db.narrativeGraphs.where({ worldId }).toArray(),
    db.passages.where({ worldId }).toArray(),
    db.writingFolders.where({ worldId }).toArray(),
    db.writingDocs.where({ worldId }).toArray(),
    db.storyboardFolders.where({ worldId }).toArray(),
    db.storyboards.where({ worldId }).toArray(),
    db.storyOutlineFolders.where({ worldId }).toArray(),
    db.storyOutlines.where({ worldId }).toArray(),
    db.scriptFolders.where({ worldId }).toArray(),
    db.scriptDocs.where({ worldId }).toArray(),
    db.timelineFolders.where({ worldId }).toArray(),
    db.timelines.where({ worldId }).toArray(),
    db.landmarkIconTypes.where({ worldId }).toArray(),
  ]);

  // storyChapters／timelineBranches／timelineEvents／storyboardCards 沒有可用的 worldId 索引，
  // 走已經撈出來的父層（storyOutlines／timelines／storyboards）id 各自查詢
  const [storyChapters, timelineBranches, timelineEvents, storyboardCards] = await Promise.all([
    Promise.all(storyOutlines.map((o) => db.storyChapters.where({ outlineId: o.id }).toArray())).then((r) => r.flat()),
    Promise.all(timelines.map((t) => db.timelineBranches.where({ timelineId: t.id }).toArray())).then((r) => r.flat()),
    Promise.all(timelines.map((t) => db.timelineEvents.where({ timelineId: t.id }).toArray())).then((r) => r.flat()),
    Promise.all(storyboards.map((s) => db.storyboardCards.where({ storyboardId: s.id }).toArray())).then((r) => r.flat()),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: nowISO(),
    scope: "world",
    world,
    categories,
    folders,
    entries,
    relations,
    groups,
    modules,
    templates,
    storyChapterTemplates,
    colorSwatches,
    managerFolders,
    calendars,
    relationGraphFolders,
    relationGraphs,
    mapFolders,
    maps,
    narrativeGraphFolders,
    narrativeGraphs,
    passages,
    writingFolders,
    writingDocs,
    storyboardFolders,
    storyboards,
    storyboardCards,
    storyOutlineFolders,
    storyOutlines,
    storyChapters,
    scriptFolders,
    scriptDocs,
    timelineFolders,
    timelines,
    timelineBranches,
    timelineEvents,
    landmarkIconTypes,
  };
}

export async function collectCategoriesExport(worldId: string, categoryIds: string[]): Promise<CategoryExportBundle> {
  const categories = (await db.categories.bulkGet(categoryIds)).filter((c): c is Category => !!c);
  if (categories.length === 0) throw new Error("找不到這些分類");
  const [folderLists, entryLists] = await Promise.all([
    Promise.all(categoryIds.map((categoryId) => db.folders.where({ worldId, categoryId }).toArray())),
    Promise.all(categoryIds.map((categoryId) => db.entries.where({ worldId, categoryId }).toArray())),
  ]);
  const folders = folderLists.flat();
  const entries = entryLists.flat();
  const entryIds = new Set(entries.map((e) => e.id));
  const relations = await db.relations.filter((r) => entryIds.has(r.fromEntryId) && entryIds.has(r.toEntryId)).toArray();
  return { schemaVersion: 1, exportedAt: nowISO(), scope: "category", categories, folders, entries, relations };
}

/** 掃一個 entry 的所有 entryLink 型欄位（主值＋型態同樣是 entryLink 的額外子值格），蒐集裡面
 * 出現過的「條目 id」（複選也算），供 linkedEntryNames 查表用。不含 nested(mode:"category")
 * 因為那存的是節點 id 不是條目 id，節點 id 沒辦法反查回條目名稱（要整棵樹才查得到）；也不含
 * scale 端點的 entryLink 參照（ScaleEnd.entryId 是欄位設定而非每個條目各自的值，屬於較少見的
 * 進階用法，先不處理）——單一條目匯出遇到這些情況會在 Markdown 渲染那邊退化顯示提示文字 */
function collectLinkedEntryIds(entry: Entry): Set<string> {
  const ids = new Set<string>();
  const addIds = (x: unknown) => {
    if (typeof x === "string") ids.add(x);
    else if (Array.isArray(x)) x.forEach(addIds);
  };
  for (const field of entry.fields) {
    const value = entry.values[field.id];
    if (!value) continue;
    if (field.type === "entryLink") addIds(value.current);
    for (const slot of field.extraSlots ?? []) {
      if (slot.type === "entryLink") addIds(value.extraSlotValues?.[slot.id]);
    }
  }
  return ids;
}

export async function collectEntriesExport(entryIds: string[]): Promise<EntryExportBundle> {
  const entries = (await db.entries.bulkGet(entryIds)).filter((e): e is Entry => !!e);
  if (entries.length === 0) throw new Error("找不到這些條目");
  // 選取的條目彼此之間也算「已包含在匯出範圍」，不用另外查資料庫，先加進候選 id 集合
  const linkedIds = new Set(entries.map((e) => e.id));
  for (const entry of entries) for (const id of collectLinkedEntryIds(entry)) linkedIds.add(id);
  const idList = [...linkedIds];
  const linkedEntries = await db.entries.bulkGet(idList);
  const linkedEntryNames: Record<string, string> = {};
  linkedEntries.forEach((e, i) => {
    if (e) linkedEntryNames[idList[i]] = e.name;
  });
  return { schemaVersion: 1, exportedAt: nowISO(), scope: "entry", entries, linkedEntryNames };
}
