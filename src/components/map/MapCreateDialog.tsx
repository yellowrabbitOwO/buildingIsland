import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import { MAP_SIZE_PRESETS } from "../../data/repositories/map";
import { useLanguage } from "../../i18n";

interface MapCreateDialogProps {
  worldId?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string; tagColor?: string; width: number; height: number }) => void;
}

/** 新增地圖對話框：跟共用的 NewFolderDialog 不同之處只有多一組尺寸欄位——常見尺寸按鈕只是快速
 * 帶入寬高數字的捷徑，寬高欄位本身永遠可以直接輸入自訂數字。尺寸只在建立時決定初始值，之後仍可
 * 在地圖編輯頁的「編輯」模式裡調整（會連帶縮放既有地形）。地形筆刷／平面圖（牆、房間）是同一張
 * 地圖裡的兩套工具，用編輯頁裡的模式切換就能用，不需要在建立時先選類型 */
export default function MapCreateDialog({ worldId, onClose, onSubmit }: MapCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagColor, setTagColor] = useState<string | undefined>(undefined);
  const [width, setWidth] = useState(MAP_SIZE_PRESETS[1].width);
  const [height, setHeight] = useState(MAP_SIZE_PRESETS[1].height);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    onSubmit({ name: name.trim(), description: description.trim(), tagColor, width, height });
  };

  return (
    <Modal title={t("mapCreateDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("common.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          {t("mapCreateDialog.descriptionLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div>
          <div style={{ marginBottom: 4 }}>{t("mapViewPage.mapSizeLabel")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {MAP_SIZE_PRESETS.map((p) => (
              <button
                key={p.labelKey}
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setWidth(p.width);
                  setHeight(p.height);
                }}
              >
                {t(p.labelKey)}（{p.width}×{p.height}）
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={200}
              max={6000}
              value={width}
              onChange={(e) => setWidth(Math.max(1, Number(e.target.value)))}
              style={{ width: 90 }}
            />
            <span style={{ color: "var(--text-muted)" }}>×</span>
            <input
              type="number"
              min={200}
              max={6000}
              value={height}
              onChange={(e) => setHeight(Math.max(1, Number(e.target.value)))}
              style={{ width: 90 }}
            />
          </div>
        </div>
        <ColorInput label={t("worldEdit.tagColorLabel")} value={tagColor} onChange={setTagColor} allowClear worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
