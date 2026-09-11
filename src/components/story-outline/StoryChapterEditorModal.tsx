import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Modal from "../common/Modal";
import { useConfirm } from "../common/ConfirmProvider";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import FieldsList from "../entry-editor/FieldsList";
import AddFieldMenu from "../entry-editor/AddFieldMenu";
import AddFieldDialog from "../entry-editor/AddFieldDialog";
import { buildInitialValues } from "../../data/fieldDefaults";
import { newId } from "../../data/db";
import { countWords } from "../../data/richTextText";
import { countChapterDeletionImpact, deleteChapterCascade } from "../../data/repositories/storyChapter";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import type { FieldDef, FieldValue, StoryChapter } from "../../data/types";
import { useLanguage } from "../../i18n";

interface ChapterDraft {
  name: string;
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  bodyWordCount: number;
}

function draftFromChapter(chapter: StoryChapter): ChapterDraft {
  return {
    name: chapter.name,
    fields: chapter.fields,
    values: chapter.values,
    bodyWordCount: chapter.bodyWordCount,
  };
}

/** 找出 instanceId 該群組區塊最後一個欄位之後的插入位置；找不到則插到最後——
 * 比照 EntryPage.tsx／TimelineEventEditorModal.tsx 的同名函式，這裡的欄位陣列跟 Entry 一樣是 FieldDef[]，邏輯完全一樣 */
function insertAfterGroupIndex(fields: FieldDef[], instanceId: string): number {
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].groupInstanceId === instanceId) return i + 1;
  }
  return fields.length;
}

function ToolbarButton({ label, title, isActive, onClick }: { label: string; title: string; isActive?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn-ghost"
      title={title}
      onClick={onClick}
      style={{ padding: "2px 6px", fontSize: 12, background: isActive ? "var(--bg-hover)" : undefined, fontWeight: isActive ? 700 : 400 }}
    >
      {label}
    </button>
  );
}

/** 篇章編輯彈窗：名稱（固定頂層欄位）＋自訂欄位（跟資訊卡一樣的 FieldsList／AddFieldMenu／
 * AddFieldDialog 通用欄位系統，比照 TimelineEventEditorModal.tsx 的既有用法——群組/模組選單只列
 * restrictedCategoryIds 為空的，因為篇章不是分類，套用「限定特定分類」語意上不合）＋正文
 * （TipTap，直接顯示不用另外開啟）。開啟即編輯、關閉前 dirty-check，操作按鈕固定在彈窗最上方。 */
