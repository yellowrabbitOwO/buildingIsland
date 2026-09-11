import { db, newId } from "../db";
import type { LandmarkIconType } from "../types";
import { BUILTIN_LANDMARK_ICON_SEEDS } from "../../components/map/FloorPlanLandmarkIcons";

export async function listLandmarkIconTypes(worldId: string): Promise<LandmarkIconType[]> {
  const types = await db.landmarkIconTypes.where({ worldId }).toArray();
  return types.sort((a, b) => a.order - b.order);
}

/** 確保這個世界的內建地標圖示類型齊全：逐一比對 BUILTIN_LANDMARK_ICON_SEEDS，缺哪個（依 builtInKey
 * 比對，"通用" 那筆 builtInKey 是 undefined）就補哪個，不是「已經有任何一筆就整個跳過」——這樣
 * 之後在 BUILTIN_LANDMARK_ICON_SEEDS 新增內建款式時，舊世界下次呼叫這個函式（見 MapViewPage.tsx
 * 的 startEdit）會自動補上新款式，不用另外寫一次性遷移腳本；新世界（從 createWorld 呼叫）則是
 * 一次補齊全部。
 *
 * id 用 newId() 而不是直接拿 seed.type（例如 "town"）當 id——這個表（見 db.ts）的 Dexie 主鍵是
 * 單純的 id，不是 [worldId+id] 複合鍵，如果每個世界的內建類型都用同一組固定字面值當 id，
 * 「第一個」成功塞進去的世界會永久佔用這些 id，其他世界再塞就會主鍵衝突、bulkAdd 整批失敗
 * （console 會看到 landmarkIconTypes.bulkAdd()... Key already exists），導致那個世界永遠補不齊
 * 內建類型、地標點只能退化顯示成通用圖釘——這是實際發生過的 bug，不是假設。builtInKey 才是
 * 「這是哪一種內建圖示」的語意欄位，id 唯一的責任是在資料庫裡當一把不會撞的鑰匙，兩者職責分開後
 * 舊資料（FloorPlanLandmarkPoint.icon 存的是舊版直接把 id 當 "town" 這種字面值）靠
 * MapViewPage.tsx 的 landmarkIconTypeById 額外用 builtInKey 做一層回退比對，不需要轉檔。
 *
 * 「查缺的有哪些」跟「補進去」包在同一個 rw transaction 裡，不是分開兩個 await——這個函式會被
 * MapViewPage 的 startEdit 用 fire-and-forget 方式呼叫（不等它），同一個 worldId 短時間內
 * 被呼叫兩次時（例如快速連點兩次「編輯」），沒包 transaction 的話兩次呼叫可能都讀到同一份
 * 「缺這 9 種」，各自 bulkAdd 一份，因為 id 是 newId() 不會撞主鍵，會靜默塞出重複的內建類型。
 * Dexie 對同一張表的並發 rw transaction 會自動排隊序列化，包起來就能讓後面那次呼叫讀到前一次
 * 已經補好的結果，不會重複塞 */
export async function ensureBuiltInLandmarkIconTypes(worldId: string): Promise<void> {
  await db.transaction("rw", db.landmarkIconTypes, async () => {
    const existing = await db.landmarkIconTypes.where({ worldId }).toArray();
    const existingBuiltInKeys = new Set(existing.filter((t) => t.isBuiltIn).map((t) => t.builtInKey));
    const missing = BUILTIN_LANDMARK_ICON_SEEDS.filter((seed) => !existingBuiltInKeys.has(seed.type));
    if (missing.length === 0) return;
    const baseOrder = existing.length ? Math.max(...existing.map((t) => t.order)) + 1 : 0;
    const types: LandmarkIconType[] = missing.map((seed, index) => ({
      id: newId(),
      worldId,
      label: seed.label,
      isBuiltIn: true,
      builtInKey: seed.type,
      order: baseOrder + index,
    }));
    await db.landmarkIconTypes.bulkAdd(types);
  });
}

export async function createLandmarkIconType(
  worldId: string,
  input: { label: string; customImage?: string; defaultColor?: string }
): Promise<LandmarkIconType> {
  const existing = await db.landmarkIconTypes.where({ worldId }).toArray();
  const nextOrder = existing.length ? Math.max(...existing.map((t) => t.order)) + 1 : 0;
  const type: LandmarkIconType = {
    id: newId(),
    worldId,
    label: input.label,
    isBuiltIn: false,
    customImage: input.customImage,
    defaultColor: input.defaultColor,
    order: nextOrder,
  };
  await db.landmarkIconTypes.add(type);
  return type;
}

/** label／defaultColor／textColor／fillColor 內建、自訂類型都能改；customImage 只對自訂類型
 * 有意義，UI 層只在自訂那一列顯示上傳欄位，這裡不用另外擋——內建的 9 種手繪圖示形狀固定用
 * builtInKey 對應的 SVG，就算被塞了 customImage 也不會被拿去用；textColor／fillColor 同理，
 * 只有沒有 builtInKey（自訂類型／內建的「通用」那一款）時才會實際顯示出來（見
 * FloorPlanLandmarkIconGraphic 的圖示解析優先序）。釘頭上的文字內容（customText）不在類型層級，
 * 是每個地標點自己的欄位，見 FloorPlanLandmarkPoint */
export async function updateLandmarkIconType(
  id: string,
  patch: Partial<Pick<LandmarkIconType, "label" | "customImage" | "defaultColor" | "textColor" | "fillColor">>
): Promise<void> {
  await db.landmarkIconTypes.update(id, patch);
}

export async function deleteLandmarkIconType(id: string): Promise<void> {
  const existing = await db.landmarkIconTypes.get(id);
  if (!existing) return;
  if (existing.isBuiltIn) throw new Error("內建地標圖示無法刪除");
  // 還在用這個類型的地標點不特別清理／轉移——比照 linkedEntryId 失聯資訊卡的既有慣例，
  // 找不到對應類型時畫面上優雅退化成通用圖釘＋原本存的 icon id 當文字，不會整個消失或報錯
  await db.landmarkIconTypes.delete(id);
}
