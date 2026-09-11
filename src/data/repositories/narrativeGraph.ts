import { db, newId, nowISO } from "../db";
import type { NarrativeGraph, Passage } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateNarrativeGraph 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listNarrativeGraphs(worldId: string): Promise<NarrativeGraph[]> {
  return db.narrativeGraphs.where({ worldId }).toArray();
}

export async function getNarrativeGraph(id: string): Promise<NarrativeGraph | undefined> {
  return db.narrativeGraphs.get(id);
}

export async function createNarrativeGraph(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string }
): Promise<NarrativeGraph> {
  const graph: NarrativeGraph = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.narrativeGraphs.add(graph);
  return graph;
}

export async function updateNarrativeGraphMeta(
  id: string,
  patch: Partial<Pick<NarrativeGraph, "name" | "description" | "tagColor" | "folderId">>
): Promise<void> {
  await db.narrativeGraphs.update(id, { ...patch, updatedAt: nowISO() });
}

/** 段落是圖的一手內容（不像關係圖節點是借用條目），刪圖要連坐刪除底下所有段落 */
export async function deleteNarrativeGraph(id: string): Promise<void> {
  await db.transaction("rw", [db.narrativeGraphs, db.passages], async () => {
    await db.passages.where({ graphId: id }).delete();
    await db.narrativeGraphs.delete(id);
  });
}

export async function toggleNarrativeGraphStar(id: string): Promise<void> {
  const graph = await db.narrativeGraphs.get(id);
  if (!graph) return;
  const starred = !graph.starred;
  const patch: Partial<NarrativeGraph> = { starred, updatedAt: nowISO() };
  if (starred && graph.starOrder === undefined) patch.starOrder = Date.now();
  await db.narrativeGraphs.update(id, patch);
}

/** 段落是圖自己的一手內容，複製時要連坐複製底下所有段落——段落之間選項（choice）的
 * targetPassageId、圖本身的 startPassageId 都要重新對應到複製出來的新段落 id */
export async function duplicateNarrativeGraph(id: string, folderId?: string, t: TFn = fallbackT): Promise<NarrativeGraph> {
  const original = await db.narrativeGraphs.get(id);
  if (!original) throw new Error("找不到分支敘事圖");
  const passages = await db.passages.where({ graphId: id }).toArray();
  const now = nowISO();
  const newGraphId = newId();
  const passageIdMap = new Map<string, string>(passages.map((p) => [p.id, newId()]));

  const copy: NarrativeGraph = {
    ...original,
    id: newGraphId,
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    startPassageId: original.startPassageId ? passageIdMap.get(original.startPassageId) : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const newPassages: Passage[] = passages.map((p) => ({
    ...p,
    id: passageIdMap.get(p.id)!,
    graphId: newGraphId,
    choices: p.choices.map((c) => ({ ...c, targetPassageId: c.targetPassageId ? passageIdMap.get(c.targetPassageId) : undefined })),
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction("rw", [db.narrativeGraphs, db.passages], async () => {
    await db.narrativeGraphs.add(copy);
    if (newPassages.length) await db.passages.bulkAdd(newPassages);
  });
  return copy;
}

export async function moveNarrativeGraphsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const graphs = await db.narrativeGraphs.bulkGet(ids);
  const updated = graphs.filter((g): g is NarrativeGraph => !!g).map((g) => ({ ...g, folderId, updatedAt: nowISO() }));
  await db.narrativeGraphs.bulkPut(updated);
}

export async function listStarredNarrativeGraphs(worldId: string): Promise<NarrativeGraph[]> {
  const all = await listNarrativeGraphs(worldId);
  return all.filter((g) => g.starred);
}

export async function setStartPassage(graphId: string, passageId: string | undefined): Promise<void> {
  await db.narrativeGraphs.update(graphId, { startPassageId: passageId, updatedAt: nowISO() });
}
