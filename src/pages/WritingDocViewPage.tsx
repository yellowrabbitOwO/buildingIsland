import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import type { World } from "../data/types";
import { deleteWritingDoc, getWritingDoc, saveWritingDocContent, toggleWritingDocStar, updateWritingDocMeta } from "../data/repositories/writingDoc";
import { countWords } from "../data/richTextText";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import ColorInput from "../components/common/ColorInput";
import DropdownMenu from "../components/common/DropdownMenu";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { writingDocToManuscript } from "../data/manuscript/manuscriptIR";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLanguage } from "../i18n";

/** 富文本工具列的一顆按鈕；isActive 決定反白狀態，onClick 通常是一段 editor.chain().focus()...run() */
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

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const HIGHLIGHT_COLORS = ["#fff3a3", "#b8f0b0", "#a9d8f5", "#f5b8d8"];

/** #rrggbb + 透明度百分比（0-100）組成 rgba() 字串，給螢光筆的自訂顏色用；
 * Highlight 套件的 color 只是原樣寫進 background-color 樣式，rgba() 字串可以直接用 */
function hexToRgba(hex: string, alphaPercent: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${(alphaPercent / 100).toFixed(2)})`;
}

/** 讀取圖片檔案並轉成 base64 data URL 插入編輯器；跟 ImageUpload.tsx 存圖的慣例一致（本機儲存、不上傳外部服務） */
function insertImageFromFile(editor: Editor, file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") editor.chain().focus().setImage({ src: reader.result }).run();
  };
  reader.readAsDataURL(file);
}

interface ToolbarDraft {
  tableRows: number;
  tableCols: number;
  highlightHex: string;
  highlightAlpha: number;
}

/** 編輯模式才顯示的富文本工具列：粗體/斜體/底線/刪除線、標題、對齊、字級、文字顏色、螢光筆、
 * 清單、引用、分隔線、表格、圖片、復原/取消復原。
 * 表格列欄數／螢光筆顏色透明度這幾個草稿值由外層 WritingDocViewPage 保管（而非這裡的 local state）——
 * 這個元件只在 editing 時掛載，切出編輯模式再切回來就會重新掛載一次，local state 會被重置成預設值，
 * 使用者剛設定好的螢光筆顏色/透明度就這樣悄悄不見；外層元件不會隨 editing 切換而重新掛載，草稿放那裡才留得住 */
function EditorToolbar({
  editor,
  draft,
  setDraft,
}: {
  editor: Editor;
  draft: ToolbarDraft;
  setDraft: (patch: Partial<ToolbarDraft>) => void;
}) {
  const { t } = useLanguage();
  const currentFontSize = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  const inTable = editor.isActive("table");
  const { tableRows, tableCols, highlightHex, highlightAlpha } = draft;
  const setTableRows = (v: number) => setDraft({ tableRows: v });
  const setTableCols = (v: number) => setDraft({ tableCols: v });
  const setHighlightHex = (v: string) => setDraft({ highlightHex: v });
  const setHighlightAlpha = (v: number) => setDraft({ highlightAlpha: v });

  const applyCustomHighlight = (hex: string, alpha: number) => {
    // scrollIntoView: false，否則拖曳滑桿時每一格都會因為 focus() 把選取範圍捲回可視區，
    // 選取的文字若剛好在畫面外（例如往上捲到工具列才調色），拖曳中的畫面會一直跳動
    editor.chain().focus(undefined, { scrollIntoView: false }).setHighlight({ color: hexToRgba(hex, alpha) }).run();
  };

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
      <ToolbarButton label="S" title={t("writingDocViewPage.toolbar.strike")} isActive={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      {TOOLBAR_DIVIDER}
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
        label="H3"
        title={t("writingDocViewPage.toolbar.heading3")}
        isActive={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      {TOOLBAR_DIVIDER}
      <select
        title={t("writingDocViewPage.toolbar.fontSize")}
        value={currentFontSize}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
        style={{ padding: "2px 4px", fontSize: 12, height: 24 }}
      >
        <option value="">{t("writingDocViewPage.toolbar.fontSize")}</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size.replace("px", "")}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={6}
        max={200}
        placeholder={t("writingDocViewPage.toolbar.customPlaceholder")}
        title={t("writingDocViewPage.toolbar.customFontSizeTitle")}
        style={{ width: 44, padding: "2px 4px", fontSize: 12, height: 24 }}
        onKeyDown={(e) => {
          // 按 Enter 不在這裡直接套用，改成 blur() 觸發下面的 onBlur 統一處理——
          // 否則這裡先套用一次、blur() 又觸發 onBlur 再套用一次，同一個操作在復原紀錄裡會變成兩筆
          if (e.key === "Enter" || e.keyCode === 13) e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const v = parseInt(e.target.value, 10);
          if (v > 0) editor.chain().focus().setFontSize(`${v}px`).run();
          e.target.value = "";
        }}
      />
      <label title={t("writingDocViewPage.toolbar.textColor")} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 2 }}>A</span>
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          style={{ width: 20, height: 20, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
        />
      </label>
      <ToolbarButton label="✕A" title={t("writingDocViewPage.toolbar.clearTextColor")} onClick={() => editor.chain().focus().unsetColor().run()} />
      {TOOLBAR_DIVIDER}
      <span title={t("writingDocViewPage.toolbar.highlight")} style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title={t("writingDocViewPage.toolbar.highlight")}
            onClick={() => {
              setHighlightHex(color);
              applyCustomHighlight(color, highlightAlpha);
            }}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: color,
              border: editor.isActive("highlight", { color: hexToRgba(color, highlightAlpha) }) ? "2px solid var(--text)" : "1px solid var(--border)",
              padding: 0,
              cursor: "pointer",
            }}
          />
        ))}
      </span>
      <label title={t("writingDocViewPage.toolbar.customHighlightColor")} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
        <input
          type="color"
          value={highlightHex}
          onChange={(e) => {
            setHighlightHex(e.target.value);
            applyCustomHighlight(e.target.value, highlightAlpha);
          }}
          style={{ width: 20, height: 20, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
        />
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={highlightAlpha}
        title={t("writingDocViewPage.toolbar.highlightOpacity", { percent: highlightAlpha })}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          setHighlightAlpha(v);
          applyCustomHighlight(highlightHex, v);
        }}
        style={{ width: 90, flexShrink: 0 }}
      />
      <DropdownMenu
        align="left"
        minWidth={160}
        renderTrigger={({ ref, onClick }) => (
          <button
            ref={ref}
            type="button"
            className="btn-ghost"
            title={t("writingDocViewPage.toolbar.setHighlightOpacity")}
            onClick={onClick}
            style={{ fontSize: 12, color: "var(--text-muted)", width: 32, flexShrink: 0, padding: "2px 0" }}
          >
            {highlightAlpha}%
          </button>
        )}
      >
        {(close) => {
          const setAlpha = (v: number) => {
            const clamped = Math.min(100, Math.max(0, v));
            setHighlightAlpha(clamped);
            applyCustomHighlight(highlightHex, clamped);
          };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 4 }}>
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={highlightAlpha}
                autoFocus
                style={{ width: "100%", padding: "4px 6px" }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.keyCode !== 13) return;
                  const v = parseInt(e.currentTarget.value, 10);
                  if (Number.isNaN(v)) return;
                  setAlpha(v);
                  close();
                }}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) setAlpha(v);
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 25, 50, 75, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={highlightAlpha === preset ? "btn btn-primary" : "btn"}
                    style={{ flex: 1, padding: "2px 0", fontSize: 12 }}
                    onClick={() => {
                      setAlpha(preset);
                      close();
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          );
        }}
      </DropdownMenu>
      <ToolbarButton label="✕" title={t("writingDocViewPage.toolbar.clearHighlight")} onClick={() => editor.chain().focus().unsetHighlight().run()} />
      {TOOLBAR_DIVIDER}
      <ToolbarButton
        label="⇤"
        title={t("writingDocViewPage.toolbar.alignLeft")}
        isActive={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      />
      <ToolbarButton
        label="↔"
        title={t("writingDocViewPage.toolbar.alignCenter")}
        isActive={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      />
      <ToolbarButton
        label="⇥"
        title={t("writingDocViewPage.toolbar.alignRight")}
        isActive={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      />
      <ToolbarButton
        label="≡"
        title={t("writingDocViewPage.toolbar.alignJustify")}
        isActive={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      />
      {TOOLBAR_DIVIDER}
      <ToolbarButton
        label="•"
        title={t("writingDocViewPage.toolbar.bulletList")}
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="1."
        title={t("writingDocViewPage.toolbar.orderedList")}
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="❝"
        title={t("writingDocViewPage.toolbar.blockquote")}
        isActive={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton label="—" title={t("writingDocViewPage.toolbar.horizontalRule")} onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      {TOOLBAR_DIVIDER}
      <input
        type="number"
        min={1}
        max={30}
        title={t("writingDocViewPage.toolbar.tableRows")}
        value={tableRows}
        onChange={(e) => setTableRows(Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)))}
        style={{ width: 32, padding: "2px 4px", fontSize: 12, height: 24 }}
      />
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>×</span>
      <input
        type="number"
        min={1}
        max={20}
        title={t("writingDocViewPage.toolbar.tableCols")}
        value={tableCols}
        onChange={(e) => setTableCols(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
        style={{ width: 32, padding: "2px 4px", fontSize: 12, height: 24 }}
      />
      <ToolbarButton
        label={t("writingDocViewPage.toolbar.insertTableLabel")}
        title={t("writingDocViewPage.toolbar.insertTable")}
        onClick={() => editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run()}
      />
      {inTable && (
        <>
          <ToolbarButton label={t("writingDocViewPage.toolbar.addRowLabel")} title={t("writingDocViewPage.toolbar.addRow")} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarButton label={t("writingDocViewPage.toolbar.deleteRowLabel")} title={t("writingDocViewPage.toolbar.deleteRow")} onClick={() => editor.chain().focus().deleteRow().run()} />
          <ToolbarButton label={t("writingDocViewPage.toolbar.addColumnLabel")} title={t("writingDocViewPage.toolbar.addColumn")} onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarButton label={t("writingDocViewPage.toolbar.deleteColumnLabel")} title={t("writingDocViewPage.toolbar.deleteColumn")} onClick={() => editor.chain().focus().deleteColumn().run()} />
          <ToolbarButton label={t("writingDocViewPage.toolbar.deleteTableLabel")} title={t("writingDocViewPage.toolbar.deleteTable")} onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
      {TOOLBAR_DIVIDER}
      <label className="btn-ghost" title={t("writingDocViewPage.toolbar.insertImage")} style={{ padding: "2px 8px", cursor: "pointer", fontSize: 13 }}>
        🖼
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImageFromFile(editor, file);
            e.target.value = "";
          }}
        />
      </label>
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

interface WritingDocViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的文件渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  docIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：刪除文件後改關閉面板而非導覽主畫面網址 */
  embedded?: boolean;
  /** embedded 時回報目前是否有未儲存變更，供側邊面板決定切換／關閉前是否要先確認 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一一般寫作文件的編輯頁：類似 Word 的富文本編輯器，比照其他寫作模式頁面的
 * 編輯/閱覽模式＋手動存檔慣例；內文用 TipTap，同一個 editor instance 靠 editable 切換讀寫，
 * 唯讀時仍完整顯示格式（不退化成純文字），跟資訊卡/關係圖/分支敘事共用同一套 UX 語言 */
export default function WritingDocViewPage({
  docIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: WritingDocViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ docId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const docId = docIdOverride ?? params.docId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel } = useSidePanel();
  const { t } = useLanguage();

  const doc = useLiveQuery(() => (docId ? getWritingDoc(docId) : undefined), [docId]);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);

  const [editing, setEditing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [metaDraft, setMetaDraft] = useState<MetaDraft | null>(null);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const [contentDirty, setContentDirty] = useState(false);
  const [toolbarDraft, setToolbarDraft] = useState<ToolbarDraft>({
    tableRows: 3,
    tableCols: 3,
    highlightHex: "#ffff00",
    highlightAlpha: 100,
  });
  const patchToolbarDraft = (patch: Partial<ToolbarDraft>) => setToolbarDraft((d) => ({ ...d, ...patch }));

  // deps 用 [docId, !!doc] 而不只是 [docId]：doc 剛載入完成（undefined → 有值）那一刻要重新用真正的內容
  // 建立一次 editor，否則第一次掛載時 doc 還沒回來、editor 已經用空內容建好，之後不會自動補回存檔內容
  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        TextStyleKit,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Highlight.configure({ multicolor: true }),
        TableKit.configure({ table: { resizable: true } }),
        Image,
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

  // 依賴要對齊 useEditor 重建的時機（[docId, !!doc]），不能只依賴 doc 本身——doc 是 useLiveQuery
  // 回傳的物件參照，任何欄位變動（例如編輯中途點旁邊的標星號按鈕，只改了 starred）都會產生新的
  // doc 參照，若這裡依賴 doc，就會把使用者正在編輯、還沒存檔的即時字數打回上次存檔時的舊字數，
  // 直到再打一個字才會修正回來——存檔（handleSave）本來就是拿當下編輯器內容直接算字數，不需要
  // 靠這個 effect 從 doc 同步
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
    await updateWritingDocMeta(doc.id, metaDraft);
    await saveWritingDocContent(doc.id, json, wordCount);
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
    await deleteWritingDoc(doc.id);
    if (embedded) {
      // 文件已經刪除，就算還在編輯狀態也沒有東西好儲存了——先清掉面板的 dirty 標記，
      // 否則 closePanel() 會因為殘留的 dirty 狀態又跳出一次對不上情境的「未儲存變更」確認
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/writing`);
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
            <button className="btn-ghost" onClick={() => openPanel({ kind: "writingDoc", docId: doc.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleWritingDocStar(doc.id)}
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

      {editing && <EditorToolbar editor={editor} draft={toolbarDraft} setDraft={patchToolbarDraft} />}
      <div
        className="richtext-editor"
        style={{
          border: "1px solid var(--border)",
          borderRadius: editing ? "0 0 6px 6px" : 6,
          padding: "12px 16px",
          minHeight: 300,
          cursor: editing ? "text" : "default",
        }}
        onClick={() => editing && editor.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>

      {showExport && (
        <ManuscriptExportDialog
          manuscript={writingDocToManuscript(doc, currentLocalUser?.name)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="writingDocs" entityId={doc.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