export default function StoryChapterEditorModal({
  chapter,
  worldId,
  onClose,
  onSave,
}: {
  chapter: StoryChapter;
  worldId: string;
  onClose: () => void;
  onSave: (patch: Partial<Pick<StoryChapter, "name" | "fields" | "values" | "hasBody" | "body" | "bodyWordCount">>) => void;
}) {
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ChapterDraft>(() => draftFromChapter(chapter));
  const [showAddField, setShowAddField] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [addFieldGroupTarget, setAddFieldGroupTarget] = useState<{ instanceId: string; label: string; insertAfterInstanceId?: string } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromChapter(chapter));

  const editor = useEditor({
    extensions: [StarterKit, Highlight.configure({ multicolor: true })],
    content: chapter.body ?? "",
    onUpdate: ({ editor }) => setDraft((d) => ({ ...d, bodyWordCount: countWords(editor.getJSON()) })),
  });

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: t("timelineEventEditorModal.discardConfirm.title"),
        message: t("storyChapterEditorModal.discardConfirm.message"),
        confirmLabel: t("timelineEventEditorModal.discardConfirm.confirmLabel"),
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = () => {
    // 有沒有正文由編輯器本身是否為空判斷，不用另外一個開關讓使用者手動勾——內容都直接顯示、直接打字即可
    const hasBody = !!editor && !editor.isEmpty;
    onSave({
      name: draft.name.trim() || t("storyChapterTree.unnamedChapterDefault"),
      fields: draft.fields,
      values: draft.values,
      hasBody,
      body: hasBody ? editor?.getJSON() : undefined,
      bodyWordCount: hasBody ? draft.bodyWordCount : 0,
    });
    onClose();
  };
  // Ctrl/Cmd+S：對話框開著時直接存檔並關閉，行為等同按下方的「儲存」按鈕
  useSaveShortcut(handleSave, true);

  const handleDelete = async () => {
    const impact = await countChapterDeletionImpact(chapter.outlineId, chapter.id);
    const ok = await confirm({
      title: t("storyChapterTree.deleteConfirm.title"),
      message:
        impact > 1
          ? t("storyChapterTree.deleteConfirm.messageWithChildren", { name: chapter.name, count: impact - 1 })
          : t("storyChapterTree.deleteConfirm.message", { name: chapter.name }),
    });
    if (!ok) return;
    await deleteChapterCascade(chapter.outlineId, chapter.id);
    onClose();
  };

  const addFields = (fields: FieldDef[]) => {
    setDraft((prev) => {
      const tagged = addFieldGroupTarget
        ? fields.map((f) => ({ ...f, groupInstanceId: addFieldGroupTarget.instanceId, groupLabel: addFieldGroupTarget.label }))
        : fields;
      const afterInstanceId = addFieldGroupTarget?.insertAfterInstanceId;
      const insertAt = afterInstanceId ? insertAfterGroupIndex(prev.fields, afterInstanceId) : prev.fields.length;
      return {
        ...prev,
        fields: [...prev.fields.slice(0, insertAt), ...tagged, ...prev.fields.slice(insertAt)],
        values: buildInitialValues(tagged, prev.values),
      };
    });
    setShowAddField(false);
    setAddFieldGroupTarget(null);
  };

  const headerActions = (
    <>
      <button className="btn" onClick={() => setShowHistory(true)}>
        {t("common.versionHistory")}
      </button>
      <button className="btn btn-danger" onClick={handleDelete}>
        {t("common.delete")}
      </button>
      <button className="btn" onClick={requestClose}>
        {t("common.cancel")}
      </button>
      <button className="btn btn-primary" onClick={handleSave}>
        {t("common.save")}
      </button>
    </>
  );

  return (
    <Modal title={t("storyChapterEditorModal.title")} onClose={requestClose} width={680} headerActions={headerActions}>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "76vh" }}>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t("storyChapterEditorModal.chapterNameLabel")}
            <input autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </label>

          <FieldsList
            fields={draft.fields}
            values={draft.values}
            editing
            worldId={worldId}
            onChangeValue={(fieldId, value) =>
              setDraft((prev) => ({ ...prev, values: { ...prev.values, [fieldId]: { ...prev.values[fieldId], current: value } } }))
            }
            onRemoveField={(fieldId) =>
              setDraft((prev) => {
                const fields = prev.fields.filter((f) => f.id !== fieldId);
                const values = { ...prev.values };
                delete values[fieldId];
                return { ...prev, fields, values };
              })
            }
            onRelabelField={(fieldId, label) =>
              setDraft((prev) => ({ ...prev, fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, label } : f)) }))
            }
            onRelabelGroup={(groupInstanceId, label) =>
              setDraft((prev) => ({
                ...prev,
                fields: prev.fields.map((f) => (f.groupInstanceId === groupInstanceId ? { ...f, groupLabel: label } : f)),
              }))
            }
            onAddFieldToGroup={(groupInstanceId, groupLabel) => {
              setAddFieldGroupTarget({ instanceId: groupInstanceId, label: groupLabel });
              setShowAddField(true);
            }}
            onAddBlankGroupAfter={(afterInstanceId) => {
              setAddFieldGroupTarget({ instanceId: newId(), label: t("entryPage.newGroupLabel"), insertAfterInstanceId: afterInstanceId });
              setShowAddField(true);
            }}
            onReorderFields={(newFields) => setDraft((prev) => ({ ...prev, fields: newFields }))}
          />

          <AddFieldMenu
            worldId={worldId}
            categoryId=""
            onAddSingleField={() => setShowAddField(true)}
            onAddBlankGroup={() => {
              setAddFieldGroupTarget({ instanceId: newId(), label: t("entryPage.newGroupLabel") });
              setShowAddField(true);
            }}
            onAddExpanded={addFields}
          />

          <div>
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>{t("storyChapterEditorModal.bodyLabel")}</div>
            {editor && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 6 }}>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", padding: 4, borderBottom: "1px solid var(--border)" }}>
                  <ToolbarButton label="B" title={t("writingDocViewPage.toolbar.bold")} isActive={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
                  <ToolbarButton label="I" title={t("writingDocViewPage.toolbar.italic")} isActive={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
                  <ToolbarButton label="S" title={t("writingDocViewPage.toolbar.strike")} isActive={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
                  <ToolbarButton
                    label="H1"
                    title={t("writingDocViewPage.toolbar.heading1")}
                    isActive={editor.isActive("heading", { level: 1 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  />
                  <ToolbarButton
                    label="H2"
                    title={t("writingDocViewPage.toolbar.heading2")}
                    isActive={editor.isActive("heading", { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  />
                  <ToolbarButton
                    label={t("storyChapterEditorModal.bulletListLabel")}
                    title={t("writingDocViewPage.toolbar.bulletList")}
                    isActive={editor.isActive("bulletList")}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                  />
                  <ToolbarButton
                    label={t("storyChapterEditorModal.orderedListLabel")}
                    title={t("writingDocViewPage.toolbar.orderedList")}
                    isActive={editor.isActive("orderedList")}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  />
                  <ToolbarButton
                    label="❝"
                    title={t("storyChapterEditorModal.quoteTitle")}
                    isActive={editor.isActive("blockquote")}
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  />
                  <ToolbarButton
                    label="✎"
                    title={t("writingDocViewPage.toolbar.highlight")}
                    isActive={editor.isActive("highlight")}
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                  />
                  <ToolbarButton label="↺" title={t("common.undo")} onClick={() => editor.chain().focus().undo().run()} />
                  <ToolbarButton label="↻" title={t("common.redo")} onClick={() => editor.chain().focus().redo().run()} />
                </div>
                <div style={{ padding: 8, minHeight: 120, maxHeight: 260, overflowY: "auto" }} onClick={() => editor.chain().focus().run()}>
                  <EditorContent editor={editor} />
                </div>
                <div style={{ padding: "2px 8px", fontSize: 11, color: "var(--text-faint)", borderTop: "1px solid var(--border)" }}>
                  {draft.bodyWordCount} {t("writingDocCard.wordsUnit")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddField && (
        <AddFieldDialog
          worldId={worldId}
          onClose={() => {
            setShowAddField(false);
            setAddFieldGroupTarget(null);
          }}
          onSubmit={(f) => addFields([f])}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="storyChapters" entityId={chapter.id} onClose={() => setShowHistory(false)} />}
    </Modal>
  );
}
