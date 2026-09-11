import type { DateFieldMode, DateFieldRole, DateTimePrecision, ChartType, FieldType, RecurrenceFrequency, ScaleMode } from "./types";
import type { TranslationKey } from "../i18n";

export const TYPE_LABELS: Record<FieldType, TranslationKey> = {
  text: "fieldType.text",
  textarea: "fieldType.textarea",
  number: "fieldType.number",
  color: "fieldType.color",
  image: "fieldType.image",
  video: "fieldType.video",
  entryLink: "fieldType.entryLink",
  chart: "fieldType.chart",
  nested: "fieldType.nested",
  choice: "fieldType.choice",
  scale: "fieldType.scale",
  date: "fieldType.date",
};

export const DATE_MODE_LABELS: Record<DateFieldMode, TranslationKey> = {
  single: "dateMode.single",
  recurring: "dateMode.recurring",
  range: "dateMode.range",
};

export const DATE_ROLE_LABELS: Record<DateFieldRole, TranslationKey> = {
  birth: "dateRole.birth",
  death: "dateRole.death",
  pregnancyStart: "dateRole.pregnancyStart",
};

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, TranslationKey> = {
  yearly: "recurrenceFrequency.yearly",
  monthly: "recurrenceFrequency.monthly",
};

export const DATE_TIME_PRECISION_LABELS: Record<DateTimePrecision, TranslationKey> = {
  year: "dateTimePrecision.year",
  month: "dateTimePrecision.month",
  day: "dateTimePrecision.day",
  hour: "dateTimePrecision.hour",
  minute: "dateTimePrecision.minute",
  second: "dateTimePrecision.second",
};

export const CHART_TYPE_LABELS: Record<ChartType, TranslationKey> = {
  bar: "chartType.bar",
  line: "chartType.line",
  pie: "chartType.pie",
  radar: "chartType.radar",
  tree: "chartType.tree",
  mindmap: "chartType.mindmap",
  fishbone: "chartType.fishbone",
  numberline: "chartType.numberline",
};

/** 分支型圖表（有父子節點關係），編輯時需顯示「上層節點」選擇器 */
export const BRANCHING_CHART_TYPES: ChartType[] = ["tree", "mindmap", "fishbone"];

export const SCALE_MODE_LABELS: Record<ScaleMode, TranslationKey> = {
  linear: "scaleMode.linear",
  rating: "scaleMode.rating",
  range: "scaleMode.range",
};
