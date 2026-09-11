import type { ChartBranchStyle, ChartFieldConfig, ChartType, NumberLineMode } from "../../data/types";
import { CHART_TYPE_LABELS } from "../../data/fieldTypeLabels";
import { ALL_CHART_TYPE_VALUES } from "../../data/fieldSlotDefaults";
import ColorInput from "../common/ColorInput";
import CollapsibleSection from "../common/CollapsibleSection";
import CollapsibleCheckboxGroup from "../common/CollapsibleCheckboxGroup";
import { useLanguage, type TranslationKey } from "../../i18n";

const BRANCH_STYLE_KEYS: Record<ChartBranchStyle, TranslationKey> = {
  straight: "chartEditor.branchStyle.straight",
  curved: "chartEditor.branchStyle.curved",
  elbow: "chartEditor.branchStyle.elbow",
};

interface ChartConfigEditorProps {
  worldId: string;
  /** 目前允許使用的圖表類型（可能不只一種） */
  chartTypes: ChartType[];
  config: Partial<ChartFieldConfig>;
  onChange: (patch: Partial<ChartFieldConfig>) => void;
  /** 提供時，額外顯示可複選的「圖表類型」清單（欄位設定時用來決定允許哪些類型）；
   * 省略則只顯示 chartTypes 這些類型各自的細部設定＋底色（填寫條目時的圖表設定面板用，chartTypes 固定只有目前使用中的單一類型） */
  onToggleChartType?: (t: ChartType) => void;
  onToggleAllChartTypes?: () => void;
}

/** 圖表欄位的設定：圖表類型勾選、各類型專屬設定（雷達圖最高值、軸範圍、數線模式、分支形狀）
 * 與底色，全部收在「圖表類型」清單展開後的區塊裡 */
export default function ChartConfigEditor({ worldId, chartTypes, config, onChange, onToggleChartType, onToggleAllChartTypes }: ChartConfigEditorProps) {
  const { t } = useLanguage();
  const has = (ct: ChartType) => chartTypes.includes(ct);
  const isNumberLine = has("numberline");
  // 長條圖／折線圖的軸範圍設定；數線圖有自己合併 X/Y 軸模式的專屬區塊，兩者共用同一組 axisMin/axisMax，避免重複顯示
  const showBarLineAxisRange = (has("bar") || has("line")) && !isNumberLine;
  const showYAxis = isNumberLine && config.numberLineMode === "xy";
  const showBranchStyle = has("tree") || has("mindmap");

  const typeSettings = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>{t("chartConfigEditor.backgroundColorLabel")}</span>
        <ColorInput value={config.backgroundColor} onChange={(c) => onChange({ backgroundColor: c || undefined })} allowClear worldId={worldId} />
      </div>
      {has("radar") && (
          <CollapsibleSection title={t("chartConfigEditor.radarSettingsTitle")}>
            <label style={{ fontSize: 13 }}>
              {t("chartConfigEditor.radarMaxLabel")}
              <input
                type="number"
                style={{ width: "100%", marginTop: 4 }}
                value={config.maxValue ?? ""}
                onChange={(e) => onChange({ maxValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                placeholder={t("chartConfigEditor.autoFitPlaceholder")}
              />
            </label>
          </CollapsibleSection>
        )}
        {showBarLineAxisRange && (
          <CollapsibleSection title={t("chartConfigEditor.barLineAxisTitle")}>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ fontSize: 13, flex: 1 }}>
                {t("chartConfigEditor.axisMinLabel")}
                <input
                  type="number"
                  style={{ width: "100%", marginTop: 4 }}
                  value={config.axisMin ?? ""}
                  onChange={(e) => onChange({ axisMin: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </label>
              <label style={{ fontSize: 13, flex: 1 }}>
                {t("chartConfigEditor.axisMaxLabel")}
                <input
                  type="number"
                  style={{ width: "100%", marginTop: 4 }}
                  value={config.axisMax ?? ""}
                  onChange={(e) => onChange({ axisMax: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </label>
            </div>
          </CollapsibleSection>
        )}
        {isNumberLine && (
          <CollapsibleSection title={t("chartConfigEditor.numberLineTitle")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13 }}>
                {t("chartConfigEditor.numberLineModeLabel")}
                <select
                  style={{ width: "100%", marginTop: 4 }}
                  value={config.numberLineMode ?? "x"}
                  onChange={(e) => onChange({ numberLineMode: e.target.value as NumberLineMode })}
                >
                  <option value="x">{t("chartConfigEditor.xOnlyOption")}</option>
                  <option value="xy">{t("chartConfigEditor.xyOption")}</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ fontSize: 13, flex: 1 }}>
                  {t("chartConfigEditor.xAxisMinLabel")}
                  <input
                    type="number"
                    style={{ width: "100%", marginTop: 4 }}
                    value={config.axisMin ?? ""}
                    onChange={(e) => onChange({ axisMin: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </label>
                <label style={{ fontSize: 13, flex: 1 }}>
                  {t("chartConfigEditor.xAxisMaxLabel")}
                  <input
                    type="number"
                    style={{ width: "100%", marginTop: 4 }}
                    value={config.axisMax ?? ""}
                    onChange={(e) => onChange({ axisMax: e.target.value === "" ? undefined : Number(e.target.value) })}
                  />
                </label>
              </div>
              {showYAxis && (
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ fontSize: 13, flex: 1 }}>
                    {t("chartConfigEditor.yAxisMinLabel")}
                    <input
                      type="number"
                      style={{ width: "100%", marginTop: 4 }}
                      value={config.yAxisMin ?? ""}
                      onChange={(e) => onChange({ yAxisMin: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </label>
                  <label style={{ fontSize: 13, flex: 1 }}>
                    {t("chartConfigEditor.yAxisMaxLabel")}
                    <input
                      type="number"
                      style={{ width: "100%", marginTop: 4 }}
                      value={config.yAxisMax ?? ""}
                      onChange={(e) => onChange({ yAxisMax: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </label>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}
        {showBranchStyle && (
          <CollapsibleSection title={t("chartConfigEditor.branchStyleTitle")}>
            <label style={{ fontSize: 13 }}>
              {t("chartConfigEditor.branchStyleLabel")}
              <select
                style={{ width: "100%", marginTop: 4 }}
                value={config.branchStyle ?? (has("tree") ? "elbow" : "curved")}
                onChange={(e) => onChange({ branchStyle: e.target.value as ChartBranchStyle })}
              >
                {(Object.entries(BRANCH_STYLE_KEYS) as [ChartBranchStyle, TranslationKey][]).map(([value, key]) => (
                  <option key={value} value={value}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>
          </CollapsibleSection>
        )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {onToggleChartType && onToggleAllChartTypes ? (
        <CollapsibleCheckboxGroup
          title={t("chartConfigEditor.chartTypeGroupTitle")}
          options={Object.entries(CHART_TYPE_LABELS).map(([value, key]) => ({ value: value as ChartType, label: t(key as TranslationKey) }))}
          selected={chartTypes}
          allSelected={chartTypes.length === ALL_CHART_TYPE_VALUES.length}
          onToggle={onToggleChartType}
          onToggleAll={onToggleAllChartTypes}
        >
          {typeSettings}
        </CollapsibleCheckboxGroup>
      ) : (
        typeSettings
      )}
    </div>
  );
}
