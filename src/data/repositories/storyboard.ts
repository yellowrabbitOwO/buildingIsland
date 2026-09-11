import { db, newId, nowISO } from "../db";
import type { Storyboard, StoryboardCard, StoryboardLane } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** createStoryboard 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 新故事板預設塞 4 塊 lane（對應 Save the Cat 節拍表的四幕結構），給個不是空板的起點——
 * 使用者可以馬上改名/刪除/新增，資料層完全不特別標記任何一塊為特殊的「未分類」 */
function defaultLanes(t: TFn): StoryboardLane[] {
  return [
    { id: newId(), name: t("storyboardViewPage.defaultLane.act1"), order: 0 },
    { id: newId(), name: t("storyboardViewPage.defaultLane.act2a"), order: 1 },
    { id: newId(), name: t("storyboardViewPage.defaultLane.act2b"), order: 2 },
    { id: newId(), name: t("storyboardViewPage.defaultLane.act3"), order: 3 },
  ];
}

export async function listStoryboards(worldId: string): Promise<Storyboard[]> {
  return db.storyboards.where({ worldId }).toArray();
}

export async function getStoryboard(id: string): Promise<Storyboard | undefined> {
  return db.storyboards.get(id);
}

export async function createStoryboard(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string },
  t: TFn = fallbackT
): Promise<Storyboard> {
  const board: Storyboard = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    lanes: defaultLanes(t),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.storyboards.add(board);
  return board;
}

export async function updateStoryboardMeta(
  id: string,
  patch: Partial<Pick<Storyboard, "name" | "description" | "tagColor" | "folderId">>
): Promise<void> {
  await db.storyboards.update(id, { ...patch, updatedAt: nowISO() });
}

/** lane 的新增/刪除/改名/排序都傳完整新陣列，整欄覆蓋即可——lane 數量少、操作不頻繁，不用逐筆合併。
 *
 * lanes 也可以傳函式：讀到「這次呼叫當下」DB 最新的 lanes 之後才算出要寫入的新值，而不是像純陣列
 * 那樣依賴呼叫端 render 當下（可能已過期）的 board.lanes 快照——例如快速連點兩下「＋新增區塊」，
 * 若都用純陣列模式各自基於 render 快照算出 `[...sortedLanes, newLane]`，第二次呼叫時第一次的寫入
 * 可能還沒回灌到 React state，算出來的新陣列會漏掉第一次剛新增的那個 lane，寫回後把它悄悄蓋掉 */
export async function updateStoryboardLanes(id: string, lanes: StoryboardLane[] | ((current: StoryboardLane[]) => StoryboardLane[])): Promise<void> {
  if (typeof lanes === "function") {
    // 讀取＋計算＋寫入要包在同一個 rw 交易裡才有意義——單純各自呼叫 db.storyboards.get() 再 update()，
    // 兩個沒有互相 await 的呼叫仍然可能都讀到同一份舊資料（交易序列化保證的是「交易之間」不會交錯，
    // 光靠「呼叫時才重新讀取」本身不足以避免這個競態，一定要在同一個交易內完成整段讀-改-寫）
    await db.transaction("rw", db.storyboards, async () => {
      const board = await db.storyboards.get(id);
      if (!board) return;
      await db.storyboards.update(id, { lanes: lanes(board.lanes), updatedAt: nowISO() });
    });
    return;
  }
  await db.storyboards.update(id, { lanes, updatedAt: nowISO() });
}

/** 卡片是故事板自己的一手內容（不像關係圖節點是借用條目），刪板要連坐刪除底下所有卡片 */
export async function deleteStoryboard(id: string): Promise<void> {
  await db.transaction("rw", [db.storyboards, db.storyboardCards], async () => {
    await db.storyboardCards.where({ storyboardId: id }).delete();
    await db.storyboards.delete(id);
  });
}

export async function toggleStoryboardStar(id: string): Promise<void> {
  const board = await db.storyboards.get(id);
  if (!board) return;
  const starred = !board.starred;
  const patch: Partial<Storyboard> = { starred, updatedAt: nowISO() };
  if (starred && board.starOrder === undefined) patch.starOrder = Date.now();
  await db.storyboards.update(id, patch);
}

/** lanes 是嵌在 Storyboard 文件裡的欄位（不是獨立資料表），原樣複製一份 id 不變即可——
 * 卡片才是獨立資料表（storyboardCards），複製時要連坐複製，laneId 沿用（lane id 沒變，
 * 指向的仍是複製出來的同一批 lane），storyboardId 改指向新板子 */
export async function duplicateStoryboard(id: string, folderId?: string, t: TFn = fallbackT): Promise<Storyboard> {
  const original = await db.storyboards.get(id);
  if (!original) throw new Error("找不到故事板");
  const cards = await db.storyboardCards.where({ storyboardId: id }).toArray();
  const now = nowISO();
  const copy: Storyboard = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    lanes: original.lanes.map((l) => ({ ...l })),
    createdAt: now,
    updatedAt: now,
  };
  const newCards: StoryboardCard[] = cards.map((c) => ({ ...c, id: newId(), storyboardId: copy.id, createdAt: now, updatedAt: now }));
  await db.transaction("rw", [db.storyboards, db.storyboardCards], async () => {
    await db.storyboards.add(copy);
    if (newCards.length) await db.storyboardCards.bulkAdd(newCards);
  });
  return copy;
}

export async function moveStoryboardsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const boards = await db.storyboards.bulkGet(ids);
  const updated = boards.filter((b): b is Storyboard => !!b).map((b) => ({ ...b, folderId, updatedAt: nowISO() }));
  await db.storyboards.bulkPut(updated);
}

export async function listStarredStoryboards(worldId: string): Promise<Storyboard[]> {
  const all = await listStoryboards(worldId);
  return all.filter((b) => b.starred);
}
