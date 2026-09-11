import { db, newId, nowISO } from "../db";
import type {
  Category,
  Entry,
  FieldDef,
  FieldGroup,
  FieldModule,
  Scope,
  Template,
  TemplateBlock,
} from "../types";
import { templateAppliesToCategory } from "../types";
import { buildInitialFieldValue } from "../fieldDefaults";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateGroup／duplicateModule／duplicateTemplate 沒收到 t 時的預設行為：固定顯示中文，
 * 與這幾個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

// ---------- 群組 (Group) ----------

export async function listGroups(worldId: string): Promise<FieldGroup[]> {
  const all = await db.groups.toArray();
  return all.filter((g) => g.scope === "global" || g.worldId === worldId);
}

export async function createGroup(
  name: string,
  scope: Scope,
  worldId: string | undefined,
  fields: FieldDef[],
  restrictedCategoryIds?: string[]
): Promise<FieldGroup> {
  const group: FieldGroup = {
    id: newId(),
    worldId: scope === "world" ? worldId : undefined,
    scope,
    name,
    isBuiltIn: false,
    restrictedCategoryIds: restrictedCategoryIds?.length ? restrictedCategoryIds : undefined,
    fields,
  };
  await db.groups.add(group);
  return group;
}

export async function updateGroup(id: string, patch: Partial<FieldGroup>): Promise<void> {
  const existing = await db.groups.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建群組無法修改，請先複製一份");
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  await (db.groups as any).update(id, patch);
  if (patch.fields) {
    await syncEntriesForSource(
      (f) => f.sourceGroupId === id,
      diffFieldDefs(existing.fields, patch.fields)
    );
  }
}

export async function deleteGroup(id: string): Promise<void> {
  const existing = await db.groups.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建群組無法刪除，請先複製一份");
  await db.groups.delete(id);
}

export async function duplicateGroup(id: string, worldId: string, folderId?: string, t: TFn = fallbackT): Promise<FieldGroup> {
  const original = await db.groups.get(id);
  if (!original) throw new Error("找不到群組");
  const copy: FieldGroup = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    isBuiltIn: false,
    scope: "world",
    worldId,
    folderId: folderId ?? original.folderId,
    fields: original.fields.map((f) => ({ ...f, id: newId() })),
  };
  await db.groups.add(copy);
  return copy;
}

// ---------- 模組 (Module) ----------

export async function listModules(worldId: string): Promise<FieldModule[]> {
  const all = await db.modules.toArray();
  return all.filter((m) => m.scope === "global" || m.worldId === worldId);
}

export async function createModule(
  name: string,
  scope: Scope,
  worldId: string | undefined,
  blocks: FieldModule["blocks"],
  restrictedCategoryIds?: string[]
): Promise<FieldModule> {
  const mod: FieldModule = {
    id: newId(),
    worldId: scope === "world" ? worldId : undefined,
    scope,
    name,
    isBuiltIn: false,
    restrictedCategoryIds: restrictedCategoryIds?.length ? restrictedCategoryIds : undefined,
    blocks,
  };
  await db.modules.add(mod);
  return mod;
}

export async function updateModule(id: string, patch: Partial<FieldModule>): Promise<void> {
  const existing = await db.modules.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建模組無法修改，請先複製一份");
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  if (patch.blocks) {
    const oldFields = await resolveModuleFieldDefs(existing.blocks);
    const newFields = await resolveModuleFieldDefs(patch.blocks);
    await (db.modules as any).update(id, patch);
    await syncEntriesForSource((f) => f.sourceModuleId === id, diffFieldDefs(oldFields, newFields));
  } else {
    await (db.modules as any).update(id, patch);
  }
}

export async function deleteModule(id: string): Promise<void> {
  const existing = await db.modules.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建模組無法刪除，請先複製一份");
  await db.modules.delete(id);
}

export async function duplicateModule(id: string, worldId: string, folderId?: string, t: TFn = fallbackT): Promise<FieldModule> {
  const original = await db.modules.get(id);
  if (!original) throw new Error("找不到模組");
  const copy: FieldModule = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    isBuiltIn: false,
    scope: "world",
    worldId,
    folderId: folderId ?? original.folderId,
    blocks: original.blocks.map((b) =>
      b.kind === "field" ? { kind: "field", field: { ...b.field, id: newId() } } : { ...b }
    ),
  };
  await db.modules.add(copy);
  return copy;
}

