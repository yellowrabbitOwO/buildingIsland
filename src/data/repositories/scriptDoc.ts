import { db, newId, nowISO } from "../db";
import type { ScriptDoc } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateScriptDoc 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listScriptDocs(worldId: string): Promise<ScriptDoc[]> {
  return db.scriptDocs.where({ worldId }).toArray();
}

export async function getScriptDoc(id: string): Promise<ScriptDoc | undefined> {
  return db.scriptDocs.get(id);
}

export async function createScriptDoc(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string }
): Promise<ScriptDoc> {
  const doc: ScriptDoc = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    wordCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.scriptDocs.add(doc);
  return doc;
}

export async function updateScriptDocMeta(
  id: string,
  patch: Partial<Pick<ScriptDoc, "name" | "description" | "tagColor" | "folderId" | "targetWordCount">>
): Promise<void> {
  await db.scriptDocs.update(id, { ...patch, updatedAt: nowISO() });
}

/** 劇本內容與字數快取的存檔，跟名稱/簡述等基本資料分開，比照 saveWritingDocContent 的既有慣例 */
export async function saveScriptDocContent(id: string, content: object, wordCount: number): Promise<void> {
  await db.scriptDocs.update(id, { content, wordCount, updatedAt: nowISO() });
}

export async function deleteScriptDoc(id: string): Promise<void> {
  await db.scriptDocs.delete(id);
}

export async function toggleScriptDocStar(id: string): Promise<void> {
  const doc = await db.scriptDocs.get(id);
  if (!doc) return;
  const starred = !doc.starred;
  const patch: Partial<ScriptDoc> = { starred, updatedAt: nowISO() };
  if (starred && doc.starOrder === undefined) patch.starOrder = Date.now();
  await db.scriptDocs.update(id, patch);
}

export async function duplicateScriptDoc(id: string, folderId?: string, t: TFn = fallbackT): Promise<ScriptDoc> {
  const original = await db.scriptDocs.get(id);
  if (!original) throw new Error("找不到劇本");
  const now = nowISO();
  const copy: ScriptDoc = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.scriptDocs.add(copy);
  return copy;
}

export async function moveScriptDocsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const docs = await db.scriptDocs.bulkGet(ids);
  const updated = docs.filter((d): d is ScriptDoc => !!d).map((d) => ({ ...d, folderId, updatedAt: nowISO() }));
  await db.scriptDocs.bulkPut(updated);
}

export async function listStarredScriptDocs(worldId: string): Promise<ScriptDoc[]> {
  const all = await listScriptDocs(worldId);
  return all.filter((d) => d.starred);
}
