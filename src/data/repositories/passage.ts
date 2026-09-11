import { db, newId, nowISO } from "../db";
import type { Passage } from "../types";
import { treeLayoutHorizontal } from "../relationGraphLayout";

export async function listPassages(graphId: string): Promise<Passage[]> {
  return db.passages.where({ graphId }).toArray();
}

export async function getPassage(id: string): Promise<Passage | undefined> {
  return db.passages.get(id);
}

/** 新段落的初始位置直接用樹狀版面算好存入，畫布不需要自己再補一次位；
 * treeLayout 每次都依「目前全部節點」重新置中，用既有段落當錨點校正座標系偏移，
 * 避免使用者手動調整過版面後，新段落卻冒出在理想化樹狀版面的座標而跟畫面對不上 */
export async function createPassage(worldId: string, graphId: string, input?: { title?: string }): Promise<Passage> {
  const existing = await db.passages.where({ graphId }).toArray();
  const id = newId();
  const allIds = [...existing.map((p) => p.id), id];
  const edges = existing.flatMap((p) =>
    p.choices.filter((c): c is typeof c & { targetPassageId: string } => !!c.targetPassageId).map((c) => ({ from: p.id, to: c.targetPassageId }))
  );
  const size = Math.max(600, Math.round(Math.sqrt(allIds.length) * 220));
  const result = treeLayoutHorizontal(allIds, edges, size);
  const anchor = existing.find((p) => result[p.id]);
  const dx = anchor ? anchor.position.x - result[anchor.id].x : 0;
  const dy = anchor ? anchor.position.y - result[anchor.id].y : 0;
  const position = { x: result[id].x + dx, y: result[id].y + dy };

  const passage: Passage = {
    id,
    worldId,
    graphId,
    title: input?.title?.trim() || "未命名段落",
    body: "",
    choices: [],
    position,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.passages.add(passage);
  return passage;
}

export async function savePassage(passage: Passage): Promise<void> {
  await db.passages.put({ ...passage, updatedAt: nowISO() });
}

export async function updatePassagePosition(id: string, position: { x: number; y: number }): Promise<void> {
  await db.passages.update(id, { position, updatedAt: nowISO() });
}

/** 刪除段落前，先把同一張圖裡其他段落指向它的選項連結清空（保留選項文字，只斷連結），
 * 再刪除段落本身；若它是圖的起始段落，一併清空該標記 */
export async function deletePassage(id: string): Promise<void> {
  const passage = await db.passages.get(id);
  if (!passage) return;
  await db.transaction("rw", [db.passages, db.narrativeGraphs], async () => {
    const siblings = await db.passages.where({ graphId: passage.graphId }).toArray();
    const updates = siblings
      .filter((p) => p.id !== id && p.choices.some((c) => c.targetPassageId === id))
      .map((p) => ({
        ...p,
        choices: p.choices.map((c) => (c.targetPassageId === id ? { ...c, targetPassageId: undefined } : c)),
      }));
    if (updates.length) await db.passages.bulkPut(updates);
    await db.passages.delete(id);
    const graph = await db.narrativeGraphs.get(passage.graphId);
    if (graph?.startPassageId === id) await db.narrativeGraphs.update(graph.id, { startPassageId: undefined, updatedAt: nowISO() });
  });
}
