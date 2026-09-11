import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createTimeline, listTimelines, moveTimelinesToFolder } from "../data/repositories/timeline";
import { createTimelineFolder, deleteTimelineFolder } from "../data/repositories/timelineFolder";
import { listCalendars } from "../data/repositories/calendar";
import TimelineListCard from "../components/timeline/TimelineListCard";
import NewTimelineDialog from "../components/timeline/NewTimelineDialog";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 時間線目錄：列出這個世界所有已儲存的時間線，可分資料夾、標星號；
 * 點擊卡片進入該條時間線的畫布頁（TimelineViewPage），骨架比照 ScriptDocPage／StoryboardPage */
export default function TimelinePage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((timelineId, folderId) => moveTimelinesToFolder([timelineId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewTimeline, setShowNewTimeline] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.timelineFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const timelines = useLiveQuery(() => listTimelines(world.id), [world.id]);
  const calendars = useLiveQuery(() => listCalendars(world.id), [world.id]);

  if (!folders || !timelines || !calendars) return null;

  const unfiled = timelines.filter((t) => !t.folderId);
  const byFolder = (fid: string) => timelines.filter((t) => t.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateTimeline = async (input: { name: string; description?: string; tagColor?: string; calendarId: string }) => {
    const timeline = await createTimeline(world.id, { ...input, folderId: activeFolderId }, t);
    setShowNewTimeline(false);
    navigate(`/world/${world.id}/timeline/${timeline.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("timelinePage.deleteFolderConfirm.title"),
      message: t("timelinePage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteTimelineFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("timelinePage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("timelinePage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            disabled={calendars.length === 0}
            title={calendars.length === 0 ? t("timelinePage.noCalendarHint") : undefined}
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewTimeline(true);
            }}
          >
            {t("timelinePage.addTimeline")}
          </button>
        </div>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("timelinePage.description")}
      </p>
      {calendars.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
          {t("timelinePage.noCalendarsMessage")}
        </p>
      )}

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
                    disabled={calendars.length === 0}
                    onClick={() => {
                      setActiveFolderId(folder.id);
                      setShowNewTimeline(true);
                    }}
                  >
                    {t("timelinePage.addToFolder")}
                  </button>
                  <button className="btn-ghost" onClick={() => handleDeleteFolder(folder.id, folder.name)}>
                    {t("common.delete")}
                  </button>
                </div>
                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                    {items.map((timeline) => (
                      <TimelineListCard
                        key={timeline.id}
                        timeline={timeline}
                        worldId={world.id}
                        folders={folders}
                        dragProps={dragMove.itemDragProps(timeline.id)}
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
        {unfiled.map((timeline) => (
          <TimelineListCard key={timeline.id} timeline={timeline} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(timeline.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("timelinePage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createTimelineFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewTimeline && (
        <NewTimelineDialog
          worldId={world.id}
          calendars={calendars}
          onClose={() => setShowNewTimeline(false)}
          onSubmit={handleCreateTimeline}
        />
      )}
    </div>
  );
}
