import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Calendar, Entry, EntryFolder, World } from "../data/types";
import { useTheme } from "../theme";
import { useLanguage, categoryDisplayName, type Language } from "../i18n";
import { collectWorldExport, collectCategoriesExport, collectEntriesExport } from "../data/repositories/worldExport";
import { entriesToCombinedMarkdown, entriesToMarkdownZip, type MarkdownExportContext } from "../data/exportMarkdown";
import { downloadBlob } from "../data/downloadFile";
import Modal from "../components/common/Modal";
import CurrentUserSection from "../components/localUser/CurrentUserSection";

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Markdown 渲染需要的查表資訊：entryNameById 給 entryLink／scale(entryLink 端點) 用，
 * calendarById 給 date 欄位用，foldersByCategoryId／entriesByCategoryId 給
 * nested(mode:"category") 欄位現場重建選項樹用——直接從這次匯出範圍已經撈到的 entries／folders
 * 分組建表，範圍外的分類自然就沒有資料，Markdown 那邊會相應退化顯示提示文字 */
function buildMarkdownContext(entries: Entry[], folders: EntryFolder[], calendars: Calendar[]): MarkdownExportContext {
  const foldersByCategoryId = new Map<string, EntryFolder[]>();
  for (const f of folders) {
    if (!foldersByCategoryId.has(f.categoryId)) foldersByCategoryId.set(f.categoryId, []);
    foldersByCategoryId.get(f.categoryId)!.push(f);
  }
  const entriesByCategoryId = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!entriesByCategoryId.has(e.categoryId)) entriesByCategoryId.set(e.categoryId, []);
    entriesByCategoryId.get(e.categoryId)!.push(e);
  }
  return {
    entryNameById: new Map(entries.map((e) => [e.id, e.name])),
    calendarById: new Map(calendars.map((c) => [c.id, c])),
    foldersByCategoryId,
    entriesByCategoryId,
  };
}

const exportDateStamp = () => new Date().toISOString().slice(0, 10);

/** 使用者（設定）：目前先放顯示模式切換＋原始資料匯出，是規格文件「使用者設定」頁面還沒獨立
 * 出來前的暫時落腳處，之後真正的設定頁面做出來時，這裡的內容就是要搬過去的東西 */
