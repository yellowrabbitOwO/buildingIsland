import { db, newId, nowISO } from "../db";
import type {
  ChartDataPoint,
  ChoiceFieldConfig,
  DateFieldValue,
  Entry,
  FieldDef,
  FieldType,
  FieldValue,
  NestedFieldConfig,
  NestedOptionNode,
  Template,
} from "../types";
import { resolveTemplateFields } from "./template";
import { deleteRelationsForEntry, scrubEntryLinkReferences, syncAllEntryLinkRelations } from "./relation";
import { buildInitialValues } from "../fieldDefaults";
import { isSwatchRef, swatchIdFromRef } from "../colorResolve";
import { deleteCharacterTimelineForEntry, syncCharacterTimeline } from "./characterTimeline";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateEntry 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listEntries(worldId: string, categoryId: string): Promise<Entry[]> {
  return db.entries.where({ worldId, categoryId }).toArray();
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  return db.entries.get(id);
}

export async function createEntry(
  worldId: string,
  categoryId: string,
  name: string,
  template?: Template,
  folderId?: string
): Promise<Entry> {
  const fields = template ? await resolveTemplateFields(template, worldId) : [];
  const values = buildInitialValues(fields);
  const entry: Entry = {
    id: newId(),
    worldId,
    categoryId,
    folderId,
    name,
    starred: false,
    starredFieldIds: [],
    templateId: template?.id,
    fields,
    values,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.entries.add(entry);
  return entry;
}

export async function saveEntry(entry: Entry): Promise<void> {
  const updated: Entry = { ...entry, updatedAt: nowISO() };
  await db.entries.put(updated);
  await syncAllEntryLinkRelations(updated.id, updated.fields, updated.values);
  await syncCharacterTimeline(updated);
}

export async function deleteEntry(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  await db.transaction("rw", [db.entries, db.relations], async () => {
    await deleteRelationsForEntry(id);
    await db.entries.delete(id);
    await scrubEntryLinkReferences([id]);
  });
  if (entry) await deleteCharacterTimelineForEntry(id, entry.worldId);
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const entries = await db.entries.bulkGet(ids);
  await db.transaction("rw", [db.entries, db.relations], async () => {
    for (const id of ids) {
      await deleteRelationsForEntry(id);
      await db.entries.delete(id);
    }
    await scrubEntryLinkReferences(ids);
  });
  for (const entry of entries) if (entry) await deleteCharacterTimelineForEntry(entry.id, entry.worldId);
}

export async function moveEntriesToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const entries = await db.entries.bulkGet(ids);
  const updated = entries.filter((e): e is Entry => !!e).map((e) => ({ ...e, folderId, updatedAt: nowISO() }));
  await db.entries.bulkPut(updated);
}

export async function duplicateEntry(id: string, folderId?: string, t: TFn = fallbackT): Promise<Entry> {
  const original = await db.entries.get(id);
  if (!original) throw new Error("找不到條目");
  const now = nowISO();
  const copy: Entry = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    starredFieldIds: [],
    fields: original.fields.map((f) => ({ ...f })),
    values: { ...original.values },
    createdAt: now,
    updatedAt: now,
  };
  await db.entries.add(copy);
  await syncAllEntryLinkRelations(copy.id, copy.fields, copy.values);
  // 跟 saveEntry 一樣要同步角色時間線——否則複製一張已填出生日期的角色卡，複製品要等使用者
  // 手動編輯存檔一次才會補上自己的時間線／同步進「全部角色」彙整時間線，這段空窗期資料不一致
  await syncCharacterTimeline(copy);
  return copy;
}

export async function duplicateEntries(ids: string[], t: TFn = fallbackT): Promise<void> {
  for (const id of ids) await duplicateEntry(id, undefined, t);
}

export async function toggleEntryStar(id: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (!entry) return;
  const starred = !entry.starred;
  // 新加星號時給一個排序值，讓它自然排到主世界首頁清單最後面；取消星號則保留原值，不影響其他項目
  const patch: Partial<Entry> = { starred, updatedAt: nowISO() };
  if (starred && entry.starOrder === undefined) patch.starOrder = Date.now();
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  await (db.entries as any).update(id, patch);
}

export async function toggleFieldStar(id: string, fieldId: string): Promise<void> {
  const entry = await db.entries.get(id);
  if (!entry) return;
  const set = new Set(entry.starredFieldIds);
  if (set.has(fieldId)) set.delete(fieldId);
  else set.add(fieldId);
  await (db.entries as any).update(id, { starredFieldIds: [...set], updatedAt: nowISO() });
}

/** manual 模式巢狀選項樹：依 id 路徑查出對應節點的標籤；比對不到時代表是新版以 id 存路徑之前的舊資料
 * （路徑本身就是文字標籤），比照 NestedValuePicker.tsx 的 resolveDisplayPath 原樣把路徑當成標籤文字，
 * 讓這類舊資料的巢狀欄位內容依然可以被搜尋到，不會因為比對失敗就悄悄消失 */
