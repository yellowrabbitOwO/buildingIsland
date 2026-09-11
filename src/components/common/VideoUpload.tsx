import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { createAsset } from "../../data/repositories/asset";
import { useAssetUrl } from "../../data/useAssetUrl";
import { useLanguage } from "../../i18n";

interface VideoUploadProps {
  value?: string; // assetId
  onChange: (assetId: string | undefined) => void;
  worldId: string;
}

/** 影片欄位的編輯器：欄位值存的是 assetId（參照 assets 表），不是影片內容本身——
 * 上傳的檔案會建立一筆世界範圍的 Asset，同時也會出現在「資源」分頁的素材庫裡（比照規格
 * 的媒體附件精神，上傳一次兩邊都能用）。「移除」只清空這個欄位的參照，不刪除 Asset 本體，
 * 因為同一份素材可能還在資源庫或其他欄位被使用中——比照 ImageUpload／頭像欄位清空不刪檔案的既有精神 */
export default function VideoUpload({ value, onChange, worldId }: VideoUploadProps) {
  const { t } = useLanguage();
  const asset = useLiveQuery(() => (value ? db.assets.get(value) : undefined), [value]);
  const previewUrl = useAssetUrl(asset?.blob);

  const handleFile = async (file: File) => {
    const created = await createAsset(file, "world", worldId);
    onChange(created.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label className="btn" style={{ cursor: "pointer", display: "inline-block" }}>
          {t("videoUpload.chooseFile")}
          <input
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{asset ? asset.name : t("videoUpload.notSelected")}</span>
        {value && (
          <button type="button" className="btn-ghost" onClick={() => onChange(undefined)}>
            {t("common.remove")}
          </button>
        )}
      </div>
      {previewUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video controls src={previewUrl} style={{ maxWidth: 320, maxHeight: 220, borderRadius: 6 }} />
      )}
    </div>
  );
}
