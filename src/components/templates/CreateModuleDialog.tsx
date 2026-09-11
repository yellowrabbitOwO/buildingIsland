import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Modal from "../common/Modal";
import AddFieldDialog from "../entry-editor/AddFieldDialog";
import PickGroupDialog from "./PickGroupDialog";
import { db, newId } from "../../data/db";
import type { FieldDef, FieldGroup, FieldModule, ModuleBlock, Scope } from "../../data/types";
import { moveItem, useDragReorder } from "../../data/reorder";
import { reorderFieldsByKeys } from "../../data/repositories/template";
import FieldHint from "../common/FieldHint";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage, categoryDisplayName } from "../../i18n";

interface CreateModuleDialogProps {
  worldId: string;
  mod?: FieldModule;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; scope: Scope; blocks: ModuleBlock[]; restrictedCategoryIds: string[] }) => void;
}

export default function CreateModuleDialog({ worldId, mod, readOnly, onClose, onSubmit }: CreateModuleDialogProps) {
  const [name, setName] = useState(mod?.name ?? "");
  const [scope, setScope] = useState<Scope>(mod?.scope ?? "world");
  const [blocks, setBlocks] = useState<(ModuleBlock & { label: string; uiKey: string })[]>([]);
  const [restricted, setRestricted] = useState((mod?.restrictedCategoryIds?.length ?? 0) > 0);
  const [restrictedCategoryIds, setRestrictedCategoryIds] = useState<string[]>(mod?.restrictedCategoryIds ?? []);
  const [showAddField, setShowAddField] = useState(false);
  const [showPickGroup, setShowPickGroup] = useState(false);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [innerDrag, setInnerDrag] = useState<{ blockIndex: number; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { t } = useLanguage();

  const categories = useLiveQuery(() => db.categories.where({ worldId }).toArray(), [worldId]);
  const allGroups = useLiveQuery(() => db.groups.toArray(), []);
  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(blocks, setBlocks, !readOnly);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError(t("createModuleDialog.errors.nameRequired"));
      return;
    }
    if (blocks.length === 0) {
      setError(t("createModuleDialog.errors.contentRequired"));
      return;
    }
    setError(null);
    onSubmit({
      name: name.trim(),
      scope,
      blocks: blocks.map(({ label: _label, uiKey: _uiKey, ...b }) => b as ModuleBlock),
      // 通用（跨世界）模組無法限定分類：分類 id 是各世界各自產生的，跨世界比對不出來，故一律清空
      restrictedCategoryIds: scope === "global" || !restricted ? [] : restrictedCategoryIds,
    });
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／建立」按鈕；唯讀模式沒有送出動作可觸發
  useSaveShortcut(handleSubmit, !readOnly);

  const toggleExpanded = (groupId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const reorderBlockFields = (blockIndex: number, group: FieldGroup, from: number, to: number) => {
    const block = blocks[blockIndex];
    if (block.kind !== "group") return;
    const currentOrder = reorderFieldsByKeys(group.fields, block.fieldOrder).map((f) => f.key);
    const newOrder = moveItem(currentOrder, from, to);
    setBlocks(blocks.map((b, i) => (i === blockIndex ? { ...b, fieldOrder: newOrder } : b)));
  };

  useEffect(() => {
    if (!mod) return;
    (async () => {
      const withLabels = await Promise.all(
        mod.blocks.map(async (b) => {
          if (b.kind === "field") return { ...b, label: b.field.label, uiKey: newId() };
          const group = await db.groups.get(b.groupId);
          return { ...b, label: group?.name ?? t("blockEditor.deletedGroupLabel"), uiKey: newId() };
        })
      );
      setBlocks(withLabels);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod]);

  return (
    <Modal title={readOnly ? t("createModuleDialog.viewTitle", { name: mod?.name ?? "" }) : mod ? t("createModuleDialog.editTitle") : t("createModuleDialog.newTitle")} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("createModuleDialog.nameLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={readOnly} />
        </label>
        <label>
          {t("createFolderDialog.scopeLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={scope} onChange={(e) => setScope(e.target.value as Scope)} disabled={readOnly}>
            <option value="world">{t("templateManagerPage.scopeSingleWorld")}</option>
            <option value="global">{t("managerFolder.globalScopeOption")}</option>
          </select>
        </label>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} disabled={readOnly} />
            {t("blockEditor.restrictToCategoriesCheckbox")}
          </label>
          {restricted && (
            <select
              multiple
              style={{ width: "100%", marginTop: 6, minHeight: 80 }}
              value={restrictedCategoryIds}
              onChange={(e) => setRestrictedCategoryIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
              disabled={readOnly}
            >
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryDisplayName(c, t)}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>{t("blockEditor.contentHeader")}</strong>
            {!readOnly && (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost" onClick={() => setShowAddField(true)}>
                  {t("blockEditor.addFieldShort")}
                </button>
                <button className="btn-ghost" onClick={() => setShowPickGroup(true)}>
                  {t("blockEditor.addGroupShort")}
                </button>
              </div>
            )}
          </div>
          {blocks.map((b, i) => {
            const group = b.kind === "group" ? allGroups?.find((g) => g.id === b.groupId) : undefined;
            const expanded = b.kind === "group" && expandedBlocks.has(b.uiKey);
            const orderedGroupFields = group ? reorderFieldsByKeys(group.fields, b.kind === "group" ? b.fieldOrder : undefined) : [];
            return (
              <div
                key={b.uiKey}
                className="card"
                style={{ padding: "6px 10px", marginBottom: 4, opacity: dragIndex === i ? 0.5 : 1, ...dropIndicatorStyle(i) }}
                {...rowProps(i)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {!readOnly && (
                      <span {...handleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("common.dragToReorder")}>
                        ⠿
                      </span>
                    )}
                    {b.kind === "group" && group && (
                      <button className="btn-ghost" style={{ padding: 0 }} onClick={() => toggleExpanded(b.uiKey)} title={t("blockEditor.toggleExpandTitle")}>
                        {expanded ? "▾" : "▸"}
                      </button>
                    )}
                    <div>
                      <span>
                        {b.label} {b.kind === "group" && <span className="builtin-badge">{t("blockEditor.groupWord")}</span>}
                      </span>
                      {b.kind === "field" && <FieldHint field={b.field} />}
                    </div>
                  </div>
                  {!readOnly && (
                    <div style={{ display: "flex", gap: 4 }}>
                      {b.kind === "field" && (
                        <button className="btn-ghost" onClick={() => setEditingBlockIndex(i)}>
                          {t("common.edit")}
                        </button>
                      )}
                      <button className="btn-ghost" onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))}>
                        {t("common.remove")}
                      </button>
                    </div>
                  )}
                </div>
                {expanded && group && (
                  <div style={{ marginTop: 6, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 2px" }}>
                      {t("createModuleDialog.reorderHint", { name: group.name })}
                    </p>
                    {orderedGroupFields.map((f, fi) => (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "3px 8px",
                          background: "var(--bg-hover)",
                          borderRadius: 4,
                          opacity: innerDrag?.blockIndex === i && innerDrag.index === fi ? 0.5 : 1,
                        }}
                        onDragOver={!readOnly ? (e) => e.preventDefault() : undefined}
                        onDrop={
                          !readOnly
                            ? (e) => {
                                e.preventDefault();
                                if (innerDrag && innerDrag.blockIndex === i && innerDrag.index !== fi) {
                                  reorderBlockFields(i, group, innerDrag.index, fi);
                                }
                                setInnerDrag(null);
                              }
                            : undefined
                        }
                      >
                        {!readOnly && (
                          <span
                            draggable
                            onDragStart={() => setInnerDrag({ blockIndex: i, index: fi })}
                            onDragEnd={() => setInnerDrag(null)}
                            style={{ cursor: "grab", color: "var(--text-faint)", fontSize: 12 }}
                            title={t("common.dragToReorder")}
                          >
                            ⠿
                          </span>
                        )}
                        <div>
                          <span style={{ fontSize: 13 }}>{f.label}</span>
                          <FieldHint field={f} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {blocks.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("blockEditor.noContentYet")}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {mod && (
            <button className="btn" style={{ marginRight: "auto" }} onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          {error && <span style={{ color: "var(--danger, #e08283)", fontSize: 12, marginRight: mod ? 0 : "auto" }}>{error}</span>}
          <button className="btn" onClick={onClose}>
            {readOnly ? t("common.close") : t("common.cancel")}
          </button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSubmit}>
              {mod ? t("common.save") : t("common.create")}
            </button>
          )}
        </div>
      </div>
      {mod && showHistory && <VersionHistoryDialog entityType="modules" entityId={mod.id} onClose={() => setShowHistory(false)} />}
      {showAddField && (
        <AddFieldDialog
          worldId={worldId}
          onClose={() => setShowAddField(false)}
          onSubmit={(f) => {
            setBlocks([...blocks, { kind: "field", field: f, label: f.label, uiKey: newId() }]);
            setShowAddField(false);
          }}
        />
      )}
      {showPickGroup && (
        <PickGroupDialog
          worldId={worldId}
          onClose={() => setShowPickGroup(false)}
          onPick={(g) => {
            setBlocks([...blocks, { kind: "group", groupId: g.id, label: g.name, uiKey: newId() }]);
            setShowPickGroup(false);
          }}
        />
      )}
      {editingBlockIndex !== null && blocks[editingBlockIndex]?.kind === "field" && (
        <AddFieldDialog
          worldId={worldId}
          field={(blocks[editingBlockIndex] as ModuleBlock & { kind: "field"; label: string }).field}
          onClose={() => setEditingBlockIndex(null)}
          onSubmit={(f: FieldDef) => {
            setBlocks(blocks.map((b, idx) => (idx === editingBlockIndex ? { ...b, kind: "field", field: f, label: f.label } : b)));
            setEditingBlockIndex(null);
          }}
        />
      )}
    </Modal>
  );
}
