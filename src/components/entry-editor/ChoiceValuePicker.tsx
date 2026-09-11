import type { ChoiceFieldConfig } from "../../data/types";
import ResolvedColor from "../common/ResolvedColor";
import { useLanguage } from "../../i18n";

interface ChoiceValuePickerProps {
  config: ChoiceFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: unknown) => void;
}

/** 選擇題欄位的值選取器：按鈕群組，點擊切換選取其中一個選項 */
export default function ChoiceValuePicker({ config, value, editing, onChange }: ChoiceValuePickerProps) {
  const options = config.options ?? [];
  const selected = typeof value === "string" ? value : undefined;
  const { t } = useLanguage();

  if (!editing) {
    const opt = options.find((o) => o.id === selected);
    if (!opt) return <span style={{ color: "var(--text-faint)" }}>{t("common.notSet")}</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {opt.color && (
          <ResolvedColor value={opt.color}>
            {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
          </ResolvedColor>
        )}
        {opt.label || t("choiceValuePicker.unnamedOption")}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={selected === o.id ? "btn btn-primary" : "btn"}
          onClick={() => onChange(selected === o.id ? undefined : o.id)}
        >
          {o.color && (
            <ResolvedColor value={o.color}>
              {(hex) => (
                <span className="tag-dot" style={{ background: hex ?? "var(--accent)", marginRight: 6, verticalAlign: "middle" }} />
              )}
            </ResolvedColor>
          )}
          {o.label || t("choiceValuePicker.unnamedOption")}
        </button>
      ))}
      {options.length === 0 && <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("choiceValuePicker.noOptionsHint")}</span>}
    </div>
  );
}
