import { db, newId, nowISO } from "./db";
import type {
  Calendar,
  Category,
  Entry,
  FieldDef,
  FieldGroup,
  FieldModule,
  ManagerFolder,
  Template,
  TemplateBlock,
  StoryChapterTemplate,
  World,
} from "./types";
import { BUILTIN_CATEGORY_LABELS } from "./types";
import { resolveTemplateFields } from "./repositories/template";
import { syncEntryLinkRelations } from "./repositories/relation";

function field(
  key: string,
  label: string,
  type: FieldDef["type"],
  extra: Partial<FieldDef> = {}
): FieldDef {
  return { id: newId(), key, label, type, ...extra };
}

/** 內建曆法：西元（標準 12 個月，不處理閏年——這個曆法系統本來就是每月固定天數，
 * 閏年會讓 2 月天數逐年變動，跟「同一份曆法內每月天數固定」的模型衝突，先以平年 28 天為準）。
 * 獨立於 ensureBuiltInContent 的 isBuiltIn 範本守衛之外單獨判斷是否已建立，
 * 這樣即使資料庫早已跑過一次種子資料（範本守衛會直接 return），之後新增這個內建曆法時
 * 既有資料庫也能在下次啟動時補上，不用重建整個資料庫 */
async function ensureBuiltInCalendar(): Promise<void> {
  const existing = await db.calendars.filter((c) => c.isBuiltIn).count();
  if (existing > 0) return;
  const gregorianMonths = [
    { name: "1月", days: 31 },
    { name: "2月", days: 28 },
    { name: "3月", days: 31 },
    { name: "4月", days: 30 },
    { name: "5月", days: 31 },
    { name: "6月", days: 30 },
    { name: "7月", days: 31 },
    { name: "8月", days: 31 },
    { name: "9月", days: 30 },
    { name: "10月", days: 31 },
    { name: "11月", days: 30 },
    { name: "12月", days: 31 },
  ];
  const gregorianCalendar: Calendar = {
    id: newId(),
    scope: "global",
    isBuiltIn: true,
    name: "西元",
    months: gregorianMonths.map((m) => ({ id: newId(), ...m })),
    // 標準 7 天一週，週六日為週末；錨點抓「西元 0 年 1 月 1 日」對應星期日（weekdayIndex 0），
    // 純粹是好記的起點，不主張任何歷史上的真實對應
    weekLength: 7,
    weekdayNames: ["日", "一", "二", "三", "四", "五", "六"],
    weekendDayIndices: [0, 6],
    weekAnchor: { year: 0, monthIndex: 0, day: 1, weekdayIndex: 0 },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.calendars.add(gregorianCalendar);
}

/** 內建「標準章節範本」：故事章節功能的篇章欄位系統，讓使用者一開始就有一份能直接套用的預設
 * 章節範本（時間/人物/地點/事件/大綱），不用從零自己組欄位。獨立於下面 isBuiltIn 範本守衛之外
 * 單獨判斷是否已建立——理由跟 ensureBuiltInCalendar 一樣：這個章節範本是之後才加入的內建內容，
 * 既有資料庫（範本守衛已經因為角色/地點/事件等範本存在而直接 return）也要能在下次啟動時補上，
 * 不用重建整個資料庫 */
async function ensureBuiltInStoryChapterTemplate(): Promise<void> {
  const existing = await db.storyChapterTemplates.filter((t) => t.isBuiltIn).count();
  if (existing > 0) return;
  const chapterTemplateBlocks: TemplateBlock[] = [
    { kind: "field", field: field("time", "時間", "date", { dateConfig: { calendarId: "", mode: "single" } }) },
    {
      kind: "field",
      field: field("people", "人物", "entryLink", {
        entryLinkConfig: { allowedCategoryIds: [], allowedBuiltInCategoryKeys: ["character"], multiple: true },
      }),
    },
    {
      kind: "field",
      field: field("location", "地點", "entryLink", {
        entryLinkConfig: { allowedCategoryIds: [], allowedBuiltInCategoryKeys: ["location"], multiple: true },
      }),
    },
    {
      kind: "field",
      field: field("relatedEvents", "事件", "entryLink", {
        entryLinkConfig: { allowedCategoryIds: [], allowedBuiltInCategoryKeys: ["event"], multiple: true },
      }),
    },
    { kind: "field", field: field("summary", "大綱", "textarea") },
  ];
  const builtInChapterTemplate: StoryChapterTemplate = {
    id: newId(),
    scope: "global",
    name: "標準章節範本",
    isBuiltIn: true,
    blocks: chapterTemplateBlocks,
  };
  await db.storyChapterTemplates.add(builtInChapterTemplate);
}

/** 內建「標準角色範本」的出生日期欄位，從純文字型別升級成新的「時間」型別（role="birth"）。
 * 獨立於下面 isBuiltIn 範本守衛之外單獨判斷是否已升級過——這樣既有資料庫（已經跑過一次種子資料，
 * 範本守衛會直接 return，不會重新建立範本）也能在下次啟動時補上這個欄位升級，不用重建整個資料庫。
 * 新鮮安裝（範本還不存在）時這裡什麼都不用做，下面的種子資料本來就會直接用新版欄位定義建立 */
async function ensureCharacterBirthdayFieldIsDateType(): Promise<void> {
  const templates = await db.templates.filter((t) => t.isBuiltIn && t.builtInCategoryKey === "character").toArray();
  for (const tpl of templates) {
    const idx = tpl.blocks.findIndex((b) => b.kind === "field" && b.field.key === "birthday" && b.field.type === "text");
    if (idx === -1) continue;
    const blocks = [...tpl.blocks];
    const old = blocks[idx];
    if (old.kind !== "field") continue;
    blocks[idx] = {
      kind: "field",
      field: {
        ...old.field,
        type: "date",
        dateConfig: { calendarId: "", mode: "single", role: "birth", showBeforeBirth: true, trackDeath: true },
      },
    };
    await db.templates.put({ ...tpl, blocks });
  }
}

/** 內建「標準事件範本」的時間欄位，從純文字型別升級成新的「時間」型別（沒有 role——生日/死亡/
 * 受孕的語意角色只給角色時間欄位用，一般事件的日期不需要）。跟 ensureCharacterBirthdayFieldIsDateType
 * 同樣的獨立守衛模式，讓既有資料庫下次啟動時也能補上這個欄位升級 */
async function ensureEventTimeFieldIsDateType(): Promise<void> {
  const templates = await db.templates.filter((t) => t.isBuiltIn && t.builtInCategoryKey === "event").toArray();
  for (const tpl of templates) {
    const idx = tpl.blocks.findIndex((b) => b.kind === "field" && b.field.key === "time" && b.field.type === "text");
    if (idx === -1) continue;
    const blocks = [...tpl.blocks];
    const old = blocks[idx];
    if (old.kind !== "field") continue;
    blocks[idx] = {
      kind: "field",
      field: { ...old.field, type: "date", dateConfig: { calendarId: "", mode: "single" } },
    };
    await db.templates.put({ ...tpl, blocks });
  }
}

/** 建立內建的通用（跨世界）群組／模組／範本／曆法／章節範本種子資料。範本／群組／模組僅在資料庫
 * 完全空白時執行一次；曆法／章節範本各自有獨立的守衛（見 ensureBuiltInCalendar／
 * ensureBuiltInStoryChapterTemplate），確保之後新增的內建內容也能補上既有資料庫 */
export async function ensureBuiltInContent(): Promise<void> {
  await ensureBuiltInCalendar();
  await ensureBuiltInStoryChapterTemplate();
  await ensureCharacterBirthdayFieldIsDateType();
  await ensureEventTimeFieldIsDateType();

  const existing = await db.templates.filter((t) => t.isBuiltIn).count();
  if (existing > 0) return;

  // 人際關係群組
  const relationGroup: FieldGroup = {
    id: newId(),
    scope: "global",
    name: "人際關係",
    isBuiltIn: true,
    fields: [
      field("relationTarget", "關係人", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["character"],
          multiple: false,
        },
      }),
      field("relationType", "關係類型", "text"),
    ],
  };

  // 外觀模組
  const appearanceModule: FieldModule = {
    id: newId(),
    scope: "global",
    name: "外觀",
    isBuiltIn: true,
    blocks: [
      { kind: "field", field: field("height", "身高", "text") },
      { kind: "field", field: field("weight", "體重", "text") },
      { kind: "field", field: field("eyeColor", "瞳色", "color") },
      { kind: "field", field: field("hairstyle", "髮型", "text") },
      { kind: "field", field: field("outfit", "穿著", "text") },
      { kind: "field", field: field("voice", "聲音", "text") },
    ],
  };

  // 內心思考模組
  const innerThoughtsModule: FieldModule = {
    id: newId(),
    scope: "global",
    name: "內心思考",
    isBuiltIn: true,
    blocks: [
      { kind: "field", field: field("innerMonologue", "內心獨白", "textarea") },
    ],
  };

  await db.groups.add(relationGroup);
  await db.modules.bulkAdd([appearanceModule, innerThoughtsModule]);

  const characterBlocks: TemplateBlock[] = [
    { kind: "field", field: field("name", "名字", "text") },
    { kind: "field", field: field("gender", "性別", "text") },
    {
      kind: "field",
      field: field("birthday", "出生日期", "date", {
        dateConfig: { calendarId: "", mode: "single", role: "birth", showBeforeBirth: true, trackDeath: true },
      }),
    },
    { kind: "field", field: field("age", "年齡", "number", { numberConfig: { mode: "integer", min: 0 } }) },
    { kind: "field", field: field("occupation", "職業", "text") },
    {
      kind: "field",
      field: field("organization", "加入組織", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["organization"],
          multiple: false,
        },
      }),
    },
    { kind: "field", field: field("personality", "個性", "textarea") },
    { kind: "field", field: field("background", "過去／背景故事", "textarea") },
    { kind: "module", moduleId: appearanceModule.id },
    { kind: "module", moduleId: innerThoughtsModule.id },
    { kind: "group", groupId: relationGroup.id },
  ];

  const locationBlocks: TemplateBlock[] = [
    { kind: "field", field: field("environment", "環境", "textarea") },
    { kind: "field", field: field("coordinates", "座標", "text") },
    {
      kind: "field",
      field: field("relatedEvents", "關聯事件", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["event"],
          multiple: true,
        },
      }),
    },
  ];

  const eventBlocks: TemplateBlock[] = [
    { kind: "field", field: field("time", "時間", "date", { dateConfig: { calendarId: "", mode: "single" } }) },
    { kind: "field", field: field("eventType", "類型", "text") },
    {
      kind: "field",
      field: field("location", "地點", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["location"],
          multiple: false,
        },
      }),
    },
    { kind: "field", field: field("description", "描述", "textarea") },
    {
      kind: "field",
      field: field("people", "人物", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["character"],
          multiple: true,
        },
      }),
    },
  ];

  const organizationBlocks: TemplateBlock[] = [
    { kind: "field", field: field("nature", "性質", "text") },
    { kind: "field", field: field("purpose", "成立目的", "textarea") },
    { kind: "field", field: field("funding", "資金從何而來", "textarea") },
    {
      kind: "field",
      field: field("members", "相關人員", "entryLink", {
        entryLinkConfig: {
          allowedCategoryIds: [],
          allowedBuiltInCategoryKeys: ["character"],
          multiple: true,
        },
      }),
    },
  ];

  const itemBlocks: TemplateBlock[] = [
    { kind: "field", field: field("itemType", "類型", "text") },
    { kind: "field", field: field("appearance", "外觀", "textarea") },
    { kind: "field", field: field("size", "大小", "text") },
    { kind: "field", field: field("weight", "重量", "text") },
    { kind: "field", field: field("description", "描述", "textarea") },
  ];

  const noteBlocks: TemplateBlock[] = [
    { kind: "field", field: field("noteType", "筆記類型", "text") },
    { kind: "field", field: field("content", "內容", "textarea") },
  ];

  const builtInTemplates: Template[] = [
    { id: newId(), scope: "global", builtInCategoryKey: "character", name: "標準角色範本", isBuiltIn: true, blocks: characterBlocks },
    { id: newId(), scope: "global", builtInCategoryKey: "location", name: "標準地點範本", isBuiltIn: true, blocks: locationBlocks },
    { id: newId(), scope: "global", builtInCategoryKey: "event", name: "標準事件範本", isBuiltIn: true, blocks: eventBlocks },
    { id: newId(), scope: "global", builtInCategoryKey: "organization", name: "標準組織範本", isBuiltIn: true, blocks: organizationBlocks },
    { id: newId(), scope: "global", builtInCategoryKey: "item", name: "標準物品範本", isBuiltIn: true, blocks: itemBlocks },
    { id: newId(), scope: "global", builtInCategoryKey: "note", name: "標準筆記範本", isBuiltIn: true, blocks: noteBlocks },
  ];

  await db.templates.bulkAdd(builtInTemplates);

  // 資源管理頁的起始資料夾（資源功能開發中，目前先提供資料夾結構）
  const resourceFolder: ManagerFolder = {
    id: newId(),
    kind: "resource",
    scope: "global",
    name: "內建資源",
    order: 0,
    tagColor: "#c9a463",
  };
  await db.managerFolders.add(resourceFolder);
}

