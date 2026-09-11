import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { deleteStoryOutline, getStoryOutline, toggleStoryOutlineStar, updateStoryOutlineMeta } from "../data/repositories/storyOutline";
import { listChapters } from "../data/repositories/storyChapter";
import { listStoryChapterTemplates } from "../data/repositories/storyChapterTemplate";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import ColorInput from "../components/common/ColorInput";
import StoryChapterTree from "../components/story-outline/StoryChapterTree";
import type { MarkdownExportContext } from "../data/exportMarkdown";
import { storyChapterToManuscript } from "../data/manuscript/storyChapterToManuscript";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { useLanguage } from "../i18n";

interface MetaDraft {
  name: string;
  description?: string;
  tagColor?: string;
  chapterTemplateId?: string;
}

interface StoryOutlineViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的大綱渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  outlineIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：刪除大綱後改關閉面板而非導覽主畫面網址 */
  embedded?: boolean;
  /** embedded 時回報標題/簡述草稿是否有未儲存變更；篇章樹的增刪改排序都是即時寫入，不算「未存」 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 章節大綱本體：頂部標題/簡述/標題色/套用的章節範本（編輯/取消/儲存草稿模式，跟其他頁面一致）＋
 * 唯讀顯示所選曆法，下方是可無限細分的篇章樹（StoryChapterTree，增刪改排序都即時寫入 Dexie，
 * 不走草稿模式，比照 NarrativeGraphViewPage／RelationGraphViewPage 畫布本身的做法） */
export default function StoryOutlineViewPage({
  outlineIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: StoryOutlineViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ outlineId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const outlineId = outlineIdOverride ?? params.outlineId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel } = useSidePanel();
  const { t } = useLanguage();

  const outline = useLiveQuery(() => (outlineId ? getStoryOutline(outlineId) : undefined), [outlineId]);
  const calendar = useLiveQuery(() => (outline?.calendarId ? db.calendars.get(outline.calendarId) : undefined), [outline?.calendarId]);
  const chapters = useLiveQuery(() => (outlineId ? listChapters(outlineId) : []), [outlineId]);
  const chapterTemplates = useLiveQuery(() => (worldId ? listStoryChapterTemplates(worldId) : []), [worldId]);

  const [editing, setEditing] = useState(false);
  const [metaDraft, setMetaDraft] = useState<MetaDraft | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const worldEntriesForExport = useLiveQuery(() => (worldId ? db.entries.where({ worldId }).toArray() : []), [worldId]);
  const worldCalendarsForExport = useLiveQuery(
    () => db.calendars.filter((c) => c.scope === "global" || c.worldId === worldId).toArray(),
    [worldId]
  );
  const exportCtx: MarkdownExportContext = useMemo(
    () => ({
      entryNameById: new Map((worldEntriesForExport ?? []).map((e) => [e.id, e.name])),
      calendarById: new Map((worldCalendarsForExport ?? []).map((c) => [c.id, c])),
    }),
    [worldEntriesForExport, worldCalendarsForExport]
  );

  const metaSnapshot = (o: { name: string; description?: string; tagColor?: string; chapterTemplateId?: string }): MetaDraft => ({
    name: o.name,
    description: o.description,
    tagColor: o.tagColor,
    chapterTemplateId: o.chapterTemplateId,
  });

  const hasMetaChanges =
    editing && metaDraft !== null && outline != null && JSON.stringify(metaDraft) !== JSON.stringify(metaSnapshot(outline));

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !embedded && hasMetaChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const ok = await confirm({
        title: t("entryPage.leaveConfirm.title"),
        message: t("timelineViewPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  useEffect(() => {
    onDirtyChange?.(hasMetaChanges);
  }, [hasMetaChanges, onDirtyChange]);

  // handleSaveMeta 要等下面的 null 檢查過了才能定義（裡面要用到窄化過型別的 outline），但 hook
  // 呼叫本身不能被那個檢查擋住（否則 outline 從 undefined 變有值時，hook 呼叫次數會在兩次 render
  // 之間不一致）——所以用一個 ref 轉一手：這裡先無條件掛上 shortcut，實際要跑的函式晚點再指定
  const handleSaveMetaRef = useRef<() => void>(() => {});
  useSaveShortcut(() => handleSaveMetaRef.current(), editing);

  if (!outline || !chapters || !worldId) return null;

  const startEdit = () => {
    setMetaDraft(metaSnapshot(outline));
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSaveMeta = async () => {
    if (!metaDraft) return;
    await updateStoryOutlineMeta(outline.id, metaDraft);
    setMetaDraft(null);
    setEditing(false);
  };
  handleSaveMetaRef.current = handleSaveMeta;
  const handleDelete = async () => {
    const ok = await confirm({
      title: t("storyOutlineListCard.deleteConfirm.title"),
      message: t("storyOutlineListCard.deleteConfirm.message", { name: outline.name }),
    });
    if (!ok) return;
    await deleteStoryOutline(outline.id);
    if (embedded) {
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/outline`);
    }
  };

  const appliedTemplateName = chapterTemplates?.find((tpl) => tpl.id === outline.chapterTemplateId)?.name;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {editing ? (
            <input
              autoFocus
              style={{ fontSize: 20, fontFamily: "var(--font-serif)", width: "100%" }}
              value={metaDraft?.name ?? ""}
              onChange={(e) => setMetaDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          ) : (
            <h2 style={{ margin: 0 }}>{outline.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "storyOutline", outlineId: outline.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleStoryOutlineStar(outline.id)}
            style={{ color: outline.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {outline.starred ? "★" : "☆"}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("storyOutlineViewPage.tagColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSaveMeta}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setShowExport(true)}>
                {t("writingDocViewPage.exportManuscriptButton")}
              </button>
              <button className="btn" onClick={() => setShowHistory(true)}>
                {t("common.versionHistory")}
              </button>
              <button className="btn btn-primary" onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                {t("common.delete")}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <input
          style={{ width: "100%", marginBottom: 12 }}
          placeholder={t("mapViewPage.descriptionPlaceholder")}
          value={metaDraft?.description ?? ""}
          onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
        />
      ) : (
        outline.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>{outline.description}</p>
      )}
      {editing && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, color: "var(--text-muted)" }}>
          {t("storyOutlineViewPage.appliedTemplateLabel")}
          <select
            value={metaDraft?.chapterTemplateId ?? ""}
            onChange={(e) => setMetaDraft((d) => (d ? { ...d, chapterTemplateId: e.target.value || undefined } : d))}
          >
            <option value="">{t("newStoryOutlineDialog.noTemplateOption")}</option>
            {chapterTemplates?.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 4 }}>
        {t("storyOutlineViewPage.calendarLabel")}{calendar ? calendar.name : t("storyOutlineViewPage.calendarNotSet")}
      </p>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 16 }}>
        {t("storyOutlineViewPage.appliedTemplateSummaryLabel")}{appliedTemplateName ?? t("storyOutlineViewPage.notSetPlain")}
      </p>

      <StoryChapterTree outline={outline} worldId={worldId} chapters={chapters} />

      {showExport && (
        <ManuscriptExportDialog
          manuscript={storyChapterToManuscript(outline, chapters, exportCtx, currentLocalUser?.name, t)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="storyOutlines" entityId={outline.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
