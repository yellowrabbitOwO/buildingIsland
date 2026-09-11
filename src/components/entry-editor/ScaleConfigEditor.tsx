import type { ScaleEnd, ScaleEndKind, ScaleFieldConfig, ScaleMode } from "../../data/types";
import { SCALE_MODE_LABELS } from "../../data/fieldTypeLabels";
import ColorInput from "../common/ColorInput";
import ImageUpload from "../common/ImageUpload";
import EntryLinkPicker from "./EntryLinkPicker";
import CollapsibleSection from "../common/CollapsibleSection";
import { useLanguage, type TranslationKey } from "../../i18n";

const END_KIND_KEYS: Record<ScaleEndKind, TranslationKey> = {
  text: "scaleConfigEditor.endKind.text",
  number: "scaleConfigEditor.endKind.number",
  color: "scaleConfigEditor.endKind.color",
  image: "scaleConfigEditor.endKind.image",
  entryLink: "scaleConfigEditor.endKind.entryLink",
};

const ALL_SCALE_MODES = Object.keys(SCALE_MODE_LABELS) as ScaleMode[];

interface ScaleConfigEditorProps {
  worldId: string;
  config: ScaleFieldConfig;
  onChange: (config: ScaleFieldConfig) => void;
}

/** 刻度欄位的設定編輯器：線性刻度／星級可複選（填寫時可切換使用中的模式，比照圖表類型），
 * 順滑或固定（整數）精度；各模式各自的數值範圍／滿分星數／左右端內容收合在各自的區塊裡 */
export default function ScaleConfigEditor({ worldId, config, onChange }: ScaleConfigEditorProps) {
  const { t } = useLanguage();
  const allowedModes = config.allowedModes ?? [config.mode];

  const toggleMode = (m: ScaleMode) => {
    const next = allowedModes.includes(m) ? allowedModes.filter((x) => x !== m) : [...allowedModes, m];
    if (next.length === 0) return; // 至少需保留一種模式
    const mode = next.includes(config.mode) ? config.mode : next[0];
    onChange({ ...config, mode, allowedModes: next.length > 1 ? next : undefined });
  };

  const toggleAllModes = () => {
    // 取消全選時至少保留一種模式，避免清空成無效狀態
    const next = allowedModes.length === ALL_SCALE_MODES.length ? allowedModes.slice(0, 1) : ALL_SCALE_MODES;
    const mode = next.includes(config.mode) ? config.mode : next[0];
    onChange({ ...config, mode, allowedModes: next.length > 1 ? next : undefined });
  };

  const updateEnd = (side: "left" | "right", patch: Partial<ScaleEnd>) => {
    const current: ScaleEnd = config[side] ?? { kind: "text" };
    onChange({ ...config, [side]: { ...current, ...patch } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>{t("scaleConfigEditor.modeGroupTitle")}</div>
        <div style={{ display: "flex", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={allowedModes.length === ALL_SCALE_MODES.length} onChange={toggleAllModes} />
            {t("common.selectAll")}
          </label>
          {ALL_SCALE_MODES.map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <input type="checkbox" checked={allowedModes.includes(m)} onChange={() => toggleMode(m)} />
              {t(SCALE_MODE_LABELS[m])}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input
            type="radio"
            checked={config.precision === "smooth"}
            onChange={() => onChange({ ...config, precision: "smooth" })}
          />
          {t("scaleConfigEditor.precisionSmooth")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input
            type="radio"
            checked={config.precision === "fixed"}
            onChange={() => onChange({ ...config, precision: "fixed" })}
          />
          {t("scaleConfigEditor.precisionFixed")}
        </label>
      </div>

      {(allowedModes.includes("linear") || allowedModes.includes("range")) && (
        <div style={{ paddingLeft: 12 }}>
          <CollapsibleSection title={t("scaleConfigEditor.linearRangeTitle")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600 }}>
                {t("scaleConfigEditor.rangeHeaderNote")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ fontSize: 13, flex: 1 }}>
                  {t("scaleConfigEditor.minLabel")}
                  <input
                    type="number"
                    style={{ width: "100%", marginTop: 4 }}
                    value={config.min ?? 0}
                    onChange={(e) => onChange({ ...config, min: Number(e.target.value) || 0 })}
                  />
                </label>
                <label style={{ fontSize: 13, flex: 1 }}>
                  {t("scaleConfigEditor.maxLabel")}
                  <input
                    type="number"
                    style={{ width: "100%", marginTop: 4 }}
                    value={config.max ?? 100}
                    onChange={(e) => onChange({ ...config, max: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              {allowedModes.includes("linear") && (
                <>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>{t("scaleConfigEditor.linearHint")}</p>
                  <div style={{ display: "flex", gap: 12 }}>
                    <ScaleEndFields worldId={worldId} label={t("scaleConfigEditor.leftEndLabel")} end={config.left} onChange={(patch) => updateEnd("left", patch)} />
                    <ScaleEndFields worldId={worldId} label={t("scaleConfigEditor.rightEndLabel")} end={config.right} onChange={(patch) => updateEnd("right", patch)} />
                  </div>
                </>
              )}
              {allowedModes.includes("range") && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
                  {t("scaleConfigEditor.rangeHint")}
                </p>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {allowedModes.includes("rating") && (
        <div style={{ paddingLeft: 12 }}>
          <CollapsibleSection title={t("scaleConfigEditor.ratingSettingsTitle")}>
            <label style={{ fontSize: 13 }}>
              {t("scaleConfigEditor.maxStarsLabel")}
              <input
                type="number"
                min={1}
                style={{ width: "100%", marginTop: 4 }}
                value={config.maxStars ?? 5}
                onChange={(e) => onChange({ ...config, maxStars: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

function ScaleEndFields({
  worldId,
  label,
  end,
  onChange,
}: {
  worldId: string;
  label: string;
  end?: ScaleEnd;
  onChange: (patch: Partial<ScaleEnd>) => void;
}) {
  const { t } = useLanguage();
  const kind = end?.kind ?? "text";
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600 }}>{label}</div>
      <select style={{ width: "100%" }} value={kind} onChange={(e) => onChange({ kind: e.target.value as ScaleEndKind })}>
        {(Object.entries(END_KIND_KEYS) as [ScaleEndKind, TranslationKey][]).map(([value, key]) => (
          <option key={value} value={value}>
            {t(key)}
          </option>
        ))}
      </select>
      {kind === "text" && (
        <input style={{ width: "100%" }} placeholder={t("scaleConfigEditor.textContentPlaceholder")} value={end?.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
      )}
      {kind === "number" && (
        <input
          type="number"
          style={{ width: "100%" }}
          placeholder={t("scaleConfigEditor.endKind.number")}
          value={end?.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}
      {kind === "color" && <ColorInput value={end?.color} onChange={(c) => onChange({ color: c || undefined })} allowClear worldId={worldId} />}
      {kind === "image" && <ImageUpload value={end?.image} onChange={(v) => onChange({ image: v })} />}
      {kind === "entryLink" && (
        <EntryLinkPicker
          worldId={worldId}
          config={{ allowedCategoryIds: [], allowedBuiltInCategoryKeys: [], multiple: false }}
          value={end?.entryId}
          editing
          onChange={(v) => onChange({ entryId: typeof v === "string" ? v : undefined })}
        />
      )}
    </div>
  );
}
