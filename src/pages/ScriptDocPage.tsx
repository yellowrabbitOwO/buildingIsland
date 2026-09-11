import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createScriptDoc, listScriptDocs, moveScriptDocsToFolder } from "../data/repositories/scriptDoc";
import { createScriptFolder, deleteScriptFolder } from "../data/repositories/scriptFolder";
import ScriptDocCard from "../components/script/ScriptDocCard";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 劇本模式目錄：列出這個世界所有已儲存的劇本文件，可分資料夾、標星號；
 * 點擊卡片進入該份劇本的編輯頁（ScriptDocViewPage），骨架比照 WritingDocPage */
export default function ScriptDocPage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((docId, folderId) => moveScriptDocsToFolder([docId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.scriptFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const docs = useLiveQuery(() => listScriptDocs(world.id), [world.id]);

  if (!folders || !docs) return null;

  const unfiled = docs.filter((d) => !d.folderId);
  const byFolder = (fid: string) => docs.filter((d) => d.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateDoc = async (input: { name: string; description?: string; tagColor?: string }) => {
    const doc = await createScriptDoc(world.id, { ...input, folderId: activeFolderId });
    setShowNewDoc(false);
    navigate(`/world/${world.id}/script/${doc.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("writingDocPage.deleteFolderConfirm.title"),
      message: t("writingDocPage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteScriptFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("scriptDocPage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("mapPage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewDoc(true);
            }}
          >
            {t("scriptDocPage.addDoc")}
          </button>
        </div>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("scriptDocPage.description")}
      </p>

      {folders.length > 0 && (
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
                  <button
                    className="btn-ghost"
                    style={{ marginLeft: "auto" }}
                    onClick={() => {
                      setActiveFolderId(folder.id);
                      setShowNewDoc(true);
                    }}
                  >
                    {t("mapPage.addToFolder")}
                  </button>
                  <button className="btn-ghost" onClick={() => handleDeleteFolder(folder.id, folder.name)}>
                    {t("common.delete")}
                  </button>
                </div>
                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                    {items.map((doc) => (
                      <ScriptDocCard key={doc.id} doc={doc} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(doc.id)} />
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
        {unfiled.map((doc) => (
          <ScriptDocCard key={doc.id} doc={doc} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(doc.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("scriptDocPage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createScriptFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewDoc && (
        <NewFolderDialog
          worldId={world.id}
          title={t("scriptDocPage.newDocTitle")}
          nameLabel={t("common.nameLabel")}
          submitLabel={t("common.create")}
          defaultTagColor={null}
          onClose={() => setShowNewDoc(false)}
          onSubmit={handleCreateDoc}
        />
      )}
    </div>
  );
}
