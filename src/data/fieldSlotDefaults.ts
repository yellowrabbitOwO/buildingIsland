import { newId } from "./db";
import type { ChartType, FieldSlotDef, FieldType, ScaleMode } from "./types";
import { CHART_TYPE_LABELS, SCALE_MODE_LABELS, TYPE_LABELS } from "./fieldTypeLabels";

export const ALL_FIELD_TYPE_VALUES = Object.keys(TYPE_LABELS) as FieldType[];
export const ALL_CHART_TYPE_VALUES = Object.keys(CHART_TYPE_LABELS) as ChartType[];
export const ALL_SCALE_MODES = Object.keys(SCALE_MODE_LABELS) as ScaleMode[];

/** 依目前選取的型態清單，補上尚未設定的對應設定（數字範圍、連結分類、圖表類型……）；
 * 型態被取消選取時原本的設定保留不清除，供之後切回時沿用 */
export function seedMissingConfigs(slot: FieldSlotDef, types: FieldType[]): FieldSlotDef {
  const patch: Partial<FieldSlotDef> = {};
  if (types.includes("number") && !slot.numberConfig) patch.numberConfig = { mode: "free" };
  if (types.includes("entryLink") && !slot.entryLinkConfig) {
    patch.entryLinkConfig = { allowedCategoryIds: [], allowedBuiltInCategoryKeys: [], multiple: false };
  }
  if (types.includes("chart") && !slot.chartConfig) {
    patch.chartConfig = { chartType: "bar", allowedChartTypes: ALL_CHART_TYPE_VALUES };
  }
  if (types.includes("nested") && !slot.nestedConfig) patch.nestedConfig = { mode: "manual", options: [] };
  if (types.includes("choice") && !slot.choiceConfig) patch.choiceConfig = { options: [] };
  if (types.includes("scale") && !slot.scaleConfig) {
    patch.scaleConfig = { mode: "linear", allowedModes: ALL_SCALE_MODES, precision: "smooth", min: 0, max: 100 };
  }
  // dateConfig.calendarId 留空字串——跟其他型態不同，這個設定沒有合理的預設值可以自動補（曆法是
  // 世界內的資源，這裡拿不到 worldId），UI 端（FieldSlotEditor／AddFieldDialog）會擋住空曆法送出
  if (types.includes("date") && !slot.dateConfig) patch.dateConfig = { calendarId: "", mode: "single" };
  return Object.keys(patch).length > 0 ? { ...slot, ...patch } : slot;
}

/** 新建一個子值格／主要內容的初始狀態：內容型態預設全選，並連帶補齊每種型態的設定 */
export function createDefaultFieldSlot(): FieldSlotDef {
  return seedMissingConfigs({ id: newId(), type: "text", allowedTypes: ALL_FIELD_TYPE_VALUES }, ALL_FIELD_TYPE_VALUES);
}
