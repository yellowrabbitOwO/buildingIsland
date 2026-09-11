import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { ChartType, DateFieldMode, DateFieldRole, DateTimePrecision, FieldSlotDef, FieldType } from "../../data/types";
import { DATE_MODE_LABELS, DATE_ROLE_LABELS, DATE_TIME_PRECISION_LABELS, TYPE_LABELS } from "../../data/fieldTypeLabels";
import { ALL_CHART_TYPE_VALUES, ALL_FIELD_TYPE_VALUES, ALL_SCALE_MODES, seedMissingConfigs } from "../../data/fieldSlotDefaults";
import NestedOptionsEditor from "./NestedOptionsEditor";
import ChoiceConfigEditor from "./ChoiceConfigEditor";
import ScaleConfigEditor from "./ScaleConfigEditor";
import ChartConfigEditor from "./ChartConfigEditor";
import CollapsibleCheckboxGroup from "../common/CollapsibleCheckboxGroup";
import CollapsibleSection from "../common/CollapsibleSection";
import { useLanguage, categoryDisplayName, type TranslationKey } from "../../i18n";

interface FieldSlotEditorProps {
  worldId: string;
  slot: FieldSlotDef;
  /** 是否為欄位的主要內容（第 1 格）：不顯示標籤與移除按鈕 */
  isPrimary?: boolean;
  onChange: (patch: Partial<FieldSlotDef>) => void;
  onRemove?: () => void;
}

/** 一個內容格的設定：內容型態可複選（填寫時可切換），每個選中的型態都完整套用對應的設定面板；
 * 主要內容（第 1 格）與額外子值格共用同一份 UI，差異只在標籤／移除按鈕是否顯示 */