/** 建立指定世界的六大內建分類，並套用對應的內建範本為預設範本 */
export async function ensureBuiltInCategories(worldId: string): Promise<Category[]> {
  const templates = await db.templates.filter((t) => t.isBuiltIn).toArray();
  const categories: Category[] = (Object.keys(BUILTIN_CATEGORY_LABELS) as (keyof typeof BUILTIN_CATEGORY_LABELS)[]).map(
    (key, index) => {
      const tpl = templates.find((t) => t.builtInCategoryKey === key);
      return {
        id: newId(),
        worldId,
        name: BUILTIN_CATEGORY_LABELS[key],
        isBuiltIn: true,
        builtInKey: key,
        order: index,
        defaultTemplateId: tpl?.id,
      };
    }
  );
  await db.categories.bulkAdd(categories);
  return categories;
}

/** 建立範例世界，附帶少量示範條目，展示欄位系統與雙向關聯；每個本地使用者各自獨立擁有一份
 * （guard 條件是「這個使用者名下有沒有 isSample 世界」，不是「資料庫裡有沒有」），
 * 在 createLocalUser（見 repositories/localUser.ts）建立新使用者時呼叫 */
export async function ensureSampleWorld(localUserId: string): Promise<void> {
  const sampleExists = await db.worlds.filter((w) => w.isSample && w.localUserId === localUserId).count();
  if (sampleExists > 0) return;

  await ensureBuiltInContent();
  const builtInCalendar = await db.calendars.filter((c) => c.isBuiltIn).first();

  const worldId = newId();
  const world: World = {
    id: worldId,
    name: "範例世界：織光城邦",
    description: "一個用來展示 Building Island 功能的範例世界，可刪除但無法修改。",
    coverColor: "#4a5a6a",
    tagColor: "#e0a458",
    defaultCalendarId: builtInCalendar?.id,
    localUserId,
    isSample: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.worlds.add(world);

  const categories = await ensureBuiltInCategories(worldId);
  const characterCat = categories.find((c) => c.builtInKey === "character")!;
  const locationCat = categories.find((c) => c.builtInKey === "location")!;
  const orgCat = categories.find((c) => c.builtInKey === "organization")!;

  const templates = await db.templates.filter((t) => t.isBuiltIn).toArray();
  const charTpl = templates.find((t) => t.builtInCategoryKey === "character")!;
  const locTpl = templates.find((t) => t.builtInCategoryKey === "location")!;
  const orgTpl = templates.find((t) => t.builtInCategoryKey === "organization")!;

  const charFields = await resolveTemplateFields(charTpl, worldId);
  const locFields = await resolveTemplateFields(locTpl, worldId);
  const orgFields = await resolveTemplateFields(orgTpl, worldId);

  const findField = (fields: FieldDef[], key: string) => fields.find((f) => f.key === key)!.id;

  const orgEntry: Entry = {
    id: newId(),
    worldId,
    categoryId: orgCat.id,
    name: "織光議會",
    summary: "統治城邦的七人議會組織。",
    starred: false,
    starredFieldIds: [],
    templateId: orgTpl.id,
    fields: orgFields,
    values: {
      [findField(orgFields, "nature")]: { current: "統治機構" },
      [findField(orgFields, "purpose")]: { current: "維持城邦運作與對外交涉" },
    },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  const locationEntry: Entry = {
    id: newId(),
    worldId,
    categoryId: locationCat.id,
    name: "織光城",
    summary: "城邦的核心城市，以會發光的織錦建材聞名。",
    starred: true,
    starredFieldIds: [],
    templateId: locTpl.id,
    fields: locFields,
    values: {
      [findField(locFields, "environment")]: { current: "溫帶氣候，城市建築由發光織錦構成，入夜後全城如星海。" },
    },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  const characterEntry: Entry = {
    id: newId(),
    worldId,
    categoryId: characterCat.id,
    name: "艾莉雅",
    summary: "織光議會的年輕議員，擅長織錦工藝。",
    starred: true,
    starredFieldIds: [],
    templateId: charTpl.id,
    fields: charFields,
    values: {
      [findField(charFields, "gender")]: { current: "女" },
      [findField(charFields, "occupation")]: { current: "議員 / 織錦師" },
      [findField(charFields, "organization")]: { current: [orgEntry.id] },
      [findField(charFields, "personality")]: { current: "冷靜、務實，對織錦工藝有近乎執著的熱情。" },
    },
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  await db.entries.bulkAdd([orgEntry, locationEntry, characterEntry]);

  await syncEntryLinkRelations(characterEntry.id, findField(charFields, "organization"), [orgEntry.id]);
}

/** 本地使用者系統上線前建立的世界都沒有 localUserId；開機時跑一次，把這些「孤兒」世界
 * （含舊版全域唯一的範例世界）一次歸到一個自動建立、名叫「使用者」的預設本地使用者名下，
 * 不讓既有使用者升級後遺失自己的世界。guard 是「localUsers 表是否為空」，只會真的跑一次——
 * 之後使用者自己建了本地使用者，這裡就永遠 return，不會再幫新建的世界瞎猜歸屬。
 * 全新安裝（沒有任何世界）時 orphanWorlds 會是空陣列，什麼都不做，讓使用者自己走
 * LocalUserSelectPage 的建立流程（那條路徑會透過 ensureSampleWorld 拿到自己的範例世界） */
export async function ensureDefaultLocalUserForExistingWorlds(): Promise<void> {
  const userCount = await db.localUsers.count();
  if (userCount > 0) return;
  const orphanWorlds = await db.worlds.filter((w) => !w.localUserId).toArray();
  if (orphanWorlds.length === 0) return;

  const defaultUser = { id: newId(), name: "使用者", createdAt: nowISO() };
  await db.localUsers.add(defaultUser);
  await db.worlds.bulkPut(orphanWorlds.map((w) => ({ ...w, localUserId: defaultUser.id })));
}
