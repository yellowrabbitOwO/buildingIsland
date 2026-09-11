import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createStoryOutline, listStoryOutlines, moveStoryOutlinesToFolder } from "../data/repositories/storyOutline";
import { createStoryOutlineFolder, deleteStoryOutlineFolder } from "../data/repositories/storyOutlineFolder";
import { listCalendars } from "../data/repositories/calendar";
import { listStoryChapterTemplates } from "../data/repositories/storyChapterTemplate";
import StoryOutlineListCard from "../components/story-outline/StoryOutlineListCard";
import NewStoryOutlineDialog from "../components/story-outline/NewStoryOutlineDialog";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 章節大綱目錄：列出這個世界所有已儲存的章節大綱，可分資料夾、標星號；
 * 點擊卡片進入該份大綱的編輯頁（StoryOutlineViewPage） */
export default function StoryOutlinePage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((outlineId, folderId) => moveStoryOutlinesToFolder([outlineId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewOutline, setShowNewOutline] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.storyOutlineFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const outlines = useLiveQuery(() => listStoryOutlines(world.id), [world.id]);
  const calendars = useLiveQuery(() => listCalendars(world.id), [world.id]);
  const chapterTemplates = useLiveQuery(() => listStoryChapterTemplates(world.id), [world.id]);

  if (!folders || !outlines || !calendars || !chapterTemplates) return null;

  const unfiled = outlines.filter((o) => !o.folderId);
  const byFolder = (fid: string) => outlines.filter((o) => o.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateOutline = async (input: {
    name: string;
    description?: string;
    tagColor?: string;
    calendarId?: string;
    chapterTemplateId?: string;
  }) => {
    const outline = await createStoryOutline(world.id, { ...input, folderId: activeFolderId });
    setShowNewOutline(false);
    navigate(`/world/${world.id}/outline/${outline.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("storyOutlinePage.deleteFolderConfirm.title"),
      message: t("storyOutlinePage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteStoryOutlineFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("storyOutlinePage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("mapPage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewOutline(true);
            }}
          >
            {t("storyOutlinePage.addOutline")}
          </button>
        </div>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("storyOutlinePage.description")}
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
                      setShowNewOutline(true);
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
                    {items.map((outline) => (
                      <StoryOutlineListCard
                        key={outline.id}
                        outline={outline}
                        worldId={world.id}
                        folders={folders}
                        dragProps={dragMove.itemDragProps(outline.id)}
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
        {unfiled.map((outline) => (
          <StoryOutlineListCard key={outline.id} outline={outline} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(outline.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("storyOutlinePage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createStoryOutlineFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewOutline && (
        <NewStoryOutlineDialog
          worldId={world.id}
          calendars={calendars}
          chapterTemplates={chapterTemplates}
          onClose={() => setShowNewOutline(false)}
          onSubmit={handleCreateOutline}
        />
      )}
    </div>
  );
}