export default function FieldSlotEditor({ worldId, slot, isPrimary, onChange, onRemove }: FieldSlotEditorProps) {
  const { t } = useLanguage();
  const categories = useLiveQuery(() => db.categories.where({ worldId }).toArray(), [worldId]);
  const calendars = useLiveQuery(
    () => db.calendars.filter((c) => c.scope === "global" || c.worldId === worldId).toArray(),
    [worldId]
  );
  const world = useLiveQuery(() => db.worlds.get(worldId), [worldId]);
  const selectedTypes = slot.allowedTypes && slot.allowedTypes.length > 0 ? slot.allowedTypes : [slot.type];
  const defaultCalendarId = world?.defaultCalendarId;

  // 時間欄位曆法沒選過（不管是本來就沒選，或型態剛切換成含「時間」）時，自動代入世界設定的預設曆法，
  // 省去每個時間欄位都要手動選一次的重複操作；使用者事後仍可自行改選別的曆法，這裡只補一次初始值
  useEffect(() => {
    if (selectedTypes.includes("date") && !slot.dateConfig?.calendarId && defaultCalendarId) {
      onChange({ dateConfig: { ...(slot.dateConfig ?? { mode: "single" }), calendarId: defaultCalendarId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypes.includes("date"), slot.dateConfig?.calendarId, defaultCalendarId]);
  const allCategoryIds = categories?.map((c) => c.id) ?? [];
  const rawAllowedCategoryIds = slot.entryLinkConfig?.allowedCategoryIds ?? [];
  const chartTypes = slot.chartConfig ? (slot.chartConfig.allowedChartTypes ?? [slot.chartConfig.chartType]) : [];

  const setSelectedTypes = (next: FieldType[]) => {
    const type = next.includes(slot.type) ? slot.type : (next[0] ?? slot.type);
    onChange({ ...seedMissingConfigs(slot, next), type, allowedTypes: next.length > 1 ? next : undefined });
  };
  const toggleType = (t: FieldType) => {
    const next = selectedTypes.includes(t) ? selectedTypes.filter((x) => x !== t) : [...selectedTypes, t];
    if (next.length === 0) return; // 至少保留一種型態
    setSelectedTypes(next);
  };
  const toggleAllTypes = () => {
    setSelectedTypes(selectedTypes.length === ALL_FIELD_TYPE_VALUES.length ? [selectedTypes[0]] : ALL_FIELD_TYPE_VALUES);
  };

  // allowedCategoryIds 為空＝不限（全選），畫面上顯示成全部勾選；使用者取消勾選其中一項時才會展開成明確清單
  const isAllCategoriesSelected = rawAllowedCategoryIds.length === 0 || rawAllowedCategoryIds.length === allCategoryIds.length;
  const displayedCategoryIds = rawAllowedCategoryIds.length === 0 ? allCategoryIds : rawAllowedCategoryIds;
  const setAllowedCategoryIds = (next: string[]) => {
    onChange({
      entryLinkConfig: {
        allowedCategoryIds: next,
        allowedBuiltInCategoryKeys: slot.entryLinkConfig?.allowedBuiltInCategoryKeys ?? [],
        multiple: slot.entryLinkConfig?.multiple ?? false,
      },
    });
  };
  const toggleCategory = (id: string) => {
    const base = rawAllowedCategoryIds.length === 0 ? allCategoryIds : rawAllowedCategoryIds;
    setAllowedCategoryIds(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };
  const toggleAllCategories = () => {
    setAllowedCategoryIds(isAllCategoriesSelected ? [] : allCategoryIds);
  };
  const setMultiple = (multiple: boolean) => {
    onChange({
      entryLinkConfig: {
        allowedCategoryIds: rawAllowedCategoryIds,
        allowedBuiltInCategoryKeys: slot.entryLinkConfig?.allowedBuiltInCategoryKeys ?? [],
        multiple,
      },
    });
  };

  const toggleChartType = (t: ChartType) => {
    const next = chartTypes.includes(t) ? chartTypes.filter((x) => x !== t) : [...chartTypes, t];
    if (next.length === 0) return;
    const chartType = next.includes(slot.chartConfig?.chartType ?? "bar") ? (slot.chartConfig?.chartType ?? "bar") : next[0];
    onChange({ chartConfig: { ...slot.chartConfig, chartType, allowedChartTypes: next.length > 1 ? next : undefined } });
  };
  const toggleAllChartTypes = () => {
    // 取消全選時至少保留一種類型，避免清空成無效狀態
    const next = chartTypes.length === ALL_CHART_TYPE_VALUES.length ? chartTypes.slice(0, 1) : ALL_CHART_TYPE_VALUES;
    const chartType = next.includes(slot.chartConfig?.chartType ?? "bar") ? (slot.chartConfig?.chartType ?? "bar") : next[0];
    onChange({ chartConfig: { ...slot.chartConfig, chartType, allowedChartTypes: next.length > 1 ? next : undefined } });
  };

  return (
    <div className="card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {!isPrimary && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            placeholder={t("fieldSlotEditor.labelPlaceholder")}
            value={slot.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
          />
          <button className="btn-ghost" onClick={onRemove} title={t("fieldSlotEditor.removeSlotTitle")} style={{ flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}
      <input
        placeholder={t("fieldSlotEditor.hintPlaceholder")}
        value={slot.hint ?? ""}
        onChange={(e) => onChange({ hint: e.target.value || undefined })}
      />
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-faint)" }}>{t("fieldSlotEditor.typeGroupLabel")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" checked={selectedTypes.length === ALL_FIELD_TYPE_VALUES.length} onChange={toggleAllTypes} />
            {t("common.selectAll")}
          </label>
          {(Object.entries(TYPE_LABELS) as [FieldType, TranslationKey][]).map(([value, key]) => (
            <label key={value} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={selectedTypes.includes(value)} onChange={() => toggleType(value)} />
              {t(key)}
            </label>
          ))}
        </div>
      </div>
      {selectedTypes.includes("entryLink") && (
        <CollapsibleCheckboxGroup
          title={t("fieldSlotEditor.entryLinkCategoryRestrictTitle")}
          options={(categories ?? []).map((c) => ({ value: c.id, label: categoryDisplayName(c, t) }))}
          selected={displayedCategoryIds}
          allSelected={isAllCategoriesSelected}
          onToggle={toggleCategory}
          onToggleAll={toggleAllCategories}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            <input type="checkbox" checked={slot.entryLinkConfig?.multiple ?? false} onChange={(e) => setMultiple(e.target.checked)} />
            {t("fieldSlotEditor.multipleLinksLabel")}
          </label>
        </CollapsibleCheckboxGroup>
      )}
      {selectedTypes.includes("chart") && (
        <ChartConfigEditor
          worldId={worldId}
          chartTypes={chartTypes}
          config={slot.chartConfig ?? { chartType: "bar" }}
          onChange={(patch) => onChange({ chartConfig: { ...slot.chartConfig, chartType: slot.chartConfig?.chartType ?? "bar", ...patch } })}
          onToggleChartType={toggleChartType}
          onToggleAllChartTypes={toggleAllChartTypes}
        />
      )}
      {selectedTypes.includes("nested") && (
        <CollapsibleSection title={t("fieldSlotEditor.nestedSourceTitle")}>
          <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                checked={(slot.nestedConfig?.mode ?? "manual") === "manual"}
                onChange={() => onChange({ nestedConfig: { mode: "manual", options: slot.nestedConfig?.options ?? [] } })}
              />
              {t("fieldSlotEditor.nestedManualLabel")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                checked={slot.nestedConfig?.mode === "category"}
                onChange={() => onChange({ nestedConfig: { mode: "category", sourceCategoryId: slot.nestedConfig?.sourceCategoryId } })}
              />
              {t("fieldSlotEditor.nestedCategoryLabel")}
            </label>
          </div>
          {(slot.nestedConfig?.mode ?? "manual") === "manual" ? (
            <NestedOptionsEditor
              options={slot.nestedConfig?.options ?? []}
              onChange={(options) => onChange({ nestedConfig: { mode: "manual", options } })}
            />
          ) : (
            <select
              style={{ width: "100%" }}
              value={slot.nestedConfig?.sourceCategoryId ?? ""}
              onChange={(e) => onChange({ nestedConfig: { mode: "category", sourceCategoryId: e.target.value || undefined } })}
            >
              <option value="">{t("fieldSlotEditor.selectCategoryPlaceholder")}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryDisplayName(c, t)}
                </option>
              ))}
            </select>
          )}
        </CollapsibleSection>
      )}
      {selectedTypes.includes("choice") && (
        <CollapsibleSection title={t("fieldSlotEditor.choiceSettingsTitle")}>
          <ChoiceConfigEditor worldId={worldId} config={slot.choiceConfig ?? { options: [] }} onChange={(choiceConfig) => onChange({ choiceConfig })} />
        </CollapsibleSection>
      )}
      {selectedTypes.includes("scale") && (
        <CollapsibleSection title={t("fieldSlotEditor.scaleSettingsTitle")}>
          <ScaleConfigEditor
            worldId={worldId}
            config={slot.scaleConfig ?? { mode: "linear", allowedModes: ALL_SCALE_MODES, precision: "smooth", min: 0, max: 100 }}
            onChange={(scaleConfig) => onChange({ scaleConfig })}
          />
        </CollapsibleSection>
      )}
      {selectedTypes.includes("date") && (
        <CollapsibleSection title={t("fieldSlotEditor.dateSettingsTitle")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {t("fieldSlotEditor.calendarLabel")}
              <select
                value={slot.dateConfig?.calendarId ?? ""}
                onChange={(e) => onChange({ dateConfig: { ...(slot.dateConfig ?? { mode: "single" }), calendarId: e.target.value } })}
              >
                <option value="">{t("fieldSlotEditor.selectCalendarPlaceholder")}</option>
                {calendars?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!slot.dateConfig?.calendarId && (
                <span style={{ color: "var(--danger, #e08283)", fontSize: 12 }}>{t("common.calendarRequiredError")}</span>
              )}
            </label>
            <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
              {(Object.entries(DATE_MODE_LABELS) as [DateFieldMode, TranslationKey][]).map(([mode, key]) => {
                const modeLocked = !!slot.dateConfig?.role && mode !== "single";
                return (
                  <label
                    key={mode}
                    style={{ display: "flex", alignItems: "center", gap: 4, opacity: modeLocked ? 0.5 : 1 }}
                  >
                    <input
                      type="radio"
                      disabled={modeLocked}
                      checked={(slot.dateConfig?.mode ?? "single") === mode}
                      onChange={() => onChange({ dateConfig: { ...(slot.dateConfig ?? { calendarId: "" }), mode } })}
                    />
                    {t(key)}
                  </label>
                );
              })}
            </div>
            {!!slot.dateConfig?.role && (
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                {t("fieldSlotEditor.roleLockedHint")}
              </span>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {t("fieldSlotEditor.precisionLabel")}
              <select
                value={slot.dateConfig?.precision ?? "day"}
                onChange={(e) =>
                  onChange({
                    dateConfig: { ...(slot.dateConfig ?? { calendarId: "", mode: "single" }), precision: e.target.value as DateTimePrecision },
                  })
                }
              >
                {(Object.entries(DATE_TIME_PRECISION_LABELS) as [DateTimePrecision, TranslationKey][]).map(([precision, key]) => (
                  <option key={precision} value={precision}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              {t("fieldSlotEditor.roleLabel")}
              <select
                value={slot.dateConfig?.role ?? ""}
                onChange={(e) => {
                  const role = (e.target.value || undefined) as DateFieldRole | undefined;
                  onChange({
                    dateConfig: {
                      ...(slot.dateConfig ?? { calendarId: "", mode: "single" }),
                      role,
                      mode: role ? "single" : (slot.dateConfig?.mode ?? "single"),
                    },
                  });
                }}
              >
                <option value="">{t("fieldSlotEditor.roleNoneOption")}</option>
                {(Object.entries(DATE_ROLE_LABELS) as [DateFieldRole, TranslationKey][]).map(([role, key]) => (
                  <option key={role} value={role}>
                    {t(key)}
                  </option>
                ))}
              </select>
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                {t("fieldSlotEditor.birthRoleHint")}
              </span>
            </label>
            {slot.dateConfig?.role === "birth" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={slot.dateConfig?.showBeforeBirth ?? false}
                    onChange={(e) => onChange({ dateConfig: { ...slot.dateConfig!, showBeforeBirth: e.target.checked } })}
                  />
                  {t("fieldSlotEditor.showBeforeBirthLabel")}
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>{t("fieldSlotEditor.gestationDaysLabel")}</span>
                  <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                    {t("fieldSlotEditor.gestationHint")}
                  </span>
                  <input
                    type="number"
                    style={{ width: 100 }}
                    min={0}
                    value={slot.dateConfig?.gestationDays ?? 0}
                    onChange={(e) =>
                      onChange({
                        dateConfig: { ...slot.dateConfig!, gestationDays: Math.max(0, parseInt(e.target.value, 10) || 0) || undefined },
                      })
                    }
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={slot.dateConfig?.trackDeath ?? false}
                    onChange={(e) => onChange({ dateConfig: { ...slot.dateConfig!, trackDeath: e.target.checked } })}
                  />
                  {t("fieldSlotEditor.trackDeathLabel")}
                </label>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
