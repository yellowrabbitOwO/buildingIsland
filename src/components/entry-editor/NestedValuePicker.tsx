import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { NestedFieldConfig, NestedOptionNode } from "../../data/types";
import { useLanguage, type TranslationKey } from "../../i18n";

interface NestedValuePickerProps {
  worldId: string;
  config: NestedFieldConfig;
  value: string[] | undefined;
  editing: boolean;
  onChange: (path: string[] | undefined) => void;
}

/** 依儲存的 id 路徑，在目前的選項樹中查出對應節點的顯示標籤路徑。
 * manual 模式查不到時原樣顯示（例如舊資料是直接存標籤文字），維持向下相容；
 * category 模式的選項樹是即時從條目/資料夾產生的，查不到必然是來源已被刪除，改顯示提示文字而非洩漏原始 id */
function resolveDisplayPath(
  tree: NestedOptionNode[],
  value: string[],
  mode: NestedFieldConfig["mode"],
  t: (key: TranslationKey) => string
): string[] {
  let nodes = tree;
  const result: string[] = [];
  for (const seg of value) {
    const found = nodes.find((n) => n.id === seg);
    if (!found) return mode === "category" ? [t("nestedValuePicker.sourceDeleted")] : value;
    result.push(found.label);
    nodes = found.children;
  }
  return result;
}

/** 巢狀欄位的值選取器：手動模式用設定好的選項樹；分類模式用該分類的資料夾/條目結構即時產生選項樹 */
export default function NestedValuePicker({ worldId, config, value, editing, onChange }: NestedValuePickerProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  const categoryTree = useLiveQuery(async () => {
    if (config.mode !== "category" || !config.sourceCategoryId) return [];
    const categoryId = config.sourceCategoryId;
    const folders = await db.folders.where({ worldId, categoryId }).toArray();
    const entries = await db.entries.where({ worldId, categoryId }).toArray();
    const nodes: NestedOptionNode[] = folders
      .map((f) => ({
        id: f.id,
        label: f.name,
        children: entries.filter((e) => e.folderId === f.id).map((e) => ({ id: e.id, label: e.name, children: [] as NestedOptionNode[] })),
      }))
      .filter((f) => f.children.length > 0);
    const unfiled = entries.filter((e) => !e.folderId);
    if (unfiled.length > 0) {
      nodes.push({ id: "__unfiled__", label: t("entryCard.unfiled"), children: unfiled.map((e) => ({ id: e.id, label: e.name, children: [] })) });
    }
    return nodes;
  }, [worldId, config.mode, config.sourceCategoryId]);

  const tree = config.mode === "category" ? categoryTree ?? [] : config.options ?? [];
  const display = value && value.length > 0 ? resolveDisplayPath(tree, value, config.mode, t).join(" › ") : null;

  if (!editing) {
    return display ? <span>{display}</span> : <span style={{ color: "var(--text-faint)" }}>{t("common.notSet")}</span>;
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button className="btn-ghost" style={{ textAlign: "left" }} onClick={() => setOpen((v) => !v)}>
        {display ?? t("nestedValuePicker.clickToSelect")}
      </button>
      {value && value.length > 0 && (
        <button className="btn-ghost" onClick={() => onChange(undefined)} title={t("nestedValuePicker.clearSelectionTitle")}>
          ✕
        </button>
      )}
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20 }}>
            <CascadingMenu
              nodes={tree}
              path={[]}
              onSelect={(path) => {
                onChange(path);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function CascadingMenu({
  nodes,
  path,
  onSelect,
}: {
  nodes: NestedOptionNode[];
  path: string[];
  onSelect: (path: string[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { t } = useLanguage();

  return (
    <div
      className="card"
      style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 160, maxHeight: 280, overflowY: "auto" }}
    >
      {nodes.map((n) => (
        <div key={n.id} style={{ position: "relative" }}>
          <button
            className="btn-ghost"
            style={{ textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between", gap: 6 }}
            onClick={() => (n.children.length > 0 ? setOpenId((v) => (v === n.id ? null : n.id)) : onSelect([...path, n.id]))}
          >
            <span>{n.label || t("common.unnamed")}</span>
            {n.children.length > 0 && <span>▸</span>}
          </button>
          {openId === n.id && n.children.length > 0 && (
            <div style={{ position: "absolute", top: 0, left: "calc(100% + 4px)", zIndex: 21 }}>
              <CascadingMenu nodes={n.children} path={[...path, n.id]} onSelect={onSelect} />
            </div>
          )}
        </div>
      ))}
      {nodes.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "4px 8px" }}>{t("nestedValuePicker.noOptions")}</p>}
    </div>
  );
}
