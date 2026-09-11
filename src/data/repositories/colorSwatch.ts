import { db, newId } from "../db";
import type { ColorSwatch, Scope } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateColorSwatch 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listColorSwatches(): Promise<ColorSwatch[]> {
  return db.colorSwatches.orderBy("order").toArray();
}

async function nextSwatchOrder(): Promise<number> {
  const existing = await db.colorSwatches.toArray();
  return existing.length ? Math.max(...existing.map((s) => s.order)) + 1 : 0;
}

export async function addColorSwatch(color: string, label?: string, scope: Scope = "global", worldId?: string): Promise<ColorSwatch> {
  const order = await nextSwatchOrder();
  const swatch: ColorSwatch = { id: newId(), color, label, order, scope, worldId: scope === "world" ? worldId : undefined };
  await db.colorSwatches.add(swatch);
  return swatch;
}

export async function updateColorSwatch(
  id: string,
  patch: { color?: string; label?: string; folderId?: string | undefined; scope?: Scope; worldId?: string | undefined }
): Promise<void> {
  await db.colorSwatches.update(id, patch);
}

export async function deleteColorSwatch(id: string): Promise<void> {
  await db.colorSwatches.delete(id);
}

export async function duplicateColorSwatch(id: string, folderId?: string, t: TFn = fallbackT): Promise<ColorSwatch> {
  const original = await db.colorSwatches.get(id);
  if (!original) throw new Error("找不到標籤色彩");
  const order = await nextSwatchOrder();
  const copy: ColorSwatch = {
    ...original,
    id: newId(),
    label: original.label ? `${original.label}${t("templateManagerPage.copySuffix")}` : undefined,
    order,
    folderId: folderId ?? original.folderId,
  };
  await db.colorSwatches.add(copy);
  return copy;
}
