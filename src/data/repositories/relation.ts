import { db, newId, nowISO } from "../db";
import type { Entry, FieldDef, FieldValue, Relation } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** getIncomingRelations 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 依 entryLink 欄位（或其額外子值格）目前的值，重建對應的關聯紀錄（供反向連結顯示用）；
 * fromSlotId 留空＝主值，有值＝該欄位底下某個額外子值格 */
export async function syncEntryLinkRelations(
  fromEntryId: string,
  fromFieldId: string,
  toEntryIds: string[],
  fromSlotId?: string
): Promise<void> {
  const old = await db.relations
    .filter((r) => r.fromEntryId === fromEntryId && r.fromFieldId === fromFieldId && r.fromSlotId === fromSlotId)
    .toArray();
  await db.relations.bulkDelete(old.map((r) => r.id));

  const fresh: Relation[] = toEntryIds
    .filter(Boolean)
    .map((toEntryId) => ({ id: newId(), fromEntryId, fromFieldId, fromSlotId, toEntryId }));
  if (fresh.length) await db.relations.bulkAdd(fresh);
}

function entryLinkIds(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
}

/** 掃描一份條目目前的欄位（含每個欄位的額外子值格），重建所有仍然有效的 entryLink 關聯，
 * 並清除已不再對應任何 entryLink 欄位／子值格的舊關聯（欄位型態已改變或被移除的情況） */
export async function syncAllEntryLinkRelations(
  entryId: string,
  fields: FieldDef[],
  values: Record<string, FieldValue>
): Promise<void> {
  const validKeys = new Set<string>();
  for (const field of fields) {
    if (field.type === "entryLink") validKeys.add(`${field.id}:`);
    for (const slot of field.extraSlots ?? []) {
      if (slot.type === "entryLink") validKeys.add(`${field.id}:${slot.id}`);
    }
  }
  const existing = await db.relations.filter((r) => r.fromEntryId === entryId).toArray();
  const stale = existing.filter((r) => !validKeys.has(`${r.fromFieldId}:${r.fromSlotId ?? ""}`));
  if (stale.length) await db.relations.bulkDelete(stale.map((r) => r.id));

  for (const field of fields) {
    if (field.type === "entryLink") {
      await syncEntryLinkRelations(entryId, field.id, entryLinkIds(values[field.id]?.current));
    }
    for (const slot of field.extraSlots ?? []) {
      if (slot.type !== "entryLink") continue;
      await syncEntryLinkRelations(entryId, field.id, entryLinkIds(values[field.id]?.extraSlotValues?.[slot.id]), slot.id);
    }
  }
}

export interface IncomingRelation {
  relation: Relation;
  fromEntry: Entry;
  fieldLabel: string;
}

/** 取得指向某條目的所有反向關聯，附上來源條目與欄位（或子值格）名稱，供該條目頁面顯示「被誰引用」 */
export async function getIncomingRelations(entryId: string, t: TFn = fallbackT): Promise<IncomingRelation[]> {
  const relations = await db.relations.where("toEntryId").equals(entryId).toArray();
  const result: IncomingRelation[] = [];
  for (const relation of relations) {
    const fromEntry = await db.entries.get(relation.fromEntryId);
    if (!fromEntry) continue;
    const field = fromEntry.fields.find((f) => f.id === relation.fromFieldId);
    const slot = relation.fromSlotId ? field?.extraSlots?.find((s) => s.id === relation.fromSlotId) : undefined;
    const fieldLabel = slot
      ? `${field?.label ?? t("relationGraphViewPage.relationFieldFallback")}／${slot.label ?? t("relationGraphViewPage.subValueFallback")}`
      : (field?.label ?? t("relationGraphViewPage.relationFieldFallback"));
    result.push({ relation, fromEntry, fieldLabel });
  }
  return result;
}

export async function deleteRelationsForEntry(entryId: string): Promise<void> {
  const outgoing = await db.relations.filter((r) => r.fromEntryId === entryId).toArray();
  const incoming = await db.relations.where("toEntryId").equals(entryId).toArray();
  const ids = [...outgoing, ...incoming].map((r) => r.id);
  await db.relations.bulkDelete(ids);
}

/** 條目被刪除後，清除其他條目 entryLink 欄位值（含額外子值格）裡殘留指向它的 id（relations 表本身是反向索引，
 * 不會被其他條目的 values 引用，但 entryLink 欄位的實際值是直接存在 values 裡，需另外清） */
export async function scrubEntryLinkReferences(deletedEntryIds: string[]): Promise<void> {
  if (deletedEntryIds.length === 0) return;
  const deleted = new Set(deletedEntryIds);
  const allEntries = await db.entries.toArray();
  for (const entry of allEntries) {
    if (deleted.has(entry.id)) continue;
    let changed = false;
    const values = { ...entry.values };

    const scrub = (raw: unknown): { value: unknown; changed: boolean } => {
      if (Array.isArray(raw)) {
        const filtered = (raw as string[]).filter((rid) => !deleted.has(rid));
        return { value: filtered, changed: filtered.length !== raw.length };
      }
      if (typeof raw === "string" && deleted.has(raw)) return { value: undefined, changed: true };
      return { value: raw, changed: false };
    };

    for (const field of entry.fields) {
      const fieldValue = values[field.id];
      if (field.type === "entryLink") {
        const { value, changed: didChange } = scrub(fieldValue?.current);
        if (didChange) {
          values[field.id] = { ...fieldValue, current: value };
          changed = true;
        }
      }
      const entryLinkSlots = (field.extraSlots ?? []).filter((s) => s.type === "entryLink");
      if (entryLinkSlots.length > 0) {
        const extraSlotValues = { ...values[field.id]?.extraSlotValues };
        let slotsChanged = false;
        for (const slot of entryLinkSlots) {
          const { value, changed: didChange } = scrub(extraSlotValues[slot.id]);
          if (didChange) {
            extraSlotValues[slot.id] = value;
            slotsChanged = true;
          }
        }
        if (slotsChanged) {
          values[field.id] = { ...values[field.id], current: values[field.id]?.current, extraSlotValues };
          changed = true;
        }
      }
    }
    // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
    if (changed) await (db.entries as any).update(entry.id, { values, updatedAt: nowISO() });
  }
}

/** 取得整個世界內所有的關聯（供關係圖使用）；relations 表沒有 worldId 索引，故先取該世界的條目 id 再過濾 */
export async function getRelationsForWorld(worldId: string): Promise<Relation[]> {
  const entries = await db.entries.where({ worldId }).toArray();
  const entryIds = new Set(entries.map((e) => e.id));
  return db.relations.filter((r) => entryIds.has(r.fromEntryId) || entryIds.has(r.toEntryId)).toArray();
}
