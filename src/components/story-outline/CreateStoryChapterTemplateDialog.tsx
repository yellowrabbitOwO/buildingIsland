import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Modal from "../common/Modal";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import AddFieldDialog from "../entry-editor/AddFieldDialog";
import PickGroupDialog from "../templates/PickGroupDialog";
import PickModuleDialog from "../templates/PickModuleDialog";
import { db, newId } from "../../data/db";
import type { FieldDef, Scope, StoryChapterTemplate, TemplateBlock } from "../../data/types";
import { moveItem, useDragReorder } from "../../data/reorder";
import { reorderFieldsByKeys, resolveModuleFieldDefs } from "../../data/repositories/template";
import FieldHint from "../common/FieldHint";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage } from "../../i18n";

interface CreateStoryChapterTemplateDialogProps {
  worldId: string;
  template?: StoryChapterTemplate;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; scope: Scope; blocks: TemplateBlock[] }) => void;
}

/** 章節範本編輯彈窗：CreateTemplateDialog.tsx 的簡化版——章節不屬於任何分類，所以拿掉「套用分類」／
 * 「通用（所有分類）」那組欄位，只保留範本名稱／適用範圍／內容（欄位/群組/模組，含展開/拖曳排序/移除），
 * 其餘邏輯（欄位加入、群組/模組展開快取、拖曳排序）逐字照抄 */
