import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Entry, EntryFolder } from "../../data/types";
import { deleteEntry, duplicateEntry, moveEntriesToFolder, toggleEntryStar } from "../../data/repositories/entry";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { isColorValue } from "../../data/colorResolve";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface EntryCardProps {
  entry: Entry;
  worldId: string;
  folders?: EntryFolder[];
  bulkMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** 在側邊面板裡渲染時為 true：卡片主體點擊改成在面板本身開啟條目，不導覽主畫面的網址 */
  embedded?: boolean;
  /** 比照桌面檔案總管拖曳搬移的互動：呼叫端（分類頁）用 useDragToFolder 的 itemDragProps 產生，
   * 這裡原樣掛在卡片外層 div 上，卡片本身不需要知道拖到哪裡去、也不用管放置端的邏輯 */
  dragProps?: DragSourceProps;
}

export default function EntryCard({ entry, worldId, folders, bulkMode, selected, onToggleSelect, embedded, dragProps }: EntryCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("entryCard.deleteConfirm.title"),
      message: t("entryCard.deleteConfirm.message", { name: entry.name }),
    });
    if (ok) await deleteEntry(entry.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() =>
        bulkMode
          ? onToggleSelect?.()
          : embedded
            ? openPanel({ kind: "entry", entryId: entry.id })
            : navigate(`/world/${worldId}/entry/${entry.id}`)
      }
      {...dragProps}
    >
      {entry.titleColor && (
        <ResolvedColor value={entry.titleColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        {bulkMode && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect?.()}
            onClick={(e) => e.stopPropagation()}
            style={{ marginTop: 4, flexShrink: 0 }}
          />
        )}
        {isColorValue(entry.thumbnail) ? (
          <ResolvedColor value={entry.thumbnail}>
            {(hex) => <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: hex }} />}
          </ResolvedColor>
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              flexShrink: 0,
              backgroundColor: entry.thumbnail ? undefined : "var(--bg-hover)",
              backgroundImage: entry.thumbnail ? `url(${entry.thumbnail})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{entry.name}</strong>
          {entry.summary && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.summary}
            </p>
          )}
        </div>
        {!bulkMode && (
          <>
            <button
              className="btn-ghost panel-trigger"
              title={t("sidebar.openBeside")}
              onClick={(e) => {
                e.stopPropagation();
                openPanel({ kind: "entry", entryId: entry.id });
              }}
            >
              ⇲
            </button>
            <button
              className="btn-ghost"
              title={t("entryCard.star")}
              onClick={(e) => {
                e.stopPropagation();
                toggleEntryStar(entry.id);
              }}
              style={{ color: entry.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
            >
              {entry.starred ? "★" : "☆"}
            </button>
            <button
              className="btn-ghost"
              title={t("entryCard.moveToFolder")}
              onClick={(e) => {
                e.stopPropagation();
                setShowMove(true);
              }}
            >
              📁
            </button>
            <button
              className="btn-ghost"
              title={t("common.duplicate")}
              onClick={(e) => {
                e.stopPropagation();
                duplicateEntry(entry.id, undefined, t);
              }}
            >
              ⧉
            </button>
            <button className="btn-ghost" title={t("entryCard.deleteConfirm.title")} onClick={handleDelete}>
              🗑
            </button>
          </>
        )}
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!entry.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveEntriesToFolder([entry.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={entry.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveEntriesToFolder([entry.id], f.id);
                  setShowMove(false);
                }}
              >
                {f.name}
              </button>
            ))}
            {(folders ?? []).length === 0 && (
              <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("entryCard.noFoldersHint")}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
