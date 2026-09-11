import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Modal from "./Modal";
import { useConfirm } from "./ConfirmProvider";
import { listVersions, restoreVersion } from "../../data/repositories/versionHistory";
import type { ContentVersion } from "../../data/types";
import { useLanguage, type Language, type TranslationKey } from "../../i18n";

interface VersionHistoryDialogProps {
  /** Dexie 的表名字串（"entries"／"writingDocs"…），跟 db.ts 掛 hook 時用的名稱一致 */
  entityType: string;
  entityId: string;
  onClose: () => void;
}

const REASON_LABEL_KEYS: Record<string, TranslationKey> = {
  updated: "versionHistoryDialog.reasonUpdated",
  deleted: "versionHistoryDialog.reasonDeleted",
};

function formatTimestamp(iso: string, language: Language): string {
  return new Date(iso).toLocaleString(language === "en" ? "en-US" : "zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 通用的版本歷史瀏覽／復原對話框，任何掛了 versionHistory.ts hook 的內容類型都能直接重用，
 * 不用為每種類型各自刻一個——列表資料完全來自 contentVersions 表，跟來源類型的實際欄位形狀無關 */
export default function VersionHistoryDialog({ entityType, entityId, onClose }: VersionHistoryDialogProps) {
  const versions = useLiveQuery(() => listVersions(entityType, entityId), [entityType, entityId]);
  const confirm = useConfirm();
  const { t, language } = useLanguage();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async (version: ContentVersion) => {
    const ok = await confirm({
      title: t("versionHistoryDialog.restoreConfirm.title"),
      message: t("versionHistoryDialog.restoreConfirm.message", {
        name: version.entityName ?? t("versionHistoryDialog.defaultEntityName"),
        time: formatTimestamp(version.createdAt, language),
      }),
      confirmLabel: t("versionHistoryDialog.restoreConfirm.confirmLabel"),
    });
    if (!ok) return;
    setRestoringId(version.id);
    setError(null);
    try {
      await restoreVersion(version);
      onClose();
    } catch (e) {
      setError(t("versionHistoryDialog.restoreFailedPrefix", { error: e instanceof Error ? e.message : String(e) }));
      setRestoringId(null);
    }
  };

  return (
    <Modal title={t("common.versionHistory")} onClose={onClose} width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        {versions?.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>{t("versionHistoryDialog.noVersions")}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
          {(versions ?? []).map((v) => (
            <div key={v.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{formatTimestamp(v.createdAt, language)}</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  {REASON_LABEL_KEYS[v.reason] ? t(REASON_LABEL_KEYS[v.reason]) : v.reason}
                  {v.entityName ? `．${v.entityName}` : ""}
                </div>
              </div>
              <button className="btn" disabled={restoringId !== null} onClick={() => handleRestore(v)}>
                {restoringId === v.id ? t("versionHistoryDialog.restoring") : t("versionHistoryDialog.restoreConfirm.confirmLabel")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
