import { useState } from "react";
import { useConfirm } from "../common/ConfirmProvider";
import StoryChapterEditorModal from "./StoryChapterEditorModal";
import FieldsList from "../entry-editor/FieldsList";
import {
  createChapter,
  countChapterDeletionImpact,
  deleteChapterCascade,
  indentChapter,
  moveChapterDown,
  moveChapterUp,
  outdentChapter,
  updateChapter,
} from "../../data/repositories/storyChapter";
import type { StoryChapter, StoryOutline } from "../../data/types";
import { useLanguage } from "../../i18n";

interface StoryChapterTreeProps {
  outline: StoryOutline;
  worldId: string;
  chapters: StoryChapter[];
}

/** 篇章樹：依 parentChapterId 分組、依 order 排序遞迴渲染，可無限往下細分。排序/階層調整改用按鈕
 * （上移/下移/縮排/提升），不做跨層級拖曳——比照 App 目前「同層排序用拖曳、跨層結構用按鈕」的既有
 * 效果級距，避免這個功能第一版就要處理複雜的跨層拖放邏輯。每列直接顯示已填寫的欄位內容跟正文字數
 * （比照 StoryboardCardChip 把卡片已填內容整個攤開顯示、不用點開才看得到的既有做法）——欄位本身是
 * 通用的 FieldDef/FieldValue，唯讀展示直接重用 FieldsList 的 editing={false} 模式（比照
 * WorldHomePage.tsx 顯示星號條目欄位摘要的既有用法），entryLink 型別欄位會自己查詢連結資訊卡的
 * 名稱，不需要外部再傳一份 id→名稱查表 */
export default function StoryChapterTree({ outline, worldId, chapters }: StoryChapterTreeProps) {
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);

  const childrenOf = (parentId: string | undefined) => chapters.filter((c) => c.parentChapterId === parentId).sort((a, b) => a.order - b.order);

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (chapter: StoryChapter) => {
    const impact = await countChapterDeletionImpact(outline.id, chapter.id);
    const ok = await confirm({
      title: t("storyChapterTree.deleteConfirm.title"),
      message:
        impact > 1
          ? t("storyChapterTree.deleteConfirm.messageWithChildren", { name: chapter.name, count: impact - 1 })
          : t("storyChapterTree.deleteConfirm.message", { name: chapter.name }),
    });
    if (!ok) return;
    await deleteChapterCascade(outline.id, chapter.id);
  };

  const renderNode = (chapter: StoryChapter, depth: number, index: number, siblingCount: number) => {
    const children = childrenOf(chapter.id);
    const collapsed = collapsedIds.has(chapter.id);
    const indent = depth * 20 + 4;

    return (
      <div key={chapter.id}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px 4px", paddingLeft: indent }}>
          {children.length > 0 ? (
            <button className="btn-ghost" style={{ padding: "0 4px" }} onClick={() => toggleCollapsed(chapter.id)}>
              {collapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span style={{ width: 22, flexShrink: 0 }} />
          )}
          <button
            className="btn-ghost"
            style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "2px 6px", overflow: "hidden" }}
            onClick={() => setEditingChapterId(chapter.id)}
          >
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chapter.name}</span>
          </button>
          <button className="btn-ghost" title={t("storyChapterTree.moveUpTitle")} disabled={index === 0} onClick={() => moveChapterUp(chapter.id)}>
            ▲
          </button>
          <button className="btn-ghost" title={t("storyChapterTree.moveDownTitle")} disabled={index >= siblingCount - 1} onClick={() => moveChapterDown(chapter.id)}>
            ▼
          </button>
          <button className="btn-ghost" title={t("storyChapterTree.outdentTitle")} disabled={!chapter.parentChapterId} onClick={() => outdentChapter(chapter.id)}>
            ⇤
          </button>
          <button className="btn-ghost" title={t("storyChapterTree.indentTitle")} disabled={index === 0} onClick={() => indentChapter(chapter.id)}>
            ⇥
          </button>
          <button className="btn-ghost" title={t("storyChapterTree.addChildTitle")} onClick={() => createChapter(outline.id, worldId, chapter.id, t("storyChapterTree.unnamedChapterDefault"))}>
            ＋
          </button>
          <button className="btn-ghost" title={t("common.delete")} onClick={() => handleDelete(chapter)}>
            🗑
          </button>
        </div>
        {chapter.fields.length > 0 && (
          <div style={{ paddingLeft: indent + 26, paddingRight: 8, paddingBottom: 4, fontSize: 12 }} onClick={() => setEditingChapterId(chapter.id)}>
            <FieldsList fields={chapter.fields} values={chapter.values} editing={false} worldId={worldId} />
          </div>
        )}
        {chapter.hasBody && (
          <p style={{ margin: 0, paddingLeft: indent + 26, paddingBottom: 6, fontSize: 11, color: "var(--text-faint)" }}>
            📄 {t("storyChapterTree.bodyWordCount", { count: chapter.bodyWordCount })}
          </p>
        )}
        {!collapsed && children.map((child, i) => renderNode(child, depth + 1, i, children.length))}
      </div>
    );
  };

  const topLevel = childrenOf(undefined);
  const editingChapter = editingChapterId ? chapters.find((c) => c.id === editingChapterId) : undefined;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn" onClick={() => createChapter(outline.id, worldId, undefined, t("storyChapterTree.unnamedChapterDefault"))}>
          {t("storyChapterTree.addChapterButton")}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {topLevel.map((c, i) => renderNode(c, 0, i, topLevel.length))}
        {topLevel.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("storyChapterTree.emptyState")}</p>}
      </div>
      {editingChapter && (
        <StoryChapterEditorModal
          chapter={editingChapter}
          worldId={worldId}
          onClose={() => setEditingChapterId(null)}
          onSave={(patch) => updateChapter(editingChapter.id, patch)}
        />
      )}
    </div>
  );
}
