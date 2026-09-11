import { db, newId } from "../db";
import type { Scope, StoryChapterTemplate, TemplateBlock, FieldDef } from "../types";
import { resolveBlocksToFields } from "./template";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateStoryChapterTemplate 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listStoryChapterTemplates(worldId: string): Promise<StoryChapterTemplate[]> {
  const all = await db.storyChapterTemplates.toArray();
  return all.filter((t) => t.scope === "global" || t.worldId === worldId);
}

export async function getStoryChapterTemplate(id: string): Promise<StoryChapterTemplate | undefined> {
  return db.storyChapterTemplates.get(id);
}

export async function createStoryChapterTemplate(
  name: string,
  scope: Scope,
  worldId: string | undefined,
  blocks: TemplateBlock[]
): Promise<StoryChapterTemplate> {
  const tpl: StoryChapterTemplate = {
    id: newId(),
    worldId: scope === "world" ? worldId : undefined,
    scope,
    name,
    isBuiltIn: false,
    blocks,
  };
  await db.storyChapterTemplates.add(tpl);
  return tpl;
}

export async function updateStoryChapterTemplate(id: string, patch: Partial<StoryChapterTemplate>): Promise<void> {
  const existing = await db.storyChapterTemplates.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建章節範本無法修改，請先複製一份");
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  // （比照 template.ts 的 updateTemplate 既有做法）
  await (db.storyChapterTemplates as any).update(id, patch);
}

/** 刪除範本前不需要檢查使用中的章節大綱——StoryOutline.chapterTemplateId 只是「新增篇章時」的預設值
 * 來源，範本被刪掉後，選用過它的大綱只是之後新增篇章不會再帶預設欄位，既有篇章已經複製過去的欄位
 * 資料不受影響（比照計畫裡「明確排除」的既有原則），所以不用跳「使用中」的確認/擋刪 */
export async function deleteStoryChapterTemplate(id: string): Promise<void> {
  const existing = await db.storyChapterTemplates.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建章節範本無法刪除，請先複製一份");
  await db.transaction("rw", [db.storyChapterTemplates, db.storyOutlines], async () => {
    await db.storyChapterTemplates.delete(id);
    const using = await db.storyOutlines.filter((o) => o.chapterTemplateId === id).toArray();
    await Promise.all(using.map((o) => db.storyOutlines.update(o.id, { chapterTemplateId: undefined })));
  });
}

export async function duplicateStoryChapterTemplate(
  id: string,
  worldId: string,
  folderId?: string,
  t: TFn = fallbackT
): Promise<StoryChapterTemplate> {
  const original = await db.storyChapterTemplates.get(id);
  if (!original) throw new Error("找不到章節範本");
  const copy: StoryChapterTemplate = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    isBuiltIn: false,
    scope: "world",
    worldId,
    folderId: folderId ?? original.folderId,
    blocks: original.blocks.map((b) => (b.kind === "field" ? { kind: "field", field: { ...b.field, id: newId() } } : { ...b })),
  };
  await db.storyChapterTemplates.add(copy);
  return copy;
}

/** 章節範本展開成 FieldDef[]，calendarId 是這份章節大綱自己設定的曆法（不是 world 的預設曆法——
 * 章節大綱可能跟世界預設曆法不同套），時間型別欄位若留空曆法就代入這一套 */
export async function resolveStoryChapterTemplateFields(template: StoryChapterTemplate, calendarId?: string): Promise<FieldDef[]> {
  const fields = await resolveBlocksToFields(template.blocks);
  if (!calendarId) return fields;
  return fields.map((f) => (f.dateConfig && !f.dateConfig.calendarId ? { ...f, dateConfig: { ...f.dateConfig, calendarId } } : f));
}
