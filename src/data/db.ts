import Dexie, { type Table } from "dexie";
import { attachVersionHistoryHook } from "./versionHistory";
import { isReadOnlyDemo } from "../demoMode";
import type {
  World,
  Category,
  EntryFolder,
  Entry,
  FieldGroup,
  FieldModule,
  Template,
  Relation,
  ColorSwatch,
  ManagerFolder,
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
  StoryChapterTemplate,
  ScriptFolder,
  ScriptDoc,
  Calendar,
  TimelineFolder,
  Timeline,
  TimelineBranch,
  TimelineEvent,
  LandmarkIconType,
  LocalUser,
  ContentVersion,
  Asset,
} from "./types";

export class BuildingIslandDB extends Dexie {
  worlds!: Table<World, string>;
  localUsers!: Table<LocalUser, string>;
  categories!: Table<Category, string>;
  folders!: Table<EntryFolder, string>;
  entries!: Table<Entry, string>;
  groups!: Table<FieldGroup, string>;
  modules!: Table<FieldModule, string>;
  templates!: Table<Template, string>;
  relations!: Table<Relation, string>;
  colorSwatches!: Table<ColorSwatch, string>;
  managerFolders!: Table<ManagerFolder, string>;
  relationGraphFolders!: Table<RelationGraphFolder, string>;
  relationGraphs!: Table<RelationGraphView, string>;
  mapFolders!: Table<MapFolder, string>;
  maps!: Table<MapView, string>;
  narrativeGraphFolders!: Table<NarrativeGraphFolder, string>;
  narrativeGraphs!: Table<NarrativeGraph, string>;
  passages!: Table<Passage, string>;
  writingFolders!: Table<WritingFolder, string>;
  writingDocs!: Table<WritingDoc, string>;
  storyboardFolders!: Table<StoryboardFolder, string>;
  storyboards!: Table<Storyboard, string>;
  storyboardCards!: Table<StoryboardCard, string>;
  storyOutlineFolders!: Table<StoryOutlineFolder, string>;
  storyOutlines!: Table<StoryOutline, string>;
  storyChapters!: Table<StoryChapter, string>;
  storyChapterTemplates!: Table<StoryChapterTemplate, string>;
  scriptFolders!: Table<ScriptFolder, string>;
  scriptDocs!: Table<ScriptDoc, string>;
  calendars!: Table<Calendar, string>;
  timelineFolders!: Table<TimelineFolder, string>;
  timelines!: Table<Timeline, string>;
  timelineBranches!: Table<TimelineBranch, string>;
  timelineEvents!: Table<TimelineEvent, string>;
  landmarkIconTypes!: Table<LandmarkIconType, string>;
  contentVersions!: Table<ContentVersion, string>;
  assets!: Table<Asset, string>;

