import JSZip from "jszip";
import { formatDate } from "../components/common/DateValueEditor";
import type { Calendar, ChartDataPoint, Entry, EntryFolder, FieldDef, FieldValue, NestedOptionNode, ScaleEnd } from "./types";
import { type TranslationKey } from "../i18n";
import zhTW from "../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** 這個檔案裡的函式沒收到 t 時的預設行為：固定顯示中文，與這批函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** Markdown 渲染共用的查表資訊：entryLink／scale(entryLink 端點) 顯示對象名稱要用 entryNameById；
 * date 欄位要用 calendarById 換算成「幾年幾月幾日」；nested(mode:"category") 欄位要現場重建選項樹，
 * 需要该分類底下完整的資料夾/條目清單——世界/分類範圍匯出時這兩個 Map 有完整資料，單一條目匯出
 * 通常沒有，此時退化顯示原始路徑 */
export interface MarkdownExportContext {
  entryNameById: Map<string, string>;
  calendarById: Map<string, Calendar>;
  foldersByCategoryId?: Map<string, EntryFolder[]>;
  entriesByCategoryId?: Map<string, Entry[]>;
}

/** 複製自 NestedValuePicker.tsx 的同名私有函式（該檔案沒有 export，這裡直接照邏輯重寫一份）：
 * 依儲存的 id 路徑，在選項樹中查出對應節點的顯示標籤路徑 */
function resolveDisplayPath(tree: NestedOptionNode[], value: string[], mode: "manual" | "category", t: TFn): string[] {
  let nodes = tree;
  const result: string[] = [];
  for (const seg of value) {
    const found = nodes.find((n) => n.id === seg);
    if (!found) return mode === "category" ? [t("nestedValuePicker.sourceDeleted")] : value;
    result.push(found.label);
    nodes = found.children;
  }
  return result;
}

/** 複製自 NestedValuePicker.tsx 的即時建樹邏輯：從匯出範圍內已經撈到的資料夾/條目重建
 * nested(mode:"category") 欄位當初在畫面上看到的那棵選項樹 */
function buildCategoryTree(categoryId: string, ctx: MarkdownExportContext, t: TFn): NestedOptionNode[] {
  const folders = ctx.foldersByCategoryId?.get(categoryId) ?? [];
  const entries = ctx.entriesByCategoryId?.get(categoryId) ?? [];
  const nodes: NestedOptionNode[] = folders
    .map((f) => ({
      id: f.id,
      label: f.name,
      children: entries.filter((e) => e.folderId === f.id).map((e) => ({ id: e.id, label: e.name, children: [] as NestedOptionNode[] })),
    }))
    .filter((f) => f.children.length > 0);
  const unfiled = entries.filter((e) => !e.folderId);
  if (unfiled.length > 0) {
    nodes.push({ id: "__unfiled__", label: t("entryCard.unfiled"), children: unfiled.map((e) => ({ id: e.id, label: e.name, children: [] })) });
  }
  return nodes;
}

function formatNestedValue(field: FieldDef, current: unknown, ctx: MarkdownExportContext, t: TFn): string {
  if (!Array.isArray(current) || current.length === 0) return t("exportMarkdown.notFilled");
  const path = current as string[];
  const config = field.nestedConfig;
  if (!config) return path.join(" › ");
  if (config.mode === "manual") return resolveDisplayPath(config.options ?? [], path, "manual", t).join(" › ");
  const categoryId = config.sourceCategoryId;
  if (!categoryId || !ctx.entriesByCategoryId?.has(categoryId)) {
    return t("exportMarkdown.categoryTreeNotIncluded", { path: path.join(" › ") });
  }
  return resolveDisplayPath(buildCategoryTree(categoryId, ctx, t), path, "category", t).join(" › ");
}

/** 折線圖／雷達圖等多線圖表用 seriesId 分組列出「label: value」；樹狀圖／心智圖／魚骨圖有 parentId，
 * 改印成縮排巢狀清單以呈現層級關係 */
