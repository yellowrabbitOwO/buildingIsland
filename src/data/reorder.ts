import { useState, type CSSProperties, type DragEvent } from "react";

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** 提供拖曳排序互動：handleProps 給拖曳把手，rowProps 給接收放置的整列，
 * dropIndicatorStyle 依目前拖曳懸停位置回傳要疊加的樣式（該列上緣或下緣一條提示線），
 * 讓使用者在放開前就能清楚看到項目會被插入的確切位置（而不只是被拖曳項目本身變半透明） */
export function useDragReorder<T>(items: T[], onChange: (next: T[]) => void, enabled = true) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overPosition, setOverPosition] = useState<"before" | "after" | null>(null);

  const reset = () => {
    setDragIndex(null);
    setOverIndex(null);
    setOverPosition(null);
  };

  const handleProps = (index: number) =>
    enabled
      ? {
          draggable: true,
          onDragStart: () => setDragIndex(index),
          onDragEnd: reset,
        }
      : {};

  const rowProps = (index: number) =>
    enabled
      ? {
          onDragOver: (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            if (dragIndex === null || dragIndex === index) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2;
            setOverIndex(index);
            setOverPosition(before ? "before" : "after");
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragIndex !== null && overIndex !== null) {
              let to = overIndex + (overPosition === "after" ? 1 : 0);
              if (dragIndex < to) to -= 1;
              if (dragIndex !== to) onChange(moveItem(items, dragIndex, to));
            }
            reset();
          },
        }
      : {};

  /** 用 box-shadow 而非 border／outline，避免額外佔用版面高度造成其他列跳動 */
  const dropIndicatorStyle = (index: number): CSSProperties =>
    overIndex === index && dragIndex !== index
      ? { boxShadow: overPosition === "after" ? "0 2px 0 0 var(--accent)" : "0 -2px 0 0 var(--accent)" }
      : {};

  return { handleProps, rowProps, dragIndex, overIndex, overPosition, dropIndicatorStyle };
}

/** 故事板卡片的拖曳排序：跟 useDragReorder 不同，卡片分散在多個 lane 裡，「拖了哪張卡片」跟「懸停在哪個位置」
 * 都要記住屬於哪個 lane，同 lane 內重排跟跨 lane 搬移都走同一組 handler。這個 hook 只管暫時性的拖曳互動
 * 狀態，不持有卡片陣列本身——放開時只回報「拖了哪張卡片、放到哪個 lane、懸停在哪張卡片的前/後（null 代表
 * lane 尾端）」，換算成實際插入索引的工作交給呼叫端（呼叫端才知道每個 lane 目前的卡片順序）。
 * 卡片在 lane 內是橫向排列（比照節拍表版面），所以懸停位置判斷用游標相對卡片的水平中線
 * （clientX／rect.left），不是 useDragReorder 用的垂直中線 */
export function useLaneDragReorder(
  onMove: (cardId: string, targetLaneId: string, targetCardId: string | null, position: "before" | "after" | null) => void
) {
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragSourceLaneId, setDragSourceLaneId] = useState<string | null>(null);
  const [overLaneId, setOverLaneId] = useState<string | null>(null);
  const [overCardId, setOverCardId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<"before" | "after" | null>(null);

  const reset = () => {
    setDragCardId(null);
    setDragSourceLaneId(null);
    setOverLaneId(null);
    setOverCardId(null);
    setOverPosition(null);
  };

  const handleProps = (cardId: string, laneId: string) => ({
    draggable: true,
    onDragStart: () => {
      setDragCardId(cardId);
      setDragSourceLaneId(laneId);
    },
    onDragEnd: reset,
  });

  /** 掛在單張卡片上；務必 stopPropagation，否則下面 laneDropProps 的 onDragOver 也會觸發，
   * 把 overCardId 蓋回 null（等於把懸停目標從「這張卡片前/後」錯改成「這個 lane 尾端」） */
  const cardDropProps = (laneId: string, cardId: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragCardId === null || dragCardId === cardId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      setOverLaneId(laneId);
      setOverCardId(cardId);
      setOverPosition(before ? "before" : "after");
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      commitDrop();
    },
  });

  /** 掛在 lane 容器／空白尾端；代表「插入到這個 lane 的最後面」 */
  const laneDropProps = (laneId: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (dragCardId === null) return;
      setOverLaneId(laneId);
      setOverCardId(null);
      setOverPosition(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      commitDrop();
    },
  });

  function commitDrop() {
    if (dragCardId !== null && overLaneId !== null) {
      onMove(dragCardId, overLaneId, overCardId, overPosition);
    }
    reset();
  }

  const dropIndicatorStyle = (cardId: string): CSSProperties =>
    overCardId === cardId && dragCardId !== cardId
      ? { boxShadow: overPosition === "after" ? "2px 0 0 0 var(--accent)" : "-2px 0 0 0 var(--accent)" }
      : {};

  const laneHighlightStyle = (laneId: string): CSSProperties =>
    dragCardId !== null && overLaneId === laneId && laneId !== dragSourceLaneId ? { background: "var(--bg-hover)" } : {};

  return { handleProps, cardDropProps, laneDropProps, dragCardId, dropIndicatorStyle, laneHighlightStyle };
}

/** useDragToFolder 的 itemDragProps 回傳值型別，供各卡片元件（EntryCard／MapCard…）宣告
 * dragProps 這個透傳 prop 時共用，不用每個檔案各自重複宣告一次 */
export type DragSourceProps = { draggable?: boolean; onDragStart?: () => void; onDragEnd?: () => void };

/** 比照桌面檔案總管「拖曳圖示到資料夾」的互動：卡片本身是拖曳來源，資料夾列（含「未分類」
 * 這個虛擬容器，folderId 傳 undefined 代表它）是放置目標，放開時直接呼叫 onMove 搬移，
 * 不像 useDragReorder／useLaneDragReorder 還要算「插入在誰前後」——資料夾內部本來就不排序，
 * 移進去就是移進去，位置交給各分頁既有的排序邏輯（依名稱／最後修改）決定 */
export function useDragToFolder(onMove: (itemId: string, folderId: string | undefined) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | undefined>(undefined);
  const [overActive, setOverActive] = useState(false);

  const reset = () => {
    setDragId(null);
    setOverActive(false);
  };

  const itemDragProps = (id: string, enabled = true) =>
    enabled
      ? {
          draggable: true,
          onDragStart: () => setDragId(id),
          onDragEnd: reset,
        }
      : {};

  /** folderId 傳 undefined 代表「未分類」這個放置目標 */
  const folderDropProps = (folderId: string | undefined) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (dragId === null) return;
      e.preventDefault();
      setOverFolderId(folderId);
      setOverActive(true);
    },
    onDragLeave: () => {
      if (overFolderId === folderId) setOverActive(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId !== null) onMove(dragId, folderId);
      reset();
    },
  });

  const folderHighlightStyle = (folderId: string | undefined): CSSProperties =>
    overActive && overFolderId === folderId ? { outline: "2px dashed var(--accent)", outlineOffset: -2 } : {};

  return { itemDragProps, folderDropProps, folderHighlightStyle, dragId };
}
