import type { ManagerFolder } from "../../data/types";
import { useLanguage } from "../../i18n";

interface FolderSelectProps {
  folders: ManagerFolder[];
  value?: string;
  onChange: (folderId: string | undefined) => void;
}

/** 指定項目所屬的管理資料夾（未分類／選一個資料夾） */
export default function FolderSelect({ folders, value, onChange }: FolderSelectProps) {
  const { t } = useLanguage();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={{ fontSize: 12 }}
      title={t("folderSelect.title")}
    >
      <option value="">{t("entryCard.unfiled")}</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
