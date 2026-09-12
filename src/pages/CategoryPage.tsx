import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { createEntry, deleteEntries, duplicateEntries, moveEntriesToFolder } from "../data/repositories/entry";
import { createFolder, deleteFolder } from "../data/repositories/folder";
import { deleteCategory } from "../data/repositories/category";
import EntryCard from "../components/entries/EntryCard";
import NewEntryDialog from "../components/entries/NewEntryDialog";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import BulkActionBar from "../components/common/BulkActionBar";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLanguage, categoryDisplayName } from "../i18n";
import { useDragToFolder } from "../data/reorder";
import { isReadOnlyDemo } from "../demoMode";
import type { Template } from "../data/types";

type SortMode = "name" | "updatedAt";

interface CategoryPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的分類渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數） */
  categoryIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：條目卡片點擊、新增條目後跳轉、刪除分類後跳轉都改成切換面板本身的內容，不導覽主畫面的網址 */
  embedded?: boolean;
}

export default function CategoryPage({ categoryIdOverride, worldIdOverride, embedded = false }: CategoryPageProps = {}) {
  const params = useParams<{ worldId: string; categoryId: string }>();
  const worldId = worldIdOverride ?? params.worldId;
  const categoryId = categoryIdOverride ?? params.categoryId;
  const navigate = useNavigate();
  const { openPanel, closePanel } = useSidePanel();
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((entryId, folderId) => moveEntriesToFolder([entryId], folderId));

  const world = useLiveQuery(() => (worldId ? db.worlds.get(worldId) : undefined), [worldId]);
  const category = useLiveQuery(() => (categoryId ? db.categories.get(categoryId) : undefined), [categoryId]);
  const folders = useLiveQuery(
    () => (worldId && categoryId ? db.folders.where({ worldId, categoryId }).toArray() : []),
    [worldId, categoryId]
  );
  const entries = useLiveQuery(
    () => (worldId && categoryId ? db.entries.where({ worldId, categoryId }).toArray() : []),
    [worldId, categoryId]
  );

  const sorted = useMemo(() => {
    if (!entries) return [];
    const copy = [...entries];
    copy.sort((a, b) =>
      sortMode === "name" ? a.name.localeCompare(b.name, "zh-Hant") : b.updatedAt.localeCompare(a.updatedAt)
    );
    return copy;
  }, [entries, sortMode]);

  if (!worldId || !categoryId || !category) return null;

  const unfiled = sorted.filter((e) => !e.folderId);
  const byFolder = (fid: string) => sorted.filter((e) => e.folderId === fid);
  const allIds = sorted.map((e) => e.id);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateEntry = async (input: { name: string; templateId?: string; folderId?: string }) => {
    let template: Template | undefined;
    if (input.templateId) {
      const tpl = (await db.templates.get(input.templateId)) ?? undefined;
      template = tpl;
    }
    const entry = await createEntry(worldId, categoryId, input.name, template, input.folderId);
    setShowNewEntry(false);
    if (embedded) openPanel({ kind: "entry", entryId: entry.id });
    else navigate(`/world/${worldId}/entry/${entry.id}?edit=1`);
  };

  const handleDeleteCategory = async () => {
    const ok = await confirm({
      title: t("categoryPage.deleteCategory"),
      message: t("categoryPage.deleteCategoryConfirm.message", { name: category.name }),
    });
    if (!ok) return;
    await deleteCategory(category.id);
    if (embedded) closePanel();
    else navigate(`/world/${worldId}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const items = byFolder(folderId);
    const itemsNote =
      items.length > 0 ? t("categoryPage.deleteFolderConfirm.itemsNote", { items: items.map((e) => e.name).join("、") }) : "";
    const ok = await confirm({
      title: t("categoryPage.deleteFolderConfirm.title"),
      message: t("categoryPage.deleteFolderConfirm.message", { name: folderName, itemsNote }),
    });
    if (!ok) return;
    await deleteFolder(folderId);
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: t("categoryPage.bulkDeleteConfirm.title"),
      message: t("categoryPage.bulkDeleteConfirm.message", { count: selectedIds.size }),
    });
    if (!ok) return;
    await deleteEntries([...selectedIds]);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async (folderId: string | undefined) => {
    await moveEntriesToFolder([...selectedIds], folderId);
    setSelectedIds(new Set());
  };

  const handleBulkDuplicate = async () => {
    await duplicateEntries([...selectedIds], t);
    setSelectedIds(new Set());
  };

  const isSampleWorld = !!world?.isSample;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2>{categoryDisplayName(category, t)}</h2>
          {category.isBuiltIn && <span className="builtin-badge">{t("categoryPage.builtInBadge")}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="name">{t("categoryPage.sortByName")}</option>
            <option value="updatedAt">{t("categoryPage.sortByUpdated")}</option>
          </select>
          {!isSampleWorld && !isReadOnlyDemo && (
            <button
              className={bulkMode ? "btn btn-primary" : "btn"}
              onClick={() => {
                setBulkMode((v) => !v);
                setSelectedIds(new Set());
              }}
            >
              {t("categoryPage.bulkMode")}
            </button>
          )}
          {!isReadOnlyDemo && (
            <>
              <button className="btn" onClick={() => setShowNewFolder(true)}>
                {t("categoryPage.addFolder")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setActiveFolderId(undefined);
                  setShowNewEntry(true);
                }}
              >
                {t("categoryPage.addEntry")}
              </button>
              <button className="btn" onClick={() => setShowHistory(true)}>
                {t("common.versionHistory")}
              </button>
            </>
          )}
          {!category.isBuiltIn && !isReadOnlyDemo && (
            <button className="btn btn-danger" onClick={handleDeleteCategory}>
              {t("categoryPage.deleteCategory")}
            </button>
          )}
        </div>
      </div>

      {bulkMode && !isSampleWorld && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={allIds.length}
          folderOptions={(folders ?? []).map((f) => ({ id: f.id, name: f.name }))}
          onMoveToFolder={handleBulkMove}
          onDuplicate={handleBulkDuplicate}
          onDelete={handleBulkDelete}
          onToggleSelectAll={() =>
            setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
          }
          onCancel={() => {
            setBulkMode(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {folders && folders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {folders.map((folder) => {
            const items = byFolder(folder.id);
            const collapsed = collapsedFolderIds.has(folder.id);
            return (
              <div key={folder.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    borderRadius: 6,
                    ...dragMove.folderHighlightStyle(folder.id),
                  }}
                  {...dragMove.folderDropProps(folder.id)}
                >
                  <button className="btn-ghost" style={{ padding: 0 }} onClick={() => toggleFolderCollapsed(folder.id)}>
                    {collapsed ? "▸" : "▾"}
                  </button>
                  <ResolvedColor value={folder.tagColor}>
                    {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
                  </ResolvedColor>
                  <strong>{folder.name}</strong>
                  <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("categoryPage.itemCount", { count: items.length })}</span>
                  {folder.description && (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>— {folder.description}</span>
                  )}
                  {!bulkMode && !isReadOnlyDemo && (
                    <>
                      <button
                        className="btn-ghost"
                        style={{ marginLeft: "auto" }}
                        onClick={() => {
                          setActiveFolderId(folder.id);
                          setShowNewEntry(true);
                        }}
                      >
                        {t("categoryPage.addToFolder")}
                      </button>
                      <button className="btn-ghost" onClick={() => handleDeleteFolder(folder.id, folder.name)}>
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                    {items.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        worldId={worldId}
                        folders={folders ?? []}
                        bulkMode={bulkMode}
                        selected={selectedIds.has(entry.id)}
                        onToggleSelect={() => toggleSelect(entry.id)}
                        embedded={embedded}
                        dragProps={dragMove.itemDragProps(entry.id, !bulkMode && !isReadOnlyDemo)}
                      />
                    ))}
                    {items.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("categoryPage.folderEmpty")}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 8, borderRadius: 6, ...dragMove.folderHighlightStyle(undefined) }}
        {...dragMove.folderDropProps(undefined)}
      >
        {unfiled.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            worldId={worldId}
            folders={folders ?? []}
            bulkMode={bulkMode}
            selected={selectedIds.has(entry.id)}
            onToggleSelect={() => toggleSelect(entry.id)}
            embedded={embedded}
            dragProps={dragMove.itemDragProps(entry.id, !bulkMode && !isReadOnlyDemo)}
          />
        ))}
        {entries && folders && unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("categoryPage.emptyState")}</p>
        )}
      </div>

      {showNewEntry && (
        <NewEntryDialog
          category={category}
          folders={folders ?? []}
          defaultFolderId={activeFolderId}
          onClose={() => setShowNewEntry(false)}
          onSubmit={handleCreateEntry}
        />
      )}
      {showNewFolder && (
        <NewFolderDialog
          worldId={worldId}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createFolder(worldId, categoryId, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="categories" entityId={category.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
