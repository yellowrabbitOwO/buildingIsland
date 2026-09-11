import { db, newId, nowISO } from "../db";
import type { StoryboardCard } from "../types";

export async function listCards(storyboardId: string): Promise<StoryboardCard[]> {
  return db.storyboardCards.where({ storyboardId }).toArray();
}

export async function getCard(id: string): Promise<StoryboardCard | undefined> {
  return db.storyboardCards.get(id);
}

/** 新卡片附加到目標 lane 尾端；只有標題，其餘欄位靠點卡片開編輯彈窗補（比照快速新增卡片的互動） */
export async function createCard(storyboardId: string, laneId: string, input?: { title?: string }): Promise<StoryboardCard> {
  const existing = await db.storyboardCards.where({ storyboardId, laneId }).toArray();
  const order = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0;
  const card: StoryboardCard = {
    id: newId(),
    storyboardId,
    laneId,
    order,
    title: input?.title?.trim() || "未命名卡片",
    relatedEntryIds: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.storyboardCards.add(card);
  return card;
}

export async function updateCard(
  id: string,
  patch: Partial<Omit<StoryboardCard, "id" | "storyboardId" | "createdAt">>
): Promise<void> {
  await db.storyboardCards.update(id, { ...patch, updatedAt: nowISO() });
}

export async function deleteCard(id: string): Promise<void> {
  await db.storyboardCards.delete(id);
}

/** 拖放持久化：同 lane 內移動就重新排序該 lane 全部卡片；跨 lane 移動則來源/目標 lane 都要重新編號，
 * 並把該卡的 laneId 改成目標 lane。targetIndex 會被 clamp 在合法範圍內，避免拖到超出清單長度的位置 */
export async function reorderCard(cardId: string, targetLaneId: string, targetIndex: number): Promise<void> {
  const card = await db.storyboardCards.get(cardId);
  if (!card) return;

  const reindex = (cards: StoryboardCard[]): StoryboardCard[] => cards.map((c, i) => ({ ...c, order: i, updatedAt: nowISO() }));

  if (card.laneId === targetLaneId) {
    const lane = (await db.storyboardCards.where({ storyboardId: card.storyboardId, laneId: targetLaneId }).toArray()).sort(
      (a, b) => a.order - b.order
    );
    const withoutCard = lane.filter((c) => c.id !== cardId);
    const clamped = Math.min(Math.max(targetIndex, 0), withoutCard.length);
    withoutCard.splice(clamped, 0, card);
    await db.storyboardCards.bulkPut(reindex(withoutCard));
    return;
  }

  const [source, target] = await Promise.all([
    db.storyboardCards.where({ storyboardId: card.storyboardId, laneId: card.laneId }).toArray(),
    db.storyboardCards.where({ storyboardId: card.storyboardId, laneId: targetLaneId }).toArray(),
  ]);
  const sourceWithoutCard = source.filter((c) => c.id !== cardId).sort((a, b) => a.order - b.order);
  const targetSorted = target.sort((a, b) => a.order - b.order);
  const clamped = Math.min(Math.max(targetIndex, 0), targetSorted.length);
  targetSorted.splice(clamped, 0, { ...card, laneId: targetLaneId });

  await db.transaction("rw", [db.storyboardCards], async () => {
    await db.storyboardCards.bulkPut(reindex(sourceWithoutCard));
    await db.storyboardCards.bulkPut(reindex(targetSorted));
  });
}