// ---------- 範本 (Template) ----------

export async function listTemplates(worldId: string, category?: Category): Promise<Template[]> {
  const all = await db.templates.toArray();
  const inWorld = all.filter((t) => t.scope === "global" || t.worldId === worldId);
  if (!category) return inWorld;
  return inWorld.filter((t) => templateAppliesToCategory(t, category));
}

export async function createTemplate(
  name: string,
  scope: Scope,
  worldId: string | undefined,
  category: Category | "all",
  blocks: TemplateBlock[]
): Promise<Template> {
  const tpl: Template = {
    id: newId(),
    worldId: scope === "world" ? worldId : undefined,
    scope,
    allCategories: category === "all" ? true : undefined,
    categoryId: category !== "all" && !category.isBuiltIn ? category.id : undefined,
    builtInCategoryKey: category !== "all" && category.isBuiltIn ? category.builtInKey : undefined,
    name,
    isBuiltIn: false,
    blocks,
  };
  await db.templates.add(tpl);
  return tpl;
}

export async function updateTemplate(id: string, patch: Partial<Template>): Promise<void> {
  const existing = await db.templates.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建範本無法修改，請先複製一份");
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  await (db.templates as any).update(id, patch);
}

export async function deleteTemplate(id: string): Promise<void> {
  const existing = await db.templates.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建範本無法刪除，請先複製一份");
  await db.transaction("rw", [db.templates, db.categories], async () => {
    await db.templates.delete(id);
    const defaultingCategories = await db.categories.filter((c) => c.defaultTemplateId === id).toArray();
    await Promise.all(defaultingCategories.map((c) => db.categories.update(c.id, { defaultTemplateId: undefined })));
  });
}

export async function duplicateTemplate(id: string, worldId: string, folderId?: string, t: TFn = fallbackT): Promise<Template> {
  const original = await db.templates.get(id);
  if (!original) throw new Error("找不到範本");
  const copy: Template = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    isBuiltIn: false,
    scope: "world",
    worldId,
    folderId: folderId ?? original.folderId,
    blocks: original.blocks.map((b) =>
      b.kind === "field" ? { kind: "field", field: { ...b.field, id: newId() } } : { ...b }
    ),
  };
  await db.templates.add(copy);
  return copy;
}

/** 依 key 順序重排欄位；未列在 order 中的欄位依原本相對順序接在後面。order 為空時原樣返回 */
export function reorderFieldsByKeys<T extends { key: string }>(fields: T[], order?: string[]): T[] {
  if (!order || order.length === 0) return fields;
  const byKey = new Map<string, T[]>();
  for (const f of fields) {
    if (!byKey.has(f.key)) byKey.set(f.key, []);
    byKey.get(f.key)!.push(f);
  }
  const ordered: T[] = [];
  for (const key of order) {
    const arr = byKey.get(key);
    if (arr && arr.length) ordered.push(...arr.splice(0));
  }
  for (const arr of byKey.values()) ordered.push(...arr);
  return ordered;
}

/** 展開群組為欄位陣列；同一次展開的欄位共用 groupInstanceId，供顯示時聚合成一個框
 * fieldOrder：若由模組/範本的區塊帶入順序覆寫，僅影響這次展開結果，不影響群組本身定義 */
export function expandGroup(group: FieldGroup, fieldOrder?: string[]): FieldDef[] {
  const groupInstanceId = newId();
  const orderedFields = reorderFieldsByKeys(group.fields, fieldOrder);
  return orderedFields.map((f) => ({ ...f, id: newId(), groupInstanceId, groupLabel: group.name, sourceGroupId: group.id }));
}

/** 展開模組為欄位陣列；整個模組（含內含群組）共用同一個 groupInstanceId，聚合成一個框 */
export async function expandModule(mod: FieldModule): Promise<FieldDef[]> {
  const groupInstanceId = newId();
  const fields: FieldDef[] = [];
  for (const b of mod.blocks) {
    if (b.kind === "field") {
      fields.push({ ...b.field, id: newId(), groupInstanceId, groupLabel: mod.name, sourceModuleId: mod.id });
    } else {
      const group = await db.groups.get(b.groupId);
      if (group) {
        const orderedFields = reorderFieldsByKeys(group.fields, b.fieldOrder);
        for (const f of orderedFields) {
          fields.push({ ...f, id: newId(), groupInstanceId, groupLabel: mod.name, sourceGroupId: group.id, sourceModuleId: mod.id });
        }
      }
    }
  }
  return fields;
}