export default function UserSettingsPage() {
  const { world } = useOutletContext<{ world: World }>();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [showExportDialog, setShowExportDialog] = useState(false);

  const categories = useLiveQuery(() => db.categories.where({ worldId: world.id }).toArray(), [world.id]);
  const sortedCategories = [...(categories ?? [])].sort((a, b) => a.order - b.order);

  const [exportScope, setExportScope] = useState<"world" | "category" | "entry">("world");
  const [exportCategoryIds, setExportCategoryIds] = useState<Set<string>>(new Set());
  const [exportEntryIds, setExportEntryIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [showMarkdownModeDialog, setShowMarkdownModeDialog] = useState(false);

  const categoryIdList = [...exportCategoryIds];
  const exportEntries = useLiveQuery(
    () =>
      exportScope === "entry" && categoryIdList.length > 0
        ? db.entries.where("categoryId").anyOf(categoryIdList).toArray()
        : Promise.resolve<Entry[]>([]),
    [exportScope, categoryIdList.join(",")]
  );
  const entriesByCategory = new Map<string, Entry[]>();
  for (const e of exportEntries ?? []) {
    if (!entriesByCategory.has(e.categoryId)) entriesByCategory.set(e.categoryId, []);
    entriesByCategory.get(e.categoryId)!.push(e);
  }

  const handleExportJson = async () => {
    setExporting(true);
    try {
      if (exportScope === "world") {
        const bundle = await collectWorldExport(world.id);
        downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), `${world.name}-${exportDateStamp()}.json`);
      } else if (exportScope === "category") {
        if (exportCategoryIds.size === 0) return;
        const bundle = await collectCategoriesExport(world.id, [...exportCategoryIds]);
        const name =
          bundle.categories.length === 1
            ? categoryDisplayName(bundle.categories[0], t)
            : t("userSettings.categoryCount", { count: bundle.categories.length });
        downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), `${name}-${exportDateStamp()}.json`);
      } else {
        if (exportEntryIds.size === 0) return;
        const bundle = await collectEntriesExport([...exportEntryIds]);
        const name = bundle.entries.length === 1 ? bundle.entries[0].name : t("userSettings.entryCount", { count: bundle.entries.length });
        downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), `${name}-${exportDateStamp()}.json`);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportMarkdown = async (mode: "zip" | "combined") => {
    setShowMarkdownModeDialog(false);
    setExporting(true);
    try {
      let entries: Entry[];
      let folders: EntryFolder[];
      let baseName: string;
      let extraEntryNames: Record<string, string> | undefined;
      if (exportScope === "world") {
        const bundle = await collectWorldExport(world.id);
        entries = bundle.entries;
        folders = bundle.folders;
        baseName = world.name;
      } else if (exportScope === "category") {
        if (exportCategoryIds.size === 0) return;
        const bundle = await collectCategoriesExport(world.id, [...exportCategoryIds]);
        entries = bundle.entries;
        folders = bundle.folders;
        baseName =
          bundle.categories.length === 1
            ? categoryDisplayName(bundle.categories[0], t)
            : t("userSettings.categoryCount", { count: bundle.categories.length });
      } else {
        if (exportEntryIds.size === 0) return;
        const bundle = await collectEntriesExport([...exportEntryIds]);
        entries = bundle.entries;
        folders = [];
        baseName = bundle.entries.length === 1 ? bundle.entries[0].name : t("userSettings.entryCount", { count: bundle.entries.length });
        extraEntryNames = bundle.linkedEntryNames;
      }
      if (entries.length === 0) return;
      const calendars = (await db.calendars.toArray()).filter((c) => c.scope === "global" || c.worldId === world.id);
      const ctx = buildMarkdownContext(entries, folders, calendars);
      if (extraEntryNames) for (const [id, name] of Object.entries(extraEntryNames)) ctx.entryNameById.set(id, name);

      if (entries.length === 1 || mode === "combined") {
        const md = entriesToCombinedMarkdown(entries, ctx, t);
        downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${baseName}-${exportDateStamp()}.md`);
      } else {
        const zipBlob = await entriesToMarkdownZip(entries, ctx, t);
        downloadBlob(zipBlob, `${baseName}-${exportDateStamp()}.zip`);
      }
    } finally {
      setExporting(false);
    }
  };

  const disableExport =
    exporting || (exportScope === "category" && exportCategoryIds.size === 0) || (exportScope === "entry" && exportEntryIds.size === 0);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t("userSettings.heading")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 560 }}>
        <CurrentUserSection />

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("accountSettings.displayMode")}</h3>
          <button className="btn" onClick={toggleTheme}>
            {theme === "dark" ? t("accountSettings.darkMode") : t("accountSettings.lightMode")}
          </button>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("accountSettings.language")}</h3>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("userSettings.exportData")}</h3>
          <button className="btn" onClick={() => setShowExportDialog(true)}>
            {t("userSettings.exportData")}
          </button>
        </div>
      </div>

      {showExportDialog && (
        <Modal title={t("userSettings.exportData")} onClose={() => setShowExportDialog(false)} width={520}>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
            {t("userSettings.exportDialogIntro")}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("userSettings.scopeLabel")}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={exportScope === "world" ? "btn btn-primary" : "btn"} onClick={() => setExportScope("world")}>
                {t("userSettings.scopeWorld")}
              </button>
              <button className={exportScope === "category" ? "btn btn-primary" : "btn"} onClick={() => setExportScope("category")}>
                {t("userSettings.scopeCategory")}
              </button>
              <button className={exportScope === "entry" ? "btn btn-primary" : "btn"} onClick={() => setExportScope("entry")}>
                {t("userSettings.scopeEntry")}
              </button>
            </div>
          </div>

          {exportScope !== "world" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("userSettings.categoriesLabel")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                {sortedCategories.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={exportCategoryIds.has(c.id)}
                      onChange={() => {
                        setExportCategoryIds((prev) => toggleInSet(prev, c.id));
                        setExportEntryIds(new Set());
                      }}
                    />
                    {categoryDisplayName(c, t)}
                  </label>
                ))}
                {sortedCategories.length === 0 && <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("userSettings.noCategories")}</span>}
              </div>
            </div>
          )}

          {exportScope === "entry" && exportCategoryIds.size > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("userSettings.entriesLabel")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                {sortedCategories
                  .filter((c) => exportCategoryIds.has(c.id))
                  .map((c) => (
                    <div key={c.id}>
                      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 2 }}>{categoryDisplayName(c, t)}</div>
                      {(entriesByCategory.get(c.id) ?? []).map((e) => (
                        <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingLeft: 8 }}>
                          <input
                            type="checkbox"
                            checked={exportEntryIds.has(e.id)}
                            onChange={() => setExportEntryIds((prev) => toggleInSet(prev, e.id))}
                          />
                          {e.name}
                        </label>
                      ))}
                      {(entriesByCategory.get(c.id) ?? []).length === 0 && (
                        <span style={{ fontSize: 12, color: "var(--text-faint)", paddingLeft: 8 }}>{t("userSettings.noEntriesInCategory")}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          <button className="btn" disabled={disableExport} onClick={handleExportJson} style={{ marginRight: 8 }}>
            {t("userSettings.downloadJson")}
          </button>

          <button className="btn" disabled={disableExport} onClick={() => setShowMarkdownModeDialog(true)}>
            {t("userSettings.downloadMarkdown")}
          </button>
        </Modal>
      )}

      {showMarkdownModeDialog && (
        <Modal title={t("userSettings.markdownModeTitle")} onClose={() => setShowMarkdownModeDialog(false)} width={420}>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{t("userSettings.markdownModeIntro")}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn" onClick={() => handleExportMarkdown("zip")}>
              {t("userSettings.markdownModePerEntry")}
            </button>
            <button className="btn" onClick={() => handleExportMarkdown("combined")}>
              {t("userSettings.markdownModeCombined")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
