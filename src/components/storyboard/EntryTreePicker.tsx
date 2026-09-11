import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { useLanguage, categoryDisplayName } from "../../i18n";

/** 「相關資訊卡」選擇器：樹狀瀏覽（分類 → 資料夾 → 個別資訊卡勾選），不限分類，選 0 個以上。
 * 跟通用欄位系統的 EntryLinkPicker 是不同元件——那個是平面下拉多選，故事板這裡要的是可展開的樹狀結構，
 * 直接照這裡的需求另外做一個，不去改 EntryLinkPicker 本身（會影響到它在其他欄位的既有用法） */
export default function EntryTreePicker({
  worldId,
  value,
  onChange,
}: {
  worldId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const categories = useLiveQuery(() => db.categories.where({ worldId }).sortBy("order"), [worldId]);
  const folders = useLiveQuery(() => db.folders.where({ worldId }).toArray(), [worldId]);
  const entries = useLiveQuery(() => db.entries.where({ worldId }).toArray(), [worldId]);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const { t } = useLanguage();

  if (!categories || !folders || !entries) return null;

  const toggleSet = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const toggleEntry = (id: string, checked: boolean) => {
    if (checked) onChange([...value, id]);
    else onChange(value.filter((v) => v !== id));
  };

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const selectedNames = value.map((id) => entryById.get(id)?.name).filter((n): n is string => !!n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {selectedNames.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("entryTreePicker.selected", { names: selectedNames.join(t("entryLinkPicker.separator")) })}</p>
      )}
      <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
        {categories.map((cat) => {
          const catEntries = entries.filter((e) => e.categoryId === cat.id);
          if (catEntries.length === 0) return null;
          const catFolders = folders.filter((f) => f.categoryId === cat.id);
          const unfiled = catEntries.filter((e) => !e.folderId);
          const collapsed = collapsedCategoryIds.has(cat.id);
          return (
            <div key={cat.id} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleSet(collapsedCategoryIds, setCollapsedCategoryIds, cat.id)}
                style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
              >
                <span>{collapsed ? "▸" : "▾"}</span>
                {categoryDisplayName(cat, t)}
              </div>
              {!collapsed && (
                <div style={{ paddingLeft: 16 }}>
                  {catFolders.map((folder) => {
                    const folderEntries = catEntries.filter((e) => e.folderId === folder.id);
                    if (folderEntries.length === 0) return null;
                    const fCollapsed = collapsedFolderIds.has(folder.id);
                    return (
                      <div key={folder.id}>
                        <div
                          onClick={() => toggleSet(collapsedFolderIds, setCollapsedFolderIds, folder.id)}
                          style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <span>{fCollapsed ? "▸" : "▾"}</span>📁 {folder.name}
                        </div>
                        {!fCollapsed && (
                          <div style={{ paddingLeft: 16 }}>
                            {folderEntries.map((e) => (
                              <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" }}>
                                <input type="checkbox" checked={value.includes(e.id)} onChange={(ev) => toggleEntry(e.id, ev.target.checked)} />
                                {e.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unfiled.map((e) => (
                    <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "2px 0" }}>
                      <input type="checkbox" checked={value.includes(e.id)} onChange={(ev) => toggleEntry(e.id, ev.target.checked)} />
                      {e.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {entries.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>{t("entryTreePicker.noEntries")}</p>}
      </div>
    </div>
  );
}
