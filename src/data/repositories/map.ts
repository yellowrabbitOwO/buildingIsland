import { db, newId, nowISO } from "../db";
import type { MapView } from "../types";
import { resizeHeightMapDataUrl } from "../terrainBrush";
import type { TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateMap 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export interface MapSizePreset {
  labelKey: TranslationKey;
  width: number;
  height: number;
}

/** 常見地圖尺寸預設；「中」是既有預設值，新增/調整尺寸時都從這裡挑選 */
export const MAP_SIZE_PRESETS: MapSizePreset[] = [
  { labelKey: "mapSizePreset.small", width: 1200, height: 800 },
  { labelKey: "mapSizePreset.medium", width: 1600, height: 1000 },
  { labelKey: "mapSizePreset.large", width: 2400, height: 1600 },
  { labelKey: "mapSizePreset.extraLarge", width: 3200, height: 2000 },
];

export const DEFAULT_MAP_WIDTH = MAP_SIZE_PRESETS[1].width;
export const DEFAULT_MAP_HEIGHT = MAP_SIZE_PRESETS[1].height;

function normalize(map: MapView): MapView {
  return {
    ...map,
    width: map.width ?? DEFAULT_MAP_WIDTH,
    height: map.height ?? DEFAULT_MAP_HEIGHT,
    // dimensions／symbols／polygons／texts／landmarkPoints／landmarkAreas 都是陸續後補的欄位，
    // 舊資料的 floorPlan 可能沒有這幾個陣列，這裡補上空陣列，讓其餘程式碼可以放心假設它們一定
    // 存在，不用每個讀取點各自防呆。地標「圖層」是否存在則不在這裡處理——那需要 newId() 建立
    // 實體的副作用，職責上屬於 MapViewPage.tsx 的 startEdit()，這裡只做純聲明式的欄位補齊
    floorPlan: map.floorPlan
      ? {
          ...map.floorPlan,
          dimensions: map.floorPlan.dimensions ?? [],
          symbols: map.floorPlan.symbols ?? [],
          polygons: map.floorPlan.polygons ?? [],
          texts: map.floorPlan.texts ?? [],
          landmarkPoints: map.floorPlan.landmarkPoints ?? [],
          landmarkAreas: map.floorPlan.landmarkAreas ?? [],
        }
      : map.floorPlan,
  };
}

export async function listMaps(worldId: string): Promise<MapView[]> {
  const all = await db.maps.where({ worldId }).toArray();
  return all.map(normalize);
}

export async function getMap(id: string): Promise<MapView | undefined> {
  const map = await db.maps.get(id);
  return map && normalize(map);
}

export async function createMap(
  worldId: string,
  input: { name: string; description?: string; tagColor?: string; folderId?: string; width?: number; height?: number }
): Promise<MapView> {
  const map: MapView = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    width: input.width ?? DEFAULT_MAP_WIDTH,
    height: input.height ?? DEFAULT_MAP_HEIGHT,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.maps.add(map);
  return map;
}

/** width/height 有變動且既有高度圖存在時，先把高度圖拉伸縮放到新尺寸再一起寫入，
 * 避免調整地圖尺寸後既有地形跟畫布尺寸對不上（被裁掉或留白） */
export async function updateMapMeta(
  id: string,
  patch: Partial<Pick<MapView, "name" | "description" | "tagColor" | "folderId" | "seaColor" | "width" | "height">>
): Promise<void> {
  if (patch.width !== undefined || patch.height !== undefined) {
    const map = await db.maps.get(id);
    if (!map) return;
    const newWidth = patch.width ?? map.width;
    const newHeight = patch.height ?? map.height;
    if ((newWidth !== map.width || newHeight !== map.height) && map.heightMap) {
      const rescaled = await resizeHeightMapDataUrl(map.heightMap, newWidth, newHeight);
      await db.maps.update(id, { ...patch, width: newWidth, height: newHeight, heightMap: rescaled, updatedAt: nowISO() });
      return;
    }
  }
  await db.maps.update(id, { ...patch, updatedAt: nowISO() });
}

export async function deleteMap(id: string): Promise<void> {
  await db.maps.delete(id);
}

export async function toggleMapStar(id: string): Promise<void> {
  const map = await db.maps.get(id);
  if (!map) return;
  const starred = !map.starred;
  const patch: Partial<MapView> = { starred, updatedAt: nowISO() };
  // 新加星號時給一個排序值，讓它自然排到主世界首頁清單最後面；取消星號則保留原值，不影響其他項目
  if (starred && map.starOrder === undefined) patch.starOrder = Date.now();
  await db.maps.update(id, patch);
}

export async function duplicateMap(id: string, folderId?: string, t: TFn = fallbackT): Promise<MapView> {
  const original = await db.maps.get(id);
  if (!original) throw new Error("找不到地圖");
  const now = nowISO();
  const copy: MapView = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await db.maps.add(copy);
  return copy;
}

export async function moveMapsToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const maps = await db.maps.bulkGet(ids);
  const updated = maps.filter((m): m is MapView => !!m).map((m) => ({ ...m, folderId, updatedAt: nowISO() }));
  await db.maps.bulkPut(updated);
}

export async function listStarredMaps(worldId: string): Promise<MapView[]> {
  const all = await listMaps(worldId);
  return all.filter((m) => m.starred);
}

/** 畫布互動（筆刷結果、視角、底圖參考、比例尺／指北針）：互動結束立即整包覆蓋寫入，不像
 * updateRelationGraphState 的 positions 需要逐鍵合併——這幾個欄位每次都是整包新值，不是局部修改 */
export async function updateMapState(
  id: string,
  patch: Partial<Pick<MapView, "heightMap" | "viewport" | "referenceImage" | "referenceImageOpacity" | "scaleBar" | "compass" | "floorPlan">>
): Promise<void> {
  await db.maps.update(id, { ...patch, updatedAt: nowISO() });
}
