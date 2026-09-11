import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";

const SWATCH_PREFIX = "swatch:";

export function isSwatchRef(value?: string): boolean {
  return !!value && value.startsWith(SWATCH_PREFIX);
}

export function swatchIdFromRef(value: string): string {
  return value.slice(SWATCH_PREFIX.length);
}

export function makeSwatchRef(id: string): string {
  return `${SWATCH_PREFIX}${id}`;
}

/** 判斷一個字串值是否代表顏色（字面色碼或色票參照），用來與圖片網址/資料區分 */
export function isColorValue(value?: string): boolean {
  return !!value && (value.startsWith("#") || isSwatchRef(value));
}

/** 解析色彩值：若為色票參照(swatch:id)則即時查詢目前色票顏色，否則視為字面色碼 */
export function useResolvedColor(value?: string): string | undefined {
  const swatch = useLiveQuery(async () => {
    if (!value || !isSwatchRef(value)) return undefined;
    return db.colorSwatches.get(swatchIdFromRef(value));
  }, [value]);

  if (!value) return undefined;
  if (isSwatchRef(value)) return swatch?.color;
  return value;
}

/** 解析色彩值的顯示標籤（若為色票參照則回傳色票名稱） */
export function useResolvedColorLabel(value?: string): string | undefined {
  const swatch = useLiveQuery(async () => {
    if (!value || !isSwatchRef(value)) return undefined;
    return db.colorSwatches.get(swatchIdFromRef(value));
  }, [value]);

  if (!value || !isSwatchRef(value)) return undefined;
  return swatch?.label ?? swatch?.color;
}
