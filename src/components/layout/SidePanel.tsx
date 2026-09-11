import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { World } from "../../data/types";
import { db } from "../../data/db";
import { useSidePanel } from "../common/SidePanelProvider";
import SidePanelContent from "./SidePanelContent";
import { useLanguage, categoryDisplayName } from "../../i18n";

function PanelDivider({ width, onWidthChange }: { width: number; onWidthChange: (w: number) => void }) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    if (!dragging) return;
    // 面板在右側、分隔線在面板左邊：往左拖（clientX 變小）要讓面板變寬，所以是起始寬度加上「起始 x 減去目前 x」
    const onMove = (e: MouseEvent) => onWidthChange(startWidthRef.current + (startXRef.current - e.clientX));
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onWidthChange]);

  return (
    <div
      className="panel-divider"
      onMouseDown={(e) => {
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        setDragging(true);
      }}
      style={{ width: 6, flexShrink: 0, cursor: "col-resize" }}
      title={t("sidePanel.dragToResizeTitle")}
    />
  );
}

/** 條目面板下方的「回到○○目錄」捷徑：依條目所屬分類顯示，點擊切換面板本身回到該分類的條目清單
 * （不是導覽主畫面——面板的用途就是讓使用者在不離開主畫面的情況下瀏覽，回到目錄後還要能繼續點別的條目） */
function EntryPanelCategoryLink({ entryId }: { entryId: string }) {
  const { openPanel } = useSidePanel();
  const { t } = useLanguage();
  const entry = useLiveQuery(() => db.entries.get(entryId), [entryId]);
  const category = useLiveQuery(() => (entry ? db.categories.get(entry.categoryId) : undefined), [entry?.categoryId]);
  if (!entry || !category) return null;
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
      <button
        className="btn-ghost"
        style={{ padding: 0, fontSize: 13 }}
        onClick={() => openPanel({ kind: "category", categoryId: category.id })}
      >
        {t("sidePanel.backToCategory", { name: categoryDisplayName(category, t) })}
      </button>
    </div>
  );
}

/** 側邊面板本體：沒有開啟的內容時完全不渲染（含分隔線） */
export default function SidePanelHost({ world }: { world: World }) {
  const { panelView, panelWidth, closePanel, setPanelWidth } = useSidePanel();
  const { t } = useLanguage();
  if (!panelView) return null;

  return (
    <>
      <PanelDivider width={panelWidth} onWidthChange={setPanelWidth} />
      <aside
        className="side-panel"
        style={{
          width: panelWidth,
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            background: "var(--bg)",
            // 面板內容（如 EntryPage 自己的 sticky 標題列）也會用 sticky，這裡的 z-index 要比它們都高，
            // 否則往下捲動時內層的 sticky 元素會浮到這層外殼上面，蓋住「側欄預覽」標題列。
            // 下面的「回到○○目錄」捷徑也一起包在這層裡固定住，不能各自 sticky——
            // 各自 sticky 的話兩者的 top 都要手動對齊高度，改成同一層外殼最單純
            zIndex: 25,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {panelView.kind === "entry"
                ? t("sidePanel.kind.entry")
                : panelView.kind === "narrativeGraph"
                  ? t("sidePanel.kind.narrativeGraph")
                  : panelView.kind === "relationGraph"
                    ? t("sidePanel.kind.relationGraph")
                    : panelView.kind === "writingDoc"
                      ? t("sidePanel.kind.writingDoc")
                      : panelView.kind === "storyboard"
                        ? t("sidePanel.kind.storyboard")
                        : panelView.kind === "scriptDoc"
                          ? t("sidePanel.kind.scriptDoc")
                          : panelView.kind === "timeline"
                            ? t("sidePanel.kind.timeline")
                            : panelView.kind === "storyOutline"
                              ? t("sidePanel.kind.storyOutline")
                              : panelView.kind === "category"
                                ? t("sidePanel.kind.category")
                                : t("sidePanel.kind.default")}
            </span>
            <button className="btn-ghost" onClick={closePanel} title={t("sidePanel.closeTitle")}>
              ✕
            </button>
          </div>
          {panelView.kind === "entry" && <EntryPanelCategoryLink entryId={panelView.entryId} />}
        </div>
        <div style={{ padding: "16px 20px" }}>
          <SidePanelContent view={panelView} world={world} />
        </div>
      </aside>
    </>
  );
}