function resolveManualNestedLabels(tree: NestedOptionNode[], path: string[]): string[] {
  let nodes = tree;
  const labels: string[] = [];
  for (const seg of path) {
    const found = nodes.find((n) => n.id === seg);
    if (!found) return path;
    labels.push(found.label);
    nodes = found.children;
  }
  return labels;
}

/** 搜尋時用來把 id 參照解析成看得懂的文字所需的對照表 */
interface SearchLookups {
  entryNameById: Map<string, string>;
  folderNameById: Map<string, string>;
  swatchLabelById: Map<string, string>;
}

/** 依欄位型態把值轉成可搜尋的純文字；連結其他資訊卡／巢狀（分類模式）／顏色（色票參照）都需要對照表才能解析成看得懂的文字 */
function valueSearchText(
  type: FieldType,
  value: unknown,
  nestedConfig: NestedFieldConfig | undefined,
  choiceConfig: ChoiceFieldConfig | undefined,
  lookups: SearchLookups
): string {
  switch (type) {
    case "text":
    case "textarea":
      return typeof value === "string" ? value : "";
    case "number":
      return typeof value === "number" ? String(value) : "";
    case "color": {
      if (typeof value !== "string" || !value) return "";
      if (isSwatchRef(value)) return lookups.swatchLabelById.get(swatchIdFromRef(value)) ?? "";
      return value;
    }
    case "entryLink": {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      return (ids as string[]).map((id) => lookups.entryNameById.get(id) ?? "").join(" ");
    }
    case "chart":
      return ((value as ChartDataPoint[] | undefined) ?? []).map((p) => p.label).join(" ");
    case "nested": {
      const path = Array.isArray(value) ? (value as string[]) : [];
      if (nestedConfig?.mode === "manual") return resolveManualNestedLabels(nestedConfig.options ?? [], path).join(" ");
      return path.map((id) => lookups.folderNameById.get(id) ?? lookups.entryNameById.get(id) ?? "").join(" ");
    }
    case "choice":
      return choiceConfig?.options?.find((o) => o.id === value)?.label ?? "";
    case "scale":
      if (typeof value === "number") return String(value);
      if (Array.isArray(value)) return value.join(" ");
      return "";
    case "date": {
      // 不解析曆法月份名稱（搜尋索引不需要為此多帶一份曆法查詢），純用年/月/日數字比對
      const d = value as DateFieldValue | undefined;
      if (!d) return "";
      if (d.mode === "single") return `${d.year} ${d.monthIndex + 1} ${d.day}`;
      if (d.mode === "recurring") return `${d.monthIndex !== undefined ? d.monthIndex + 1 : ""} ${d.day}`;
      return `${d.start.year} ${d.start.monthIndex + 1} ${d.start.day}`;
    }
    default:
      return "";
  }
}

/** 一個欄位實例（主值＋所有額外子值格）的可搜尋文字，串在一起 */
function fieldSearchText(field: FieldDef, value: FieldValue | undefined, lookups: SearchLookups): string {
  const parts = [valueSearchText(field.type, value?.current, field.nestedConfig, field.choiceConfig, lookups)];
  for (const slot of field.extraSlots ?? []) {
    const slotValue = value?.extraSlotValues?.[slot.id];
    parts.push(valueSearchText(slot.type, slotValue, slot.nestedConfig, slot.choiceConfig, lookups));
  }
  return parts.join(" ");
}

/** 條目的完整可搜尋文字：名稱、簡述，以及每個欄位（含額外子值格）目前的值 */
function entrySearchText(entry: Entry, lookups: SearchLookups): string {
  const parts = [entry.name, entry.summary ?? ""];
  for (const field of entry.fields) {
    parts.push(fieldSearchText(field, entry.values[field.id], lookups));
  }
  return parts.join(" ").toLowerCase();
}

export async function searchEntries(worldId: string, query: string, categoryId?: string): Promise<Entry[]> {
  const q = query.trim().toLowerCase();
  const all = await db.entries.where({ worldId }).toArray();
  const filtered = categoryId ? all.filter((e) => e.categoryId === categoryId) : all;
  if (!q) return filtered;
  const [folders, swatches] = await Promise.all([db.folders.where({ worldId }).toArray(), db.colorSwatches.toArray()]);
  const lookups: SearchLookups = {
    entryNameById: new Map(all.map((e) => [e.id, e.name])),
    folderNameById: new Map(folders.map((f) => [f.id, f.name])),
    swatchLabelById: new Map(swatches.map((s) => [s.id, s.label ?? s.color])),
  };
  return filtered.filter((e) => entrySearchText(e, lookups).includes(q));
}

export async function listStarredEntries(worldId: string): Promise<Entry[]> {
  const all = await db.entries.where({ worldId }).toArray();
  return all.filter((e) => e.starred);
}
