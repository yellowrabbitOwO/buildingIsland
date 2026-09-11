import type { FieldDef, FieldSlotDef, FieldValue } from "./types";

/** 依欄位定義建立新增時的起始值；目前沒有型態需要預先帶入初始資料，一律回傳 undefined（維持空白起點） */
export function buildInitialFieldValue(_field: FieldDef): FieldValue | undefined {
  return undefined;
}

/** 為欄位定義的額外子值格建立起始值；同樣一律回傳 undefined */
export function buildInitialSlotValue(_slot: FieldSlotDef): unknown {
  return undefined;
}

/** 對一批欄位批次建立起始值，合併進既有 values（僅補上原本沒有的欄位） */
export function buildInitialValues(fields: FieldDef[], baseValues: Record<string, FieldValue> = {}): Record<string, FieldValue> {
  const values = { ...baseValues };
  for (const f of fields) {
    if (values[f.id]) continue;
    const seeded = buildInitialFieldValue(f);
    if (seeded) values[f.id] = seeded;
  }
  return values;
}
