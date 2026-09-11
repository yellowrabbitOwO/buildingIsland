import { useState } from "react";
import type { Asset, ManagerFolder } from "../../data/types";
import { formatBytes } from "../../data/storageUsage";
import { downloadBlob } from "../../data/downloadFile";
import { useAssetUrl } from "../../data/useAssetUrl";
import DropdownMenu from "../common/DropdownMenu";
import { useLanguage } from "../../i18n";

const KIND_ICON: Record<Asset["kind"], string> = {
  image: "🖼️",
  video: "🎬",
  audio: "🎵",
  document: "📄",
  other: "📦",
};

function AssetThumb({ asset }: { asset: Asset }) {
  const url = useAssetUrl(asset.kind === "image" ? asset.blob : undefined);
  if (asset.kind === "image" && url) {
    return <img src={url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
      {KIND_ICON[asset.kind]}
    </span>
  );
}

interface AssetRowProps {
  asset: Asset;
  folders: ManagerFolder[];
  onRename: (name: string) => void;
  onToggleScope: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/** 素材管理一筆資源：圖片顯示縮圖，其餘型別（尤其影片）只顯示圖示，點擊才展開實際的 <video>
 * 預覽——列表裡的資源可能一次很多筆，預設全部渲染 <video> 標籤會讓瀏覽器一次嘗試載入多支影片的
 * metadata，逐筆點開才載入比較省資源 */
export default function AssetRow({ asset, folders, onRename, onToggleScope, onMove, onDelete }: AssetRowProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewUrl = useAssetUrl(previewOpen ? asset.blob : undefined);
  const { t } = useLanguage();

  return (
    <div className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {asset.kind === "video" ? (
          <button
            className="btn-ghost"
            style={{ width: 40, height: 40, fontSize: 20, padding: 0, flexShrink: 0 }}
            title={previewOpen ? t("assetRow.collapsePreview") : t("assetRow.playPreview")}
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {KIND_ICON.video}
          </button>
        ) : (
          <AssetThumb asset={asset} />
        )}
        <input
          value={asset.name}
          onChange={(e) => onRename(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span style={{ color: "var(--text-faint)", fontSize: 12, whiteSpace: "nowrap" }}>{formatBytes(asset.size)}</span>
        <button className="btn-ghost" style={{ fontSize: 12 }} title={t("templateManagerPage.toggleScopeTitle")} onClick={onToggleScope}>
          {asset.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeSingleWorld")}
        </button>
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={160}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  onMove();
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: folders.find((f) => f.id === asset.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  downloadBlob(asset.blob, asset.name);
                  close();
                }}
              >
                {t("assetRow.download")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left", color: "var(--danger, #e08283)" }}
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                {t("assetRow.deleteButton")}
              </button>
            </>
          )}
        </DropdownMenu>
      </div>
      {previewOpen && previewUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video controls src={previewUrl} style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 6 }} />
      )}
    </div>
  );
}
