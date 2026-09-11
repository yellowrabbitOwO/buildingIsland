import { useState } from "react";
import type { StoryboardCard } from "../../data/types";
import Modal from "../common/Modal";
import { useConfirm } from "../common/ConfirmProvider";
import EntryTreePicker from "./EntryTreePicker";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage } from "../../i18n";

interface CardDraft {
  title: string;
  time: string;
  location: string;
  relatedEntryIds: string[];
  content: string;
  emotionalTurn: string;
  conflict: string;
}

function draftFromCard(card: StoryboardCard): CardDraft {
  return {
    title: card.title,
    time: card.time ?? "",
    location: card.location ?? "",
    relatedEntryIds: card.relatedEntryIds,
    content: card.content ?? "",
    emotionalTurn: card.emotionalTurn ?? "",
    conflict: card.conflict ?? "",
  };
}

/** 卡片的 7 欄位編輯彈窗；用 Modal 而非側邊面板或頁內展開——故事板本體開在側邊面板時面板裡不能再開一層面板，
 * 頁內展開又會在拖曳互動中把其他卡片擠位置。草稿跟原卡片內容不同時，取消/Esc 關閉前用 useConfirm 跳確認，
 * 不無聲丟棄——這也是這次連續修的好幾個 bug 的核心教訓（悄悄丟輸入內容） */
export default function StoryboardCardEditorModal({
  card,
  worldId,
  onClose,
  onSave,
  onDelete,
}: {
  card: StoryboardCard;
  worldId: string;
  onClose: () => void;
  onSave: (patch: Partial<Omit<StoryboardCard, "id" | "storyboardId" | "createdAt">>) => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [draft, setDraft] = useState<CardDraft>(() => draftFromCard(card));
  const [showHistory, setShowHistory] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromCard(card));

  const requestClose = async () => {
    if (dirty) {
      const ok = await confirm({
        title: t("timelineEventEditorModal.discardConfirm.title"),
        message: t("storyboardCardEditorModal.discardConfirm.message"),
        confirmLabel: t("timelineEventEditorModal.discardConfirm.confirmLabel"),
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = () => {
    onSave({
      title: draft.title.trim() || t("storyboardCardEditorModal.unnamedCard"),
      time: draft.time.trim() || undefined,
      location: draft.location.trim() || undefined,
      relatedEntryIds: draft.relatedEntryIds,
      content: draft.content.trim() || undefined,
      emotionalTurn: draft.emotionalTurn.trim() || undefined,
      conflict: draft.conflict.trim() || undefined,
    });
    onClose();
  };
  // Ctrl/Cmd+S：對話框開著時直接存檔並關閉，行為等同按下方的「儲存」按鈕
  useSaveShortcut(handleSave, true);

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("storyboardCardEditorModal.deleteConfirm.title"),
      message: t("storyboardCardEditorModal.deleteConfirm.message", { name: card.title }),
    });
    if (!ok) return;
    onDelete();
    onClose();
  };

  return (
    <Modal title={t("storyboardCardEditorModal.title")} onClose={requestClose} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("storyboardCardEditorModal.titleLabel")}
          <input autoFocus value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {t("storyboardCardEditorModal.timeLabel")}
            <input
              value={draft.time}
              onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
              placeholder={t("storyboardCardEditorModal.timePlaceholder")}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {t("storyboardCardEditorModal.locationLabel")}
            <input value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("storyboardCardEditorModal.relatedEntriesLabel")}
          <EntryTreePicker
            worldId={worldId}
            value={draft.relatedEntryIds}
            onChange={(ids) => setDraft((d) => ({ ...d, relatedEntryIds: ids }))}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("storyboardCardEditorModal.contentLabel")}
          <textarea rows={5} value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))} />
        </label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {t("storyboardCardChip.emotionalTurnLabel")}
            <textarea rows={3} value={draft.emotionalTurn} onChange={(e) => setDraft((d) => ({ ...d, emotionalTurn: e.target.value }))} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {t("storyboardCardChip.conflictLabel")}
            <textarea rows={3} value={draft.conflict} onChange={(e) => setDraft((d) => ({ ...d, conflict: e.target.value }))} />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" onClick={handleDelete}>
              🗑 {t("storyboardCardEditorModal.deleteCardButton")}
            </button>
            <button className="btn" onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={requestClose}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
      {showHistory && <VersionHistoryDialog entityType="storyboardCards" entityId={card.id} onClose={() => setShowHistory(false)} />}
    </Modal>
  );
}
