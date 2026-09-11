import { db, newId, nowISO } from "../db";
import type { WritingDoc } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateWritingDoc 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listWritingDocs(worldId: string): Promise<WritingDoc[]> {
  return db.writingDocs.where({ worldId }).toArray();
}

export async function getWritingDoc(id: string): Promise<WritingDoc | undefined> {
  return db.writingDocs.get(id);
}

export async function createWritingDoc(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string }
): Promise<WritingDoc> {
  const doc: WritingDoc = {
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
  await db.writingDocs.add(doc);
  return doc;
}

export async function updateWritingDocMeta(
  id: string,
  patch: Partial<Pick<WritingDoc, "name" | "description" | "tagColor" | "folderId" | "targetWordCount">>
): Promise<void> {
  await db.writingDocs.update(id, { ...patch, updatedAt: nowISO() });
}

/** 富文本內容與字數快取的存檔，跟名稱/簡述等基本資料分開，對應編輯頁裡「內文」跟其他欄位各自的 draft 儲存時機 */
export async function saveWritingDocContent(id: string, content: object, wordCount: number): Promise<void> {
  await db.writingDocs.update(id, { content, wordCount, updatedAt: nowISO() });
}

export async function deleteWritingDoc(id: string): Promise<void> {
  await db.writingDocs.delete(id);
}

export async function toggleWritingDocStar(id: string): Promise<void> {
  const doc = await db.writingDocs.get(id);
  if (!doc) return;
  const starred = !doc.starred;
  const patch: Partial<WritingDoc> = { starred, updatedAt: nowISO() };
  if (starred && doc.starOrder === undefined) patch.starOrder = Date.now();
  await db.writingDocs.update(id, patch);
}

export async function duplicateWritingDoc(id: string, folderId?: string, t: TFn = fallbackT): Promise<WritingDoc> {
  const original = await db.writingDocs.get(id);
  if (!original) throw new Error("找不到文件");
  const now = nowISO();
  const copy: WritingDoc = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.writingDocs.add(copy);
  return copy;
}

export async function moveWritingDocsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const docs = await db.writingDocs.bulkGet(ids);
  const updated = docs.filter((d): d is WritingDoc => !!d).map((d) => ({ ...d, folderId, updatedAt: nowISO() }));
  await db.writingDocs.bulkPut(updated);
}

export async function listStarredWritingDocs(worldId: string): Promise<WritingDoc[]> {
  const all = await listWritingDocs(worldId);
  return all.filter((d) => d.starred);
}
