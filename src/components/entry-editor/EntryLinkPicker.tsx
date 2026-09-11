import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { EntryLinkFieldConfig } from "../../data/types";
import { useSidePanel } from "../common/SidePanelProvider";
import { useLanguage } from "../../i18n";

interface EntryLinkPickerProps {
  worldId: string;
  currentEntryId?: string;
  config: EntryLinkFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: string | string[] | undefined) => void;
}

export default function EntryLinkPicker({
  worldId,
  currentEntryId,
  config,
  value,
  editing,
  onChange,
}: EntryLinkPickerProps) {
  const { openPanel } = useSidePanel();
  const { t } = useLanguage();
  const result = useLiveQuery(async () => {
    const categories = await db.categories.where({ worldId }).toArray();
    const noRestriction = config.allowedCategoryIds.length === 0 && config.allowedBuiltInCategoryKeys.length === 0;
    const allowedCategoryIds = new Set(
      categories
        .filter(
          (c) =>
            noRestriction ||
            config.allowedCategoryIds.includes(c.id) ||
            (c.builtInKey && config.allowedBuiltInCategoryKeys.includes(c.builtInKey))
        )
        .map((c) => c.id)
    );
    const entries = await db.entries.where({ worldId }).toArray();
    const candidates = entries.filter((e) => allowedCategoryIds.has(e.categoryId) && e.id !== currentEntryId);
    return { entries, candidates };
  }, [worldId, config, currentEntryId]);
  const candidates = result?.candidates;
  // 用完整條目清單（不受目前分類限制過濾）判斷是否存在，避免把「被目前限制排除」誤判成「已刪除」
  const allEntries = result?.entries;

  const selectedIds: string[] = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];

  const nameOf = (id: string) => {
    if (!allEntries) return "…"; // 查詢還在進行中，先顯示中性佔位文字，避免誤標成「已刪除」
    return allEntries.find((e) => e.id === id)?.name ?? t("common.deletedEntry");
  };

  if (!editing) {
    if (selectedIds.length === 0) return <span style={{ color: "var(--text-faint)" }}>{t("common.notSet")}</span>;
    return (
      <span>
        {selectedIds.map((id, i) => {
          const exists = allEntries?.some((e) => e.id === id);
          return (
            <span key={id}>
              {i > 0 && t("entryLinkPicker.separator")}
              {nameOf(id)}
              {exists && (
                <button
                  type="button"
                  className="btn-ghost panel-trigger"
                  title={t("sidebar.openBeside")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPanel({ kind: "entry", entryId: id });
                  }}
                  style={{ fontSize: 11, padding: "0 2px" }}
                >
                  ⇲
                </button>
              )}
            </span>
          );
        })}
      </span>
    );
  }

  if (config.multiple) {
    return (
      <select
        multiple
        style={{ width: "100%", minHeight: 80 }}
        value={selectedIds}
        onChange={(e) => {
          const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(ids);
        }}
      >
        {candidates?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      style={{ width: "100%" }}
      value={selectedIds[0] ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{t("common.notSet")}</option>
      {candidates?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
