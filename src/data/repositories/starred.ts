import { db, nowISO } from "../db";
import type { Entry, MapView, NarrativeGraph, RelationGraphView, ScriptDoc, Storyboard, StoryOutline, Timeline, WritingDoc } from "../types";

export type StarredRef =
  | { kind: "entry"; id: string }
  | { kind: "graph"; id: string }
  | { kind: "map"; id: string }
  | { kind: "narrative"; id: string }
  | { kind: "writing"; id: string }
  | { kind: "storyboard"; id: string }
  | { kind: "script"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "storyOutline"; id: string };

/** 依拖曳排序後的完整清單（條目／關係圖／分支敘事圖／一般寫作文件／故事板／劇本文件／時間線／
 * 章節大綱交錯排列），把同一個共用的序號（0,1,2,...）分別寫回各自的 starOrder，讓八種卡片能在
 * 主世界首頁排在同一個清單裡 */
export async function reorderStarredItems(items: StarredRef[]): Promise<void> {
  const entryIds = items.filter((i) => i.kind === "entry").map((i) => i.id);
  const graphIds = items.filter((i) => i.kind === "graph").map((i) => i.id);
  const mapIds = items.filter((i) => i.kind === "map").map((i) => i.id);
  const narrativeIds = items.filter((i) => i.kind === "narrative").map((i) => i.id);
  const writingIds = items.filter((i) => i.kind === "writing").map((i) => i.id);
  const storyboardIds = items.filter((i) => i.kind === "storyboard").map((i) => i.id);
  const scriptIds = items.filter((i) => i.kind === "script").map((i) => i.id);
  const timelineIds = items.filter((i) => i.kind === "timeline").map((i) => i.id);
  const storyOutlineIds = items.filter((i) => i.kind === "storyOutline").map((i) => i.id);
  const entries = await db.entries.bulkGet(entryIds);
  const graphs = await db.relationGraphs.bulkGet(graphIds);
  const maps = await db.maps.bulkGet(mapIds);
  const narratives = await db.narrativeGraphs.bulkGet(narrativeIds);
  const writings = await db.writingDocs.bulkGet(writingIds);
  const storyboards = await db.storyboards.bulkGet(storyboardIds);
  const scripts = await db.scriptDocs.bulkGet(scriptIds);
  const timelines = await db.timelines.bulkGet(timelineIds);
  const storyOutlines = await db.storyOutlines.bulkGet(storyOutlineIds);
  const entryById = new Map(entries.filter((e): e is Entry => !!e).map((e) => [e.id, e]));
  const graphById = new Map(graphs.filter((g): g is RelationGraphView => !!g).map((g) => [g.id, g]));
  const mapById = new Map(maps.filter((m): m is MapView => !!m).map((m) => [m.id, m]));
  const narrativeById = new Map(narratives.filter((n): n is NarrativeGraph => !!n).map((n) => [n.id, n]));
  const writingById = new Map(writings.filter((w): w is WritingDoc => !!w).map((w) => [w.id, w]));
  const storyboardById = new Map(storyboards.filter((s): s is Storyboard => !!s).map((s) => [s.id, s]));
  const scriptById = new Map(scripts.filter((s): s is ScriptDoc => !!s).map((s) => [s.id, s]));
  const timelineById = new Map(timelines.filter((t): t is Timeline => !!t).map((t) => [t.id, t]));
  const storyOutlineById = new Map(storyOutlines.filter((o): o is StoryOutline => !!o).map((o) => [o.id, o]));

  const entryUpdates: Entry[] = [];
  const graphUpdates: RelationGraphView[] = [];
  const mapUpdates: MapView[] = [];
  const narrativeUpdates: NarrativeGraph[] = [];
  const writingUpdates: WritingDoc[] = [];
  const storyboardUpdates: Storyboard[] = [];
  const scriptUpdates: ScriptDoc[] = [];
  const timelineUpdates: Timeline[] = [];
  const storyOutlineUpdates: StoryOutline[] = [];
  items.forEach((item, i) => {
    if (item.kind === "entry") {
      const e = entryById.get(item.id);
      if (e) entryUpdates.push({ ...e, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "graph") {
      const g = graphById.get(item.id);
      if (g) graphUpdates.push({ ...g, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "map") {
      const m = mapById.get(item.id);
      if (m) mapUpdates.push({ ...m, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "narrative") {
      const n = narrativeById.get(item.id);
      if (n) narrativeUpdates.push({ ...n, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "writing") {
      const w = writingById.get(item.id);
      if (w) writingUpdates.push({ ...w, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "storyboard") {
      const s = storyboardById.get(item.id);
      if (s) storyboardUpdates.push({ ...s, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "script") {
      const s = scriptById.get(item.id);
      if (s) scriptUpdates.push({ ...s, starOrder: i, updatedAt: nowISO() });
    } else if (item.kind === "timeline") {
      const t = timelineById.get(item.id);
      if (t) timelineUpdates.push({ ...t, starOrder: i, updatedAt: nowISO() });
    } else {
      const o = storyOutlineById.get(item.id);
      if (o) storyOutlineUpdates.push({ ...o, starOrder: i, updatedAt: nowISO() });
    }
  });
  if (entryUpdates.length) await db.entries.bulkPut(entryUpdates);
  if (graphUpdates.length) await db.relationGraphs.bulkPut(graphUpdates);
  if (mapUpdates.length) await db.maps.bulkPut(mapUpdates);
  if (narrativeUpdates.length) await db.narrativeGraphs.bulkPut(narrativeUpdates);
  if (writingUpdates.length) await db.writingDocs.bulkPut(writingUpdates);
  if (storyboardUpdates.length) await db.storyboards.bulkPut(storyboardUpdates);
  if (scriptUpdates.length) await db.scriptDocs.bulkPut(scriptUpdates);
  if (timelineUpdates.length) await db.timelines.bulkPut(timelineUpdates);
  if (storyOutlineUpdates.length) await db.storyOutlines.bulkPut(storyOutlineUpdates);
}
