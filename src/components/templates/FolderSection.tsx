import { useState, type ReactNode } from "react";
import type { ManagerFolder, Scope } from "../../data/types";
import ColorInput from "../common/ColorInput";
import ResolvedColor from "../common/ResolvedColor";
import DropdownMenu from "../common/DropdownMenu";
import { useLanguage } from "../../i18n";

interface FolderSectionProps {
  folder: ManagerFolder;
  itemCount: number;
  /** 是否顯示「空」提示；預設用 itemCount === 0。資料夾內只有子資料夾、沒有項目時，呼叫端可傳 false 蓋掉，改渲染 children（子資料夾們） */
  isEmpty?: boolean;
  onRename: (name: string) => void;
  onScopeChange: (scope: Scope) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onAddSubfolder?: () => void;
  onMove?: () => void;
  children: ReactNode;
}

/** 使用者自建的管理資料夾（範本/模組/群組/標籤色彩皆可用）：可改名、改範圍、改顏色、複製、刪除、新增子資料夾、移動，操作收在單一設定選單內 */
export default function FolderSection({
  folder,
  itemCount,
  isEmpty,
  onRename,
  onScopeChange,
  onColorChange,
  onDelete,
  onDuplicate,
  onAddSubfolder,
  onMove,
  children,
}: FolderSectionProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const { t } = useLanguage();

  const commitName = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setName(folder.name);
  };

  return (
    <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-hover)",
        }}
      >
        <button className="btn-ghost" style={{ padding: 0 }} onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"}
        </button>
        <ResolvedColor value={folder.tagColor}>
          {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
        </ResolvedColor>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            style={{ fontWeight: 600, fontSize: 14 }}
          />
        ) : (
          <strong style={{ cursor: "pointer" }} onClick={() => setEditing(true)} title={t("folderSection.renameTitle")}>
            {folder.name}
          </strong>
        )}
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
          {t("folderSection.scopeAndItemCount", {
            scope: folder.scope === "world" ? t("templateManagerPage.scopeSingleWorld") : t("templateManagerPage.scopeGlobal"),
            count: itemCount,
          })}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <DropdownMenu label={t("folderSection.settingsTrigger")} title={t("folderSection.settingsTitle")} align="right" minWidth={170}>
            {(close) => (
              <>
                <button
                  className="btn-ghost"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    setEditing(true);
                    close();
                  }}
                >
                  {t("templateManagerPage.renameButton")}
                </button>
                <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--text-faint)" }}>{t("createColorSwatchDialog.scopeLabel")}</div>
                <button
                  className="btn-ghost"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    onScopeChange("world");
                    close();
                  }}
                >
                  {folder.scope === "world" ? "● " : "○ "}{t("templateManagerPage.scopeSingleWorld")}
                </button>
                <button
                  className="btn-ghost"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    onScopeChange("global");
                    close();
                  }}
                >
                  {folder.scope === "global" ? "● " : "○ "}{t("managerFolder.globalScopeOption")}
                </button>
                <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{t("folderSection.colorLabel")}</span>
                  <ColorInput value={folder.tagColor} onChange={onColorChange} worldId={folder.worldId} />
                </div>
                {onDuplicate && (
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    onClick={() => {
                      onDuplicate();
                      close();
                    }}
                  >
                    {t("folderSection.duplicateFolder")}
                  </button>
                )}
                {onAddSubfolder && (
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    onClick={() => {
                      onAddSubfolder();
                      close();
                    }}
                  >
                    {t("folderSection.addSubfolder")}
                  </button>
                )}
                {onMove && (
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    onClick={() => {
                      onMove();
                      close();
                    }}
                  >
                    {t("folderSection.moveFolder")}
                  </button>
                )}
                <button
                  className="btn-ghost"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    onDelete();
                    close();
                  }}
                >
                  {t("folderSection.deleteFolder")}
                </button>
              </>
            )}
          </DropdownMenu>
        </div>
      </div>
      {open && (
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {(isEmpty ?? itemCount === 0) ? (
            <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>{t("folderSection.emptyHint")}</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
