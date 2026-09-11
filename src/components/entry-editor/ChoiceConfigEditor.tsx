import { newId } from "../../data/db";
import type { ChoiceFieldConfig, ChoiceOption } from "../../data/types";
import ColorInput from "../common/ColorInput";
import { useLanguage } from "../../i18n";

interface ChoiceConfigEditorProps {
  worldId: string;
  config: ChoiceFieldConfig;
  onChange: (config: ChoiceFieldConfig) => void;
}

/** 選擇題欄位的設定編輯器：管理可選的選項列表 */
export default function ChoiceConfigEditor({ worldId, config, onChange }: ChoiceConfigEditorProps) {
  const options = config.options ?? [];
  const { t } = useLanguage();

  const updateOption = (id: string, patch: Partial<ChoiceOption>) => {
    onChange({ ...config, options: options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  };
  const addOption = () => onChange({ ...config, options: [...options, { id: newId(), label: "" }] });
  const removeOption = (id: string) => onChange({ ...config, options: options.filter((o) => o.id !== id) });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((o) => (
        <div key={o.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            placeholder={t("common.optionNamePlaceholder")}
            value={o.label}
            onChange={(e) => updateOption(o.id, { label: e.target.value })}
          />
          <ColorInput value={o.color} onChange={(c) => updateOption(o.id, { color: c || undefined })} allowClear worldId={worldId} />
          <button type="button" className="btn-ghost" onClick={() => removeOption(o.id)} title={t("choiceConfigEditor.removeOptionTitle")}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={addOption}>
        {t("common.addOption")}
      </button>
    </div>
  );
}
