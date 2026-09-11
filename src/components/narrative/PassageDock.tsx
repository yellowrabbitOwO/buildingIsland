import { useEffect, useRef, useState } from "react";
import PassageEditor from "../entry-editor/PassageEditor";
import { useLanguage } from "../../i18n";

export const MIN_DOCK_HEIGHT = 200;
export const MAX_DOCK_HEIGHT = 720;
/** 拖曳把手（6px）＋頂部標題列（padding/邊框/文字行高）的粗估高度，這塊不算進可調整的 height prop，
 * 但仍佔掉編輯區實際頂端以上的空間——外部若要算「編輯區實際最頂端在哪」（例如把畫布控制列浮到編輯區上緣），
 * 要把這段一起加上去，只用 height prop 會少算這塊，導致抓的位置太低而被蓋住 */
export const DOCK_CHROME_HEIGHT = 48;

/** 拖曳頂邊調整底部段落編輯區高度的把手；比照側邊面板 PanelDivider 的做法，只是方向改成上下 */
function DockResizeHandle({ height, onHeightChange }: { height: number; onHeightChange: (h: number) => void }) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);

  useEffect(() => {
    if (!dragging) return;
    // 把手在編輯區上緣：往上拖（clientY 變小）要讓編輯區變高
    const onMove = (e: MouseEvent) => onHeightChange(startHeightRef.current + (startYRef.current - e.clientY));
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onHeightChange]);

  return (
    <div
      onMouseDown={(e) => {
        startYRef.current = e.clientY;
        startHeightRef.current = height;
        setDragging(true);
      }}
      style={{ height: 6, cursor: "row-resize", flexShrink: 0 }}
      title={t("passageDock.dragToResizeTitle")}
    />
  );
}

/** 段落編輯區：點擊畫布上的段落節點時開啟，可拖曳頂邊調整高度、可關閉。
 * 一般情況固定在整個頁面下方（正文編輯需要較寬的橫向空間，底部通欄比右側窄欄更適合）；
 * embedded 時（分支敘事圖整個搬進側邊欄編輯）改成側邊欄內容裡的一般區塊，跟著欄位一起捲動，
 * 不再用 fixed 定位——這時畫布本來就已經窄，正文編輯區沒有更寬的地方可去，直接跟在畫布下面 */
export default function PassageDock({
  passageId,
  graphId,
  height,
  onHeightChange,
  onClose,
  onDirtyChange,
  right = 0,
  embedded = false,
}: {
  passageId: string;
  graphId: string;
  height: number;
  onHeightChange: (h: number) => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** 側邊面板同時開著時，編輯區右緣要讓出面板的寬度，避免橫跨到面板上面（embedded 時不適用） */
  right?: number;
  embedded?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="passage-dock"
      style={
        embedded
          ? { display: "flex", flexDirection: "column", background: "var(--bg)", borderTop: "1px solid var(--border)", marginTop: 12 }
          : {
              position: "fixed",
              left: 240,
              right,
              bottom: 0,
              zIndex: 30,
              display: "flex",
              flexDirection: "column",
              background: "var(--bg)",
              borderTop: "1px solid var(--border)",
            }
      }
    >
      <DockResizeHandle height={height} onHeightChange={onHeightChange} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("passageDock.title")}</span>
        <button className="btn-ghost" onClick={onClose} title={t("common.close")}>
          ✕
        </button>
      </div>
      <div style={{ height, overflowY: "auto", padding: "16px 20px" }}>
        <PassageEditor key={passageId} passageId={passageId} graphId={graphId} onDirtyChange={onDirtyChange} onDeleted={onClose} />
      </div>
    </div>
  );
}
