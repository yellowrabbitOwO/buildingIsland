import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { World } from "../data/types";
import { deleteScriptDoc, getScriptDoc, saveScriptDocContent, toggleScriptDocStar, updateScriptDocMeta } from "../data/repositories/scriptDoc";
import { countWords } from "../data/richTextText";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import ColorInput from "../components/common/ColorInput";
import { ScriptLine } from "../components/script/ScriptLine";
import { ScriptAutoFormat } from "../components/script/ScriptAutoFormat";
import { SCRIPT_LINE_TYPES, SCRIPT_LINE_TYPE_LABELS } from "../components/script/scriptLineTypes";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { scriptDocToManuscript } from "../data/manuscript/manuscriptIR";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLanguage } from "../i18n";

/** 劇本工具列的一顆按鈕；isActive 決定反白狀態，onClick 通常是一段 editor.chain().focus()...run() */
function ToolbarButton({
  label,
  title,
  isActive,
  onClick,
}: {
  label: string;
  title: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn-ghost"
      title={title}
      onClick={onClick}
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        background: isActive ? "var(--bg-hover)" : "transparent",
        color: isActive ? "var(--text)" : "var(--text-muted)",
        fontWeight: isActive ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

const TOOLBAR_DIVIDER = <span style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />;

/** 編輯模式才顯示的劇本工具列：粗體/斜體/底線、手動指定這一行的類型（自動分類器猜錯時用來覆寫）、
 * 復原/取消復原——劇本沒有字級/文字顏色/螢光筆/表格/圖片這些一般寫作才有的功能 */
function ScriptToolbar({ editor }: { editor: Editor }) {
  const { t } = useLanguage();
  const currentLineType = (editor.getAttributes("scriptLine").lineType as string | undefined) ?? "action";

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        alignItems: "center",
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderBottom: "none",
        borderRadius: "6px 6px 0 0",
        background: "var(--bg-elevated)",
      }}
    >
      <ToolbarButton label="B" title={t("writingDocViewPage.toolbar.bold")} isActive={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="I" title={t("writingDocViewPage.toolbar.italic")} isActive={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="U" title={t("writingDocViewPage.toolbar.underline")} isActive={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      {TOOLBAR_DIVIDER}
      <span title={t("scriptDocViewPage.manualLineTypeTitle")} style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {SCRIPT_LINE_TYPES.map((type) => (
          <ToolbarButton
            key={type}
            label={t(SCRIPT_LINE_TYPE_LABELS[type])}
            title={t("scriptDocViewPage.markAsLineType", { type: t(SCRIPT_LINE_TYPE_LABELS[type]) })}
            isActive={currentLineType === type}
            onClick={() => editor.chain().focus().setScriptLineType(type).run()}
          />
        ))}
      </span>
      {TOOLBAR_DIVIDER}
      <ToolbarButton label="↺" title={t("common.undo")} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton label="↻" title={t("common.redo")} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

interface MetaDraft {
  name: string;
  description?: string;
  tagColor?: string;
  targetWordCount?: number;
}

interface ScriptDocViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的文件渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  docIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：刪除文件後改關閉面板而非導覽主畫面網址 */
  embedded?: boolean;
  /** embedded 時回報目前是否有未儲存變更，供側邊面板決定切換／關閉前是否要先確認 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一劇本文件的編輯頁：仿 Fountain 格式的自動排版編輯器，打字時依內容即時判斷場景/角色/對白/
 * 動作/轉場並套用對應樣式（見 ScriptAutoFormat）。頁面骨架（編輯/閱覽模式＋手動存檔、側邊面板嵌入）
 * 比照 WritingDocViewPage，差異只在 useEditor 的 extensions 與工具列內容 */
export default function ScriptDocViewPage({
  docIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: ScriptDocViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ docId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const docId = docIdOverride ?? params.docId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel } = useSidePanel();
  const { t } = useLanguage();

  const doc = useLiveQuery(() => (docId ? getScriptDoc(docId) : undefined), [docId]);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);

  const [editing, setEditing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [metaDraft, setMetaDraft] = useState<MetaDraft | null>(null);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const [contentDirty, setContentDirty] = useState(false);

  // deps 用 [docId, !!doc] 而不只是 [docId]：doc 剛載入完成（undefined → 有值）那一刻要重新用真正的內容
  // 建立一次 editor，否則第一次掛載時 doc 還沒回來、editor 已經用空內容建好，之後不會自動補回存檔內容
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          paragraph: false,
          heading: false,
          blockquote: false,
          codeBlock: false,
          code: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          listKeymap: false,
          link: false,
          horizontalRule: false,
          strike: false,
          hardBreak: false,
        }),
        ScriptLine,
        ScriptAutoFormat,
      ],
      content: doc?.content ?? "",
      editable: false,
      onUpdate: ({ editor }) => {
        setLiveWordCount(countWords(editor.getJSON()));
        setContentDirty(true);
      },
    },
    [docId, !!doc]
  );

  useEffect(() => {
    editor?.setEditable(editing);
  }, [editing, editor]);

  // 依賴要對齊 useEditor 重建的時機（[docId, !!doc]），不能只依賴 doc 本身——跟 WritingDocViewPage.tsx
  // 同一個 bug：doc 是 useLiveQuery 回傳的物件參照，任何欄位變動（例如編輯中途點標星號，只改了
  // starred）都會產生新的 doc 參照，若依賴 doc 就會把使用者正在編輯、還沒存檔的即時字數打回舊字數
  useEffect(() => {
    if (doc) setLiveWordCount(doc.wordCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, !!doc]);

  const hasMetaChanges =
    editing &&
    metaDraft !== null &&
    doc != null &&
    JSON.stringify(metaDraft) !==
      JSON.stringify({ name: doc.name, description: doc.description, tagColor: doc.tagColor, targetWordCount: doc.targetWordCount });
  const hasUnsavedChanges = editing && (contentDirty || hasMetaChanges);

  // embedded（側邊面板）時不攔截導覽：面板不掛在 <Outlet> 下，主畫面換頁不會讓它卸載，草稿還在，
  // 攔住主畫面完全無關的導覽反而是誤觸發；未儲存變更改由 onDirtyChange 回報給側邊面板自己處理
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !embedded && hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const ok = await confirm({
        title: t("entryPage.leaveConfirm.title"),
        message: t("entryPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  // handleSave 要等下面的 null 檢查過了才能定義（裡面要用到窄化過型別的 doc／editor），但 hook
  // 呼叫本身不能被那個檢查擋住（否則 doc 從 undefined 變有值時，hook 呼叫次數會在兩次 render
  // 之間不一致）——所以用一個 ref 轉一手：這裡先無條件掛上 shortcut，實際要跑的函式晚點再指定
  const handleSaveRef = useRef<() => void>(() => {});
  useSaveShortcut(() => handleSaveRef.current(), editing);

  if (!doc || !editor || !worldId) return null;

  const startEdit = () => {
    setMetaDraft({ name: doc.name, description: doc.description, tagColor: doc.tagColor, targetWordCount: doc.targetWordCount });
    setEditing(true);
  };
  const cancelEdit = () => {
    editor.commands.setContent(doc.content ?? "");
    setLiveWordCount(doc.wordCount);
    setContentDirty(false);
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSave = async () => {
    if (!metaDraft) return;
    const json = editor.getJSON();
    const wordCount = countWords(json);
    await updateScriptDocMeta(doc.id, metaDraft);
    await saveScriptDocContent(doc.id, json, wordCount);
    setContentDirty(false);
    setMetaDraft(null);
    setEditing(false);
  };
  handleSaveRef.current = handleSave;
  const handleDelete = async () => {
    const ok = await confirm({
      title: t("writingDocCard.deleteConfirm.title"),
      message: t("writingDocCard.deleteConfirm.message", { name: doc.name }),
    });
    if (!ok) return;
    await deleteScriptDoc(doc.id);
    if (embedded) {
      // 文件已經刪除，就算還在編輯狀態也沒有東西好儲存了——先清掉面板的 dirty 標記，
      // 否則 closePanel() 會因為殘留的 dirty 狀態又跳出一次對不上情境的「未儲存變更」確認
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/script`);
    }
  };

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
            <h2 style={{ margin: 0 }}>{doc.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "scriptDoc", docId: doc.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleScriptDocStar(doc.id)}
            style={{ color: doc.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {doc.starred ? "★" : "☆"}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("writingDocViewPage.tagColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <input
            style={{ width: "100%" }}
            placeholder={t("mapViewPage.descriptionPlaceholder")}
            value={metaDraft?.description ?? ""}
            onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
            {t("writingDocViewPage.targetWordCountLabel")}
            <input
              type="number"
              min={0}
              style={{ width: 90 }}
              value={metaDraft?.targetWordCount ?? ""}
              onChange={(e) => {
                const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                setMetaDraft((d) => (d ? { ...d, targetWordCount: Number.isNaN(v) ? undefined : v } : d));
              }}
            />
          </label>
        </div>
      ) : (
        doc.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>{doc.description}</p>
      )}
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 12 }}>
        {liveWordCount}
        {(editing ? metaDraft?.targetWordCount : doc.targetWordCount)
          ? ` / ${editing ? metaDraft?.targetWordCount : doc.targetWordCount} `
          : " "}
        {t("writingDocCard.wordsUnit")}
      </p>

      {editing && <ScriptToolbar editor={editor} />}
      <div
        className="script-editor"
        style={{
          border: "1px solid var(--border)",
          borderRadius: editing ? "0 0 6px 6px" : 6,
          padding: "20px 24px",
          minHeight: 300,
          cursor: editing ? "text" : "default",
        }}
        onClick={() => editing && editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      {showExport && (
        <ManuscriptExportDialog
          manuscript={scriptDocToManuscript(doc, currentLocalUser?.name)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="scriptDocs" entityId={doc.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