function formatChartValue(field: FieldDef, current: unknown, t: TFn): string {
  if (!Array.isArray(current) || current.length === 0) return t("exportMarkdown.notFilled");
  const points = current as ChartDataPoint[];
  if (points.some((p) => p.parentId !== undefined)) {
    const byParent = new Map<string | undefined, ChartDataPoint[]>();
    for (const p of points) {
      const key = p.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(p);
    }
    const lines: string[] = [];
    const walk = (parentId: string | undefined, depth: number) => {
      for (const p of byParent.get(parentId) ?? []) {
        lines.push(`${"  ".repeat(depth)}- ${p.label}${p.value ? `：${p.value}` : ""}`);
        walk(p.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return lines.join("\n");
  }
  const seriesLabelById = new Map((field.chartConfig?.series ?? []).map((s) => [s.id, s.label]));
  const bySeries = new Map<string | undefined, ChartDataPoint[]>();
  for (const p of points) {
    if (!bySeries.has(p.seriesId)) bySeries.set(p.seriesId, []);
    bySeries.get(p.seriesId)!.push(p);
  }
  const lines: string[] = [];
  for (const [seriesId, pts] of bySeries) {
    const prefix = seriesId ? `${seriesLabelById.get(seriesId) ?? seriesId}：` : "";
    lines.push(`- ${prefix}${pts.map((p) => `${p.label}: ${p.value}`).join("、")}`);
  }
  return lines.join("\n");
}

function formatScaleEnd(end: ScaleEnd | undefined, ctx: MarkdownExportContext, t: TFn): string {
  if (!end) return "";
  switch (end.kind) {
    case "text":
    case "number":
      return end.text ?? "";
    case "color":
      return end.color ?? "";
    case "image":
      return end.image ? t("fieldType.image") : "";
    case "entryLink":
      return (end.entryId && ctx.entryNameById.get(end.entryId)) || t("common.deletedEntry");
  }
}

function formatScaleValue(field: FieldDef, current: unknown, ctx: MarkdownExportContext, t: TFn): string {
  const config = field.scaleConfig;
  if (!config) return current === undefined ? t("exportMarkdown.notFilled") : String(current);
  if (config.mode === "range") {
    if (!Array.isArray(current) || current.length !== 2) return t("exportMarkdown.notFilled");
    return `${current[0]} ～ ${current[1]}`;
  }
  if (typeof current !== "number") return t("exportMarkdown.notFilled");
  if (config.mode === "rating") {
    const max = config.maxStars ?? 5;
    const rounded = Math.round(current);
    return `${"★".repeat(rounded)}${"☆".repeat(Math.max(0, max - rounded))}（${current}/${max}）`;
  }
  const left = formatScaleEnd(config.left, ctx, t);
  const right = formatScaleEnd(config.right, ctx, t);
  return left || right ? `${current}（${left} ～ ${right}）` : String(current);
}

function formatDateValue(field: FieldDef, current: unknown, ctx: MarkdownExportContext, t: TFn): string {
  const config = field.dateConfig;
  if (!config || !current) return t("exportMarkdown.notFilled");
  const calendar = ctx.calendarById.get(config.calendarId);
  if (!calendar) return t("exportMarkdown.calendarNotFound");
  const precision = config.precision ?? "day";
  const value = current as { mode: "single" | "recurring" | "range" };
  if (value.mode === "single") {
    const single = current as { year: number; monthIndex: number; day: number; death?: { year: number; monthIndex: number; day: number } };
    let text = formatDate(calendar, single, precision);
    if (single.death) text += t("dateFieldPicker.deathSuffix", { date: formatDate(calendar, single.death, precision) });
    return text;
  }
  if (value.mode === "range") {
    const range = current as { start: { year: number; monthIndex: number; day: number }; end?: { year: number; monthIndex: number; day: number } };
    const start = formatDate(calendar, range.start, precision);
    const end = range.end ? formatDate(calendar, range.end, precision) : t("exportMarkdown.ongoing");
    return `${start} ～ ${end}`;
  }
  const recurring = current as { frequency: "yearly" | "monthly"; monthIndex?: number; day: number };
  if (recurring.frequency === "yearly" && recurring.monthIndex !== undefined) {
    return t("characterTimelineSummary.yearlyRecurrence", { month: calendar.months[recurring.monthIndex]?.name ?? "?", day: recurring.day });
  }
  return t("characterTimelineSummary.monthlyRecurrence", { day: recurring.day });
}

/** export 出來給 entryFieldsToManuscript.ts 共用——StoryChapter／TimelineEvent 用的是同一套
 * FieldDef/FieldValue 系統，不用另外重寫一次這個 switch */
export function formatFieldValue(field: FieldDef, value: FieldValue | undefined, ctx: MarkdownExportContext, t: TFn = fallbackT): string {
  const current = value?.current;
  if (current === undefined || current === null || current === "") return t("exportMarkdown.notFilled");
  switch (field.type) {
    case "text":
    case "textarea":
    case "number":
    case "color":
      return String(current);
    case "image":
      return typeof current === "string" ? `![](${current})` : t("exportMarkdown.notFilled");
    case "video":
      // 影片內容存的是 assetId 參照，不是可以直接內嵌進 Markdown 的資料——比照圖片型別
      // 匯出的是語法而非真的內嵌畫面，這裡改成文字提示，實際檔案要到資源分頁查看
      return typeof current === "string" ? t("exportMarkdown.videoAttachment") : t("exportMarkdown.notFilled");
    case "entryLink": {
      const ids = Array.isArray(current) ? current : [current];
      return ids.map((id) => (typeof id === "string" ? ctx.entryNameById.get(id) ?? t("common.deletedEntry") : "")).join("、");
    }
    case "chart":
      return formatChartValue(field, current, t);
    case "nested":
      return formatNestedValue(field, current, ctx, t);
    case "choice": {
      const opt = field.choiceConfig?.options?.find((o) => o.id === current);
      return opt?.label ?? t("exportMarkdown.notFilled");
    }
    case "scale":
      return formatScaleValue(field, current, ctx, t);
    case "date":
      return formatDateValue(field, current, ctx, t);
    default:
      return String(current);
  }
}

/** 一張條目渲染成一份 Markdown：標題、簡述，接著依 entry.fields 的既有順序輸出每個欄位——
 * 連續且 groupInstanceId 相同的欄位視為一組，用子標題把它們聚在一起；不追求跟即時編輯 UI
 * 逐像素一致，只求「同一組的欄位聚在一起、有清楚標題層級」這個可讀性目標 */
export function entryToMarkdown(entry: Entry, ctx: MarkdownExportContext, t: TFn = fallbackT): string {
  const lines: string[] = [`# ${entry.name}`];
  if (entry.summary) lines.push("", `*${entry.summary}*`);
  let i = 0;
  while (i < entry.fields.length) {
    const field = entry.fields[i];
    if (field.groupInstanceId) {
      const groupId = field.groupInstanceId;
      lines.push("", `### ${field.groupLabel || t("common.group")}`);
      while (i < entry.fields.length && entry.fields[i].groupInstanceId === groupId) {
        const f = entry.fields[i];
        lines.push(`- **${f.label}**：${formatFieldValue(f, entry.values[f.id], ctx, t)}`);
        i++;
      }
    } else {
      lines.push("", `## ${field.label}`, formatFieldValue(field, entry.values[field.id], ctx, t));
      i++;
    }
  }
  return lines.join("\n");
}

/** 全部條目合併成一份長文件，條目間用分隔線隔開 */
export function entriesToCombinedMarkdown(entries: Entry[], ctx: MarkdownExportContext, t: TFn = fallbackT): string {
  return entries.map((e) => entryToMarkdown(e, ctx, t)).join("\n\n---\n\n");
}

function sanitizeFilename(name: string, t: TFn): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 80);
  return cleaned || t("imageExportDialog.unnamedFallback");
}

/** 每個條目各自一個 .md 檔，打包成一個 zip；同名條目用數字後綴避免檔名衝突 */
export async function entriesToMarkdownZip(entries: Entry[], ctx: MarkdownExportContext, t: TFn = fallbackT): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const entry of entries) {
    const base = sanitizeFilename(entry.name, t);
    let filename = `${base}.md`;
    let suffix = 2;
    while (usedNames.has(filename)) {
      filename = `${base}-${suffix}.md`;
      suffix++;
    }
    usedNames.add(filename);
    zip.file(filename, entryToMarkdown(entry, ctx, t));
  }
  return zip.generateAsync({ type: "blob" });
}