/** 解析模組 blocks 為未展開的原始 FieldDef 陣列（不含 id/groupInstanceId），供編輯模組時比對新舊欄位差異、或範本編輯器預覽模組內容用 */
export async function resolveModuleFieldDefs(blocks: FieldModule["blocks"]): Promise<FieldDef[]> {
  const fields: FieldDef[] = [];
  for (const b of blocks) {
    if (b.kind === "field") fields.push(b.field);
    else {
      const group = await db.groups.get(b.groupId);
      if (group) fields.push(...group.fields);
    }
  }
  return fields;
}

function fieldDefsEqual(a: FieldDef, b: FieldDef): boolean {
  return (
    a.label === b.label &&
    a.type === b.type &&
    (a.hint ?? "") === (b.hint ?? "") &&
    JSON.stringify(a.allowedTypes ?? []) === JSON.stringify(b.allowedTypes ?? []) &&
    JSON.stringify(a.numberConfig ?? null) === JSON.stringify(b.numberConfig ?? null) &&
    JSON.stringify(a.entryLinkConfig ?? null) === JSON.stringify(b.entryLinkConfig ?? null) &&
    JSON.stringify(a.chartConfig ?? null) === JSON.stringify(b.chartConfig ?? null) &&
    JSON.stringify(a.choiceConfig ?? null) === JSON.stringify(b.choiceConfig ?? null) &&
    JSON.stringify(a.scaleConfig ?? null) === JSON.stringify(b.scaleConfig ?? null) &&
    JSON.stringify(a.nestedConfig ?? null) === JSON.stringify(b.nestedConfig ?? null) &&
    JSON.stringify(a.dateConfig ?? null) === JSON.stringify(b.dateConfig ?? null) &&
    JSON.stringify(a.extraSlots ?? []) === JSON.stringify(b.extraSlots ?? [])
  );
}

interface FieldDiff {
  added: FieldDef[];
  removed: string[];
  modified: { key: string; newDef: FieldDef }[];
}

/** 依欄位 key 比對群組／模組編輯前後的欄位差異，供同步既有條目使用 */
function diffFieldDefs(oldFields: FieldDef[], newFields: FieldDef[]): FieldDiff {
  const oldByKey = new Map(oldFields.map((f) => [f.key, f]));
  const newByKey = new Map(newFields.map((f) => [f.key, f]));
  const added: FieldDef[] = [];
  const modified: { key: string; newDef: FieldDef }[] = [];
  for (const [key, newDef] of newByKey) {
    const oldDef = oldByKey.get(key);
    if (!oldDef) added.push(newDef);
    else if (!fieldDefsEqual(oldDef, newDef)) modified.push({ key, newDef });
  }
  const removed = [...oldByKey.keys()].filter((key) => !newByKey.has(key));
  return { added, removed, modified };
}

function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** 欄位是否已有資料（主值或任一額外子值格）；用來判斷群組／模組編輯後同步既有條目時，
 * 該欄位是否「尚無資料」可以安全套用修改／移除，避免使用者已填的額外子值被悄悄清空 */
function fieldHasData(entry: Entry, fieldId: string): boolean {
  const value = entry.values[fieldId];
  if (hasContent(value?.current)) return true;
  return Object.values(value?.extraSlotValues ?? {}).some(hasContent);
}

/**
 * 將群組／模組編輯後的欄位差異套用到所有已使用該群組／模組的條目：
 * - 新增欄位：自動加入條目中每個對應的群組實例
 * - 修改欄位：條目中該欄位若尚無資料才套用修改，已有資料則保留原樣
 * - 移除欄位：條目中該欄位若尚無資料才移除，已有資料則保留原樣
 */
