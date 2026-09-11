import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: ReactNode;
  children: ReactNode;
  /** 預設是否收合；預設收合，避免次要設定佔用太多版面 */
  defaultCollapsed?: boolean;
}

/** 可收合的設定區塊，用於次要/進階設定（如圖表各類型各自的細部設定、刻度的範圍與端點設定），
 * 避免欄位設定對話框一次展開所有內容顯得冗長 */
export default function CollapsibleSection({ title, children, defaultCollapsed = true }: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setCollapsed((c) => !c)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: 0, fontSize: 13 }}
      >
        <span>{collapsed ? "▸" : "▾"}</span>
        <span>{title}</span>
      </button>
      {!collapsed && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
