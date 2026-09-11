import type { CSSProperties } from "react";
import type { ChartFieldConfig, FieldType } from "../../data/types";
import { TYPE_LABELS, CHART_TYPE_LABELS } from "../../data/fieldTypeLabels";
import { useLanguage } from "../../i18n";

/** 主值（FieldDef）與額外子值格（FieldSlotDef）都符合的形狀，供本元件共用 */
interface HintableField {
  type: FieldType;
  allowedTypes?: FieldType[];
  chartConfig?: ChartFieldConfig;
  hint?: string;
}

/** 欄位提示列：一律顯示目前可輸入的型態／圖表類型（單一或多選皆顯示），以及自訂提示詞；任何列出欄位的地方都應顯示，維持一致 */
export default function FieldHint({ field, style }: { field: HintableField; style?: CSSProperties }) {
  const { t } = useLanguage();
  const hasTypeChoice = (field.allowedTypes?.length ?? 0) > 1;
  const hasChartChoice = (field.chartConfig?.allowedChartTypes?.length ?? 0) > 1;
  const showType = true;
  const showChart = field.type === "chart" && !!field.chartConfig;
  if (!field.hint && !showType && !showChart) return null;
  const sep = t("fieldHint.joinSeparator");

  return (
    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1, ...style }}>
      {showType && (
        <span>
          {t("fieldHint.availableTypes", {
            types: hasTypeChoice ? field.allowedTypes!.map((ft) => t(TYPE_LABELS[ft])).join(sep) : t(TYPE_LABELS[field.type]),
          })}
        </span>
      )}
      {showChart && (
        <span>
          {t("fieldHint.availableCharts", {
            types: hasChartChoice
              ? field.chartConfig!.allowedChartTypes!.map((ct) => t(CHART_TYPE_LABELS[ct])).join(sep)
              : t(CHART_TYPE_LABELS[field.chartConfig!.chartType]),
          })}
        </span>
      )}
      {field.hint && <span>{field.hint}</span>}
    </div>
  );
}
