import { useState, type ReactNode } from "react";
import { useLanguage } from "../../i18n";

interface CollapsibleCheckboxGroupProps<T extends string> {
  title: string;
  options: { value: T; label: string }[];
  /** 目前勾選的值（已解析成明確清單，例如「不限」情況下由呼叫端傳入全部項目） */
  selected: T[];
  allSelected: boolean;
  onToggle: (value: T) => void;
  onToggleAll: () => void;
  /** 預設是否收合；預設全選時通常不需要展開檢視，故預設收合 */
  defaultCollapsed?: boolean;
  /** 展開時顯示在勾選清單下方的額外內容，例如各類型各自的細部設定 */
  children?: ReactNode;
}

/** 可收合的複選清單，收合時若目前是全選狀態會標註「全選」，供分類限制／圖表類型等較長的清單使用，
 * 避免每次開欄位設定都要看一長串已勾選的項目 */
export default function CollapsibleCheckboxGroup<T extends string>({
  title,
  options,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  defaultCollapsed = true,
  children,
}: CollapsibleCheckboxGroupProps<T>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { t } = useLanguage();

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
        {allSelected && (
          <span className="builtin-badge" style={{ fontSize: 11 }}>
            {t("common.selectAll")}
          </span>
        )}
      </button>
      {!collapsed && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            {t("common.selectAll")}
          </label>
          {options.map((o) => (
            <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {!collapsed && children && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, paddingLeft: 12 }}>{children}</div>
      )}
    </div>
  );
}