async function syncEntriesForSource(matchField: (f: FieldDef) => boolean, diff: FieldDiff): Promise<void> {
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) return;
  const allEntries = await db.entries.toArray();
  for (const entry of allEntries) {
    const instanceIds = new Set(
      entry.fields.filter(matchField).map((f) => f.groupInstanceId).filter((id): id is string => !!id)
    );
    if (instanceIds.size === 0) continue;

    let fields = [...entry.fields];
    const values = { ...entry.values };
    let changed = false;

    for (const instanceId of instanceIds) {
      const instanceField = fields.find((f) => f.groupInstanceId === instanceId);
      const groupLabel = instanceField?.groupLabel;
      const instanceSourceGroupId = instanceField?.sourceGroupId;
      const instanceSourceModuleId = instanceField?.sourceModuleId;

      for (const key of diff.removed) {
        const targets = fields.filter((f) => f.groupInstanceId === instanceId && f.key === key);
        for (const target of targets) {
          if (!fieldHasData(entry, target.id)) {
            fields = fields.filter((f) => f.id !== target.id);
            delete values[target.id];
            changed = true;
          }
        }
      }

      for (const { key, newDef } of diff.modified) {
        fields = fields.map((f) => {
          if (f.groupInstanceId === instanceId && f.key === key && !fieldHasData(entry, f.id)) {
            changed = true;
            const updatedField: FieldDef = {
              ...f,
              label: newDef.label,
              type: newDef.type,
              hint: newDef.hint,
              allowedTypes: newDef.allowedTypes,
              numberConfig: newDef.numberConfig,
              entryLinkConfig: newDef.entryLinkConfig,
              chartConfig: newDef.chartConfig,
              choiceConfig: newDef.choiceConfig,
              scaleConfig: newDef.scaleConfig,
              nestedConfig: newDef.nestedConfig,
              dateConfig: newDef.dateConfig,
              extraSlots: newDef.extraSlots,
            };
            values[f.id] = buildInitialFieldValue(updatedField) ?? { current: undefined };
            return updatedField;
          }
          return f;
        });
      }

      for (const newDef of diff.added) {
        const exists = fields.some((f) => f.groupInstanceId === instanceId && f.key === newDef.key);
        if (!exists) {
          const newField: FieldDef = {
            ...newDef,
            id: newId(),
            groupInstanceId: instanceId,
            groupLabel,
            sourceGroupId: instanceSourceGroupId,
            sourceModuleId: instanceSourceModuleId,
          };
          fields.push(newField);
          values[newField.id] = buildInitialFieldValue(newField) ?? { current: undefined };
          changed = true;
        }
      }
    }

    // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
    if (changed) await (db.entries as any).update(entry.id, { fields, values, updatedAt: nowISO() });
  }
}

/** 將一組 TemplateBlock（可能含群組/模組參照）展開成扁平的 FieldDef 陣列——範本（Template）跟
 * 章節範本（StoryChapterTemplate）都用同一套 blocks 結構，抽成共用函式避免兩邊各寫一份幾乎一樣的迴圈 */
export async function resolveBlocksToFields(blocks: TemplateBlock[]): Promise<FieldDef[]> {
  const fields: FieldDef[] = [];
  for (const block of blocks) {
    if (block.kind === "field") {
      fields.push({ ...block.field, id: newId() });
    } else if (block.kind === "group") {
      const group = await db.groups.get(block.groupId);
      if (group) fields.push(...expandGroup(group, block.fieldOrder));
    } else if (block.kind === "module") {
      const mod = await db.modules.get(block.moduleId);
      if (mod) fields.push(...reorderFieldsByKeys(await expandModule(mod), block.fieldOrder));
    }
  }
  return fields;
}

/** 將範本的 blocks 展開成扁平的 FieldDef 陣列，複製到條目上。
 * worldId 有提供時，時間欄位若曆法留空（範本本身是跨世界共用的，不會內建指定曆法），
 * 會自動代入該世界設定的預設曆法（見 World.defaultCalendarId），省去每張新條目都要手動選曆法 */
export async function resolveTemplateFields(template: Template, worldId?: string): Promise<FieldDef[]> {
  const fields = await resolveBlocksToFields(template.blocks);
  if (!worldId) return fields;
  const world = await db.worlds.get(worldId);
  if (!world?.defaultCalendarId) return fields;
  return fields.map((f) =>
    f.dateConfig && !f.dateConfig.calendarId ? { ...f, dateConfig: { ...f.dateConfig, calendarId: world.defaultCalendarId! } } : f
  );
}