  constructor() {
    super("BuildingIslandDB");
    this.version(1).stores({
      worlds: "id, name, updatedAt",
      categories: "id, worldId, order",
      folders: "id, worldId, categoryId",
      entries: "id, worldId, categoryId, folderId, name, updatedAt, starred",
      groups: "id, worldId, scope",
      modules: "id, worldId, scope",
      templates: "id, worldId, categoryId, scope",
      relations: "id, fromEntryId, toEntryId, fromFieldId",
    });
    this.version(2).stores({
      colorSwatches: "id, order",
    });
    this.version(3).stores({
      managerFolders: "id, kind, worldId, scope",
    });
    this.version(4).stores({
      relationGraphFolders: "id, worldId",
      relationGraphs: "id, worldId, folderId, starred",
    });
    this.version(5).stores({
      narrativeGraphFolders: "id, worldId",
      narrativeGraphs: "id, worldId, folderId, starred",
      passages: "id, worldId, graphId",
    });
    this.version(6).stores({
      writingFolders: "id, worldId",
      writingDocs: "id, worldId, folderId, starred",
    });
    this.version(7).stores({
      storyboardFolders: "id, worldId",
      storyboards: "id, worldId, folderId, starred",
      storyboardCards: "id, storyboardId, laneId",
    });
    this.version(8).stores({
      scriptFolders: "id, worldId",
      scriptDocs: "id, worldId, folderId, starred",
    });
    this.version(9).stores({
      calendars: "id, worldId",
      timelineFolders: "id, worldId",
      timelines: "id, worldId, folderId, starred",
      timelineBranches: "id, timelineId, parentBranchId",
      timelineEvents: "id, timelineId, branchId",
    });
    this.version(10).stores({
      storyOutlineFolders: "id, worldId",
      storyOutlines: "id, worldId, folderId, starred",
      storyChapters: "id, outlineId, parentChapterId, order",
    });
    this.version(11).stores({
      storyChapterTemplates: "id, worldId, scope",
    });
    this.version(12).stores({
      mapFolders: "id, worldId",
      maps: "id, worldId, folderId, starred",
    });
    // 地圖功能整個移除：用 null 正式撤掉這兩張表，而不是直接刪掉上面 version(12) 的宣告——
    // 瀏覽器裡已經跑過 version 12 的既有資料庫，schema 版本號只能往上加不能往下改，
    // 直接砍掉 version(12) 會讓那些既有資料庫在下次開啟時發生版本不符的錯誤
    this.version(13).stores({
      mapFolders: null,
      maps: null,
    });
    // 地圖功能重建（第一步：繪製陸地高度）：不能復用已撤掉的 version(12) 宣告，開新版本號重新宣告這兩張表
    this.version(14).stores({
      mapFolders: "id, worldId",
      maps: "id, worldId, folderId, starred",
    });
    // 地標圖示類型（內建 9 種＋使用者自訂）：純新增表，不影響既有資料
    this.version(15).stores({
      landmarkIconTypes: "id, worldId",
    });
    // 本地使用者系統：新增 localUsers 表，並替既有的 worlds 表補上 localUserId 索引方便依使用者
    // 篩選——重新宣告 worlds 的索引字串只是新增一個索引，不會動到既有資料，既有列的 localUserId
    // 就是 undefined，等 ensureDefaultLocalUserForExistingWorlds()（見 seed.ts）跑過一次遷移後補上
    this.version(16).stores({
      localUsers: "id, name",
      worlds: "id, name, updatedAt, localUserId",
    });
    // 版本歷史／復原：新增 contentVersions 表，統一存放各內容表「被更新／刪除前」的完整快照
    // （見 versionHistory.ts），純新增表，不影響既有資料
    this.version(17).stores({
      contentVersions: "id, entityType, entityId, worldId, createdAt, [entityType+entityId]",
    });
    // 素材管理／影片欄位型別共用的檔案儲存：存實際 Blob，不走其他欄位既有的 base64 data URL
    // 慣例（原因見 types.ts 的 Asset 型別註解）。刻意不呼叫 attachVersionHistoryHook——
    // 檔案是「被取代」而不是「被編修」的東西，比照 colorSwatches／managerFolders 的既有排除慣例
    this.version(18).stores({
      assets: "id, scope, worldId, folderId, kind, createdAt",
    });

    // 版本歷史 hook：只涵蓋「內容」表，不含純資料夾／帳號層級／衍生資料／小型設定表——
    // 見 versionHistory.ts 頂端註解的完整說明。用函式呼叫（而不是陣列字面值）逐一登記，
    // 是為了繞開 Dexie Table<T,...> 混合多種 T 放進同一個陣列時，TS 想推導共同結構會因為
    // FieldDef.nestedConfig 裡的 NestedOptionNode 遞迴型別卡住噴 TS2615——傳進一個參數型別是
    // any 的函式，屬於單純的可指派檢查，不會觸發那個結構性展開，跟 storyChapter.ts／
    // timelineEvent.ts 既有的 `as any` workaround 是同一個 Dexie 型別推導既有毛病，不是這裡新引入的問題
    const register = (table: any, name: string) => attachVersionHistoryHook(table, name, this.contentVersions);
    register(this.worlds, "worlds");
    register(this.categories, "categories");
    register(this.entries, "entries");
    register(this.groups, "groups");
    register(this.modules, "modules");
    register(this.templates, "templates");
    register(this.calendars, "calendars");
    register(this.relationGraphs, "relationGraphs");
    register(this.maps, "maps");
    register(this.narrativeGraphs, "narrativeGraphs");
    register(this.passages, "passages");
    register(this.writingDocs, "writingDocs");
    register(this.storyboards, "storyboards");
    register(this.storyboardCards, "storyboardCards");
    register(this.storyOutlines, "storyOutlines");
    register(this.storyChapters, "storyChapters");
    register(this.storyChapterTemplates, "storyChapterTemplates");
    register(this.scriptDocs, "scriptDocs");
    register(this.timelines, "timelines");
    register(this.timelineBranches, "timelineBranches");
    register(this.timelineEvents, "timelineEvents");

    // 公開唯讀展示版（見 demoMode.ts）的最後一道防線：不管畫面上是不是漏藏了哪個新增／編輯／
    // 刪除按鈕，這裡直接在資料層擋掉所有寫入，讓「唯讀」是保證成立的，不是只靠每個頁面自己小心。
    // demoBootstrapDone 在開機當下（main.tsx 建好內建種子資料＋唯一的展示帳號／範例世界之前）
    // 還是 false，讓那段必要的初始化寫入照樣放行，寫完才由 main.tsx 呼叫 markDemoBootstrapDone()
    // 正式鎖上——之後不管是訪客自己的操作、還是任何後續程式碼，一律擋下
    if (isReadOnlyDemo) {
      const blockWrite = () => {
        if (!demoBootstrapDone) return;
        throw new Error("公開展示版為唯讀模式，無法修改資料。");
      };
      for (const table of this.tables) {
        table.hook("creating", blockWrite);
        table.hook("updating", blockWrite);
        table.hook("deleting", blockWrite);
      }
    }
  }
}

let demoBootstrapDone = !isReadOnlyDemo;

/** 只有 main.tsx 的展示版開機流程會呼叫這個——見上面 demoBootstrapDone 的說明 */
export function markDemoBootstrapDone(): void {
  demoBootstrapDone = true;
}

export const db = new BuildingIslandDB();

export function newId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
