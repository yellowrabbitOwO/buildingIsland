import { db, newId, nowISO } from "../db";
import type { RelationGraphView } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateRelationGraph 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 補上網格欄位（gridVisible/alignMode）的預設值——這兩個欄位是後來才加入的，
 * 舊資料（改版前建立的關係圖）不會有這兩個 key，讀取時一律補齊，避免下游誤判 undefined */
function normalize(view: RelationGraphView): RelationGraphView {
  return {
    ...view,
    gridVisible: view.gridVisible ?? false,
    alignMode: view.alignMode ?? "none",
    gridSize: view.gridSize ?? 24,
    layoutMode: view.layoutMode ?? "force",
    groups: view.groups ?? [],
  };
}

export async function listRelationGraphs(worldId: string): Promise<RelationGraphView[]> {
  const all = await db.relationGraphs.where({ worldId }).toArray();
  return all.map(normalize);
}

export async function getRelationGraph(id: string): Promise<RelationGraphView | undefined> {
  const view = await db.relationGraphs.get(id);
  return view && normalize(view);
}

export async function createRelationGraph(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string }
): Promise<RelationGraphView> {
  const view: RelationGraphView = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    hiddenNodeIds: [],
    hiddenCategoryIds: [],
    positions: {},
    gridVisible: false,
    alignMode: "none",
    gridSize: 24,
    layoutMode: "force",
    groups: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.relationGraphs.add(view);
  return view;
}

export async function updateRelationGraphMeta(
  id: string,
  patch: Partial<Pick<RelationGraphView, "name" | "description" | "tagColor" | "folderId">>
): Promise<void> {
  await db.relationGraphs.update(id, { ...patch, updatedAt: nowISO() });
}

/** 節點/連線永遠即時從世界的條目與關聯資料算出、不是存在這張表裡的東西（見類別註解），
 * 這裡複製的是「檢視」本身的個人化設定（隱藏節點/分類、手動調整過的位置、網格設定等） */
export async function duplicateRelationGraph(id: string, folderId?: string, t: TFn = fallbackT): Promise<RelationGraphView> {
  const raw = await db.relationGraphs.get(id);
  if (!raw) throw new Error("找不到關係圖");
  const original = normalize(raw);
  const now = nowISO();
  const copy: RelationGraphView = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    positions: { ...original.positions },
    hiddenNodeIds: [...original.hiddenNodeIds],
    hiddenCategoryIds: [...original.hiddenCategoryIds],
    groups: original.groups.map((g) => ({ ...g })),
    createdAt: now,
    updatedAt: now,
  };
  await db.relationGraphs.add(copy);
  return copy;
}

export async function deleteRelationGraph(id: string): Promise<void> {
  await db.relationGraphs.delete(id);
}

export async function toggleRelationGraphStar(id: string): Promise<void> {
  const view = await db.relationGraphs.get(id);
  if (!view) return;
  const starred = !view.starred;
  const patch: Partial<RelationGraphView> = { starred, updatedAt: nowISO() };
  // 新加星號時給一個排序值，讓它自然排到主世界首頁清單最後面；取消星號則保留原值，不影響其他項目
  if (starred && view.starOrder === undefined) patch.starOrder = Date.now();
  await db.relationGraphs.update(id, patch);
}

/** 切換呈現模式（自動排列／樹狀階層）：兩種演算法的座標系統不相容，直接清空已存座標，
 * 讓畫面依新模式重新計算，而非沿用舊模式排出來的位置 */
export async function switchRelationGraphLayout(id: string, layoutMode: RelationGraphView["layoutMode"]): Promise<void> {
  await db.relationGraphs.update(id, { layoutMode, positions: {}, updatedAt: nowISO() });
}

export async function moveRelationGraphsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const views = await db.relationGraphs.bulkGet(ids);
  const updated = views.filter((v): v is RelationGraphView => !!v).map((v) => ({ ...v, folderId, updatedAt: nowISO() }));
  await db.relationGraphs.bulkPut(updated);
}

export async function listStarredRelationGraphs(worldId: string): Promise<RelationGraphView[]> {
  const all = await listRelationGraphs(worldId);
  return all.filter((v) => v.starred);
}

type RelationGraphStatePatch = Partial<
  Pick<RelationGraphView, "positions" | "hiddenNodeIds" | "hiddenCategoryIds" | "gridVisible" | "alignMode" | "gridSize" | "groups" | "viewport">
>;

/** 節點位置以外的欄位（隱藏節點/分類、網格設定）呼叫端永遠傳完整新值，整欄覆蓋即可；
 * positions 則要逐節點合併，否則 Dexie update() 的淺層覆蓋會洗掉其他節點已存的位置。
 *
 * patch 也可以傳函式：在讀到「這次呼叫當下」DB 最新的 view 之後才算出要寫入的新值，而不是像純物件
 * 那樣依賴呼叫端 render 當下（可能已過期）的 view 快照——例如連續快速點兩個不同節點的「隱藏」，
 * 若都用純物件模式各自基於 render 快照算出 `[...view.hiddenNodeIds, id]`，第二次呼叫時第一次的寫入
 * 可能還沒回灌到 React state，算出來的新陣列會漏掉第一次剛加進去的那個 id，寫回後把它悄悄蓋掉。
 * 用函式模式就一定是這次呼叫自己重新讀到的最新 DB 值為準，不會有這個問題——但光是「呼叫時才重新讀取」
 * 還不夠：如果兩次函式呼叫互相沒有 await 對方，兩次讀取仍可能都發生在對方寫入之前，各自拿到同一份
 * 舊值。一定要把讀-算-寫包在同一個 rw 交易裡，靠 IndexedDB 對同一個 store 的 readwrite 交易天生互斥
 * （後一個交易一定等前一個交易 commit 完才開始）來保證真正的原子性 */
export async function updateRelationGraphState(id: string, patch: RelationGraphStatePatch | ((view: RelationGraphView) => RelationGraphStatePatch)): Promise<void> {
  if (typeof patch === "function") {
    await db.transaction("rw", db.relationGraphs, async () => {
      const view = await db.relationGraphs.get(id);
      if (!view) return;
      const resolved = patch(view);
      const next: Partial<RelationGraphView> = { ...resolved, updatedAt: nowISO() };
      if (resolved.positions) next.positions = { ...view.positions, ...resolved.positions };
      await db.relationGraphs.update(id, next);
    });
    return;
  }
  const view = await db.relationGraphs.get(id);
  if (!view) return;
  const next: Partial<RelationGraphView> = { ...patch, updatedAt: nowISO() };
  if (patch.positions) next.positions = { ...view.positions, ...patch.positions };
  await db.relationGraphs.update(id, next);
}
