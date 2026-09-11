import { useLanguage } from "../../i18n";

interface BulkActionBarProps {
  count: number;
  totalCount: number;
  folderOptions: { id: string; name: string }[];
  onMoveToFolder: (folderId: string | undefined) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleSelectAll: () => void;
  onCancel: () => void;
}

/** 批量操作列：可全選/取消全選，移至資料夾、複製或刪除已選項目 */
export default function BulkActionBar({
  count,
  totalCount,
  folderOptions,
  onMoveToFolder,
  onDuplicate,
  onDelete,
  onToggleSelectAll,
  onCancel,
}: BulkActionBarProps) {
  const allSelected = totalCount > 0 && count === totalCount;
  const { t } = useLanguage();

  return (
    <div
      className="card"
      style={{
        padding: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--bg-elevated)",
      }}
    >
      <button className="btn" onClick={onToggleSelectAll} disabled={totalCount === 0}>
        {allSelected ? t("bulkActionBar.deselectAll") : t("bulkActionBar.selectAll")}
      </button>
      <strong>{t("bulkActionBar.selectedCount", { count })}</strong>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onMoveToFolder(e.target.value === "__unfiled__" ? undefined : e.target.value);
        }}
        disabled={count === 0}
      >
        <option value="" disabled>
          {t("bulkActionBar.moveToFolderPlaceholder")}
        </option>
        <option value="__unfiled__">{t("entryCard.unfiled")}</option>
        {folderOptions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <button className="btn" onClick={onDuplicate} disabled={count === 0}>
        {t("bulkActionBar.duplicate")}
      </button>
      <button className="btn btn-danger" onClick={onDelete} disabled={count === 0}>
        {t("common.delete")}
      </button>
      <button className="btn" style={{ marginLeft: "auto" }} onClick={onCancel}>
        {t("bulkActionBar.exitBulkMode")}
      </button>
    </div>
  );
}
