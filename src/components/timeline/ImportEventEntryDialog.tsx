import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import Modal from "../common/Modal";
import { checkEntryImportability } from "../../data/repositories/timelineEventSync";
import type { Entry } from "../../data/types";
import { useLanguage } from "../../i18n";

/** 從既有的「事件」分類資訊卡挑一張匯入成時間線事件（見 createEventFromEntry）：依資料夾分組、
 * 可收合展開（比照 EntryTreePicker 的資料夾樹狀瀏覽），關鍵字篩選；每張卡片能不能匯入
 * （見 checkEntryImportability）在清單上就先標示出來，不用等按下去才知道失敗 */
export default function ImportEventEntryDialog({
  worldId,
  onClose,
  onSelect,
}: {
  worldId: string;
  onClose: () => void;
  onSelect: (entry: Entry) => void;
}) {
  const [query, setQuery] = useState("");
  const { t } = useLanguage();
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const category = useLiveQuery(
    () => db.categories.filter((c) => c.worldId === worldId && c.builtInKey === "event").first(),
    [worldId]
  );
  const entries =
    useLiveQuery(() => (category ? db.entries.where({ worldId, categoryId: category.id }).toArray() : []), [worldId, category?.id]) ?? [];
  const folders =
    useLiveQuery(
      () => (category ? db.folders.where({ worldId }).filter((f) => f.categoryId === category.id).toArray() : []),
      [worldId, category?.id]
    ) ?? [];

  const filtered = entries.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));
  const foldersWithEntries = folders
    .map((folder) => ({ folder, entries: filtered.filter((e) => e.folderId === folder.id) }))
    .filter((g) => g.entries.length > 0);
  const unfiled = filtered.filter((e) => !e.folderId);

  const toggleFolder = (id: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderEntryButton = (e: Entry) => {
    const check = checkEntryImportability(e, t);
    return (
      <button
        key={e.id}
        className="btn-ghost"
        disabled={!check.ok}
        title={check.ok ? undefined : check.reason}
        style={{
          textAlign: "left",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 2,
          opacity: check.ok ? 1 : 0.5,
          cursor: check.ok ? "pointer" : "not-allowed",
        }}
        onClick={() => check.ok && onSelect(e)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{e.name}</span>
          {!check.ok && (
            <span style={{ color: "var(--danger, #e08283)", fontSize: 12, flexShrink: 0, textAlign: "right" }}>
              {t("importEventEntryDialog.cannotImportPrefix", { reason: check.reason ?? "" })}
            </span>
          )}
        </div>
        {e.summary && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{e.summary}</span>}
      </button>
    );
  };

  return (
    <Modal title={t("importEventEntryDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder={t("importEventEntryDialog.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {entries.length === 0 && <p style={{ margin: 0, color: "var(--text-faint)", fontSize: 13 }}>{t("importEventEntryDialog.noEntries")}</p>}
          {entries.length > 0 && filtered.length === 0 && (
            <p style={{ margin: 0, color: "var(--text-faint)", fontSize: 13 }}>{t("importEventEntryDialog.noMatch")}</p>
          )}
          {foldersWithEntries.map(({ folder, entries: folderEntries }) => {
            const collapsed = collapsedFolderIds.has(folder.id);
            return (
              <div key={folder.id}>
                <div
                  onClick={() => toggleFolder(folder.id)}
                  style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}
                >
                  <span>{collapsed ? "▸" : "▾"}</span>📁 {folder.name}
                </div>
                {!collapsed && (
                  <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
                    {folderEntries.map(renderEntryButton)}
                  </div>
                )}
              </div>
            );
          })}
          {unfiled.map(renderEntryButton)}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