export default function CreateStoryChapterTemplateDialog({
  worldId,
  template,
  readOnly,
  onClose,
  onSubmit,
}: CreateStoryChapterTemplateDialogProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [scope, setScope] = useState<Scope>(template?.scope ?? "world");
  const [blocks, setBlocks] = useState<(TemplateBlock & { label: string; uiKey: string })[]>([]);
  const [showAddField, setShowAddField] = useState(false);
  const [showPickGroup, setShowPickGroup] = useState(false);
  const [showPickModule, setShowPickModule] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [innerDrag, setInnerDrag] = useState<{ blockIndex: number; index: number } | null>(null);
  const [moduleFieldsCache, setModuleFieldsCache] = useState<Record<string, FieldDef[]>>({});
  const [showHistory, setShowHistory] = useState(false);
  const { t } = useLanguage();

  const allGroups = useLiveQuery(() => db.groups.toArray(), []);
  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(blocks, setBlocks, !readOnly);

  useEffect(() => {
    const moduleIds = Array.from(new Set(blocks.filter((b) => b.kind === "module").map((b) => (b as { moduleId: string }).moduleId)));
    const missing = moduleIds.filter((id) => !(id in moduleFieldsCache));
    if (missing.length === 0) return;
    (async () => {
      const updates: Record<string, FieldDef[]> = {};
      for (const id of missing) {
        const mod = await db.modules.get(id);
        if (mod) updates[id] = await resolveModuleFieldDefs(mod.blocks);
      }
      setModuleFieldsCache((prev) => ({ ...prev, ...updates }));
    })();
  }, [blocks, moduleFieldsCache]);

  const toggleExpanded = (key: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reorderBlockFields = (blockIndex: number, baseFields: FieldDef[], from: number, to: number) => {
    const block = blocks[blockIndex];
    if (block.kind !== "group" && block.kind !== "module") return;
    const currentOrder = reorderFieldsByKeys(baseFields, block.fieldOrder).map((f) => f.key);
    const newOrder = moveItem(currentOrder, from, to);
    setBlocks(blocks.map((b, i) => (i === blockIndex ? { ...b, fieldOrder: newOrder } : b)));
  };

  useEffect(() => {
    if (!template) return;
    (async () => {
      const withLabels = await Promise.all(
        template.blocks.map(async (b) => {
          if (b.kind === "field") return { ...b, label: b.field.label, uiKey: newId() };
          if (b.kind === "group") {
            const g = await db.groups.get(b.groupId);
            return { ...b, label: g?.name ?? t("blockEditor.deletedGroupLabel"), uiKey: newId() };
          }
          const m = await db.modules.get(b.moduleId);
          return { ...b, label: m?.name ?? t("blockEditor.deletedModuleLabel"), uiKey: newId() };
        })
      );
      setBlocks(withLabels);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError(t("createTemplateDialog.errors.nameRequired"));
      return;
    }
    if (blocks.length === 0) {
      setError(t("createTemplateDialog.errors.contentRequired"));
      return;
    }
    setError(null);
    onSubmit({
      name: name.trim(),
      scope,
      blocks: blocks.map(({ label: _label, uiKey: _uiKey, ...b }) => b as TemplateBlock),
    });
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／建立」按鈕；唯讀模式沒有送出動作可觸發
  useSaveShortcut(handleSubmit, !readOnly);

  return (
    <Modal title={readOnly ? t("createStoryChapterTemplateDialog.viewTitle", { name: template?.name ?? "" }) : template ? t("createStoryChapterTemplateDialog.editTitle") : t("createStoryChapterTemplateDialog.newTitle")} onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("createTemplateDialog.nameLabel")}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>{t("blockEditor.templateContentHeader")}</strong>
            {!readOnly && (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost" onClick={() => setShowAddField(true)}>
                  {t("blockEditor.addFieldShort")}
                </button>
                <button className="btn-ghost" onClick={() => setShowPickGroup(true)}>
                  {t("blockEditor.addGroupShort")}
                </button>
                <button className="btn-ghost" onClick={() => setShowPickModule(true)}>
                  {t("blockEditor.addModuleShort")}
                </button>
              </div>
            )}
          </div>
          {blocks.map((b, i) => {
            const group = b.kind === "group" ? allGroups?.find((g) => g.id === b.groupId) : undefined;
            const moduleFields = b.kind === "module" ? moduleFieldsCache[b.moduleId] : undefined;
            const baseFields = group ? group.fields : moduleFields;
            const expanded = expandedBlocks.has(b.uiKey) && !!baseFields;
            const orderedFields = baseFields ? reorderFieldsByKeys(baseFields, b.kind !== "field" ? b.fieldOrder : undefined) : [];
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
                    {b.kind !== "field" && baseFields && (
                      <button className="btn-ghost" style={{ padding: 0 }} onClick={() => toggleExpanded(b.uiKey)} title={t("blockEditor.toggleExpandTitle")}>
                        {expanded ? "▾" : "▸"}
                      </button>
                    )}
                    <div>
                      <span>
                        {b.label} {b.kind !== "field" && <span className="builtin-badge">{b.kind === "group" ? t("blockEditor.groupWord") : t("blockEditor.moduleWord")}</span>}
                      </span>
                      {b.kind === "field" && <FieldHint field={b.field} />}
                    </div>
                  </div>
                  {!readOnly && (
                    <button className="btn-ghost" onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))}>
                      {t("common.remove")}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div style={{ marginTop: 6, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 2px" }}>
                      {t("createTemplateDialog.reorderHint", { kind: b.kind === "group" ? t("blockEditor.groupWord") : t("blockEditor.moduleWord"), name: b.label })}
                    </p>
                    {orderedFields.map((f, fi) => (
                      <div
                        key={f.id ?? f.key}
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
                                if (innerDrag && innerDrag.blockIndex === i && innerDrag.index !== fi && baseFields) {
                                  reorderBlockFields(i, baseFields, innerDrag.index, fi);
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
          {template && (
            <button className="btn" style={{ marginRight: "auto" }} onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          {error && <span style={{ color: "var(--danger, #e08283)", fontSize: 12, marginRight: template ? 0 : "auto" }}>{error}</span>}
          <button className="btn" onClick={onClose}>
            {readOnly ? t("common.close") : t("common.cancel")}
          </button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSubmit}>
              {template ? t("common.save") : t("common.create")}
            </button>
          )}
        </div>
      </div>
      {template && showHistory && (
        <VersionHistoryDialog entityType="storyChapterTemplates" entityId={template.id} onClose={() => setShowHistory(false)} />
      )}
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
      {showPickModule && (
        <PickModuleDialog
          worldId={worldId}
          onClose={() => setShowPickModule(false)}
          onPick={(m) => {
            setBlocks([...blocks, { kind: "module", moduleId: m.id, label: m.name, uiKey: newId() }]);
            setShowPickModule(false);
          }}
        />
      )}
    </Modal>
  );
}
