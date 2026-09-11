import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Modal from "../common/Modal";
import AddFieldDialog from "../entry-editor/AddFieldDialog";
import { db } from "../../data/db";
import type { FieldDef, FieldGroup, Scope } from "../../data/types";
import { useDragReorder } from "../../data/reorder";
import FieldHint from "../common/FieldHint";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage, categoryDisplayName } from "../../i18n";

interface CreateGroupDialogProps {
  worldId: string;
  group?: FieldGroup;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; scope: Scope; fields: FieldDef[]; restrictedCategoryIds: string[] }) => void;
}

export default function CreateGroupDialog({ worldId, group, readOnly, onClose, onSubmit }: CreateGroupDialogProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [scope, setScope] = useState<Scope>(group?.scope ?? "world");
  const [fields, setFields] = useState<FieldDef[]>(group?.fields ?? []);
  const [restricted, setRestricted] = useState((group?.restrictedCategoryIds?.length ?? 0) > 0);
  const [restrictedCategoryIds, setRestrictedCategoryIds] = useState<string[]>(group?.restrictedCategoryIds ?? []);
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<FieldDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { t } = useLanguage();

  const categories = useLiveQuery(() => db.categories.where({ worldId }).toArray(), [worldId]);
  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(fields, setFields, !readOnly);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError(t("createGroupDialog.errors.nameRequired"));
      return;
    }
    if (fields.length === 0) {
      setError(t("createGroupDialog.errors.fieldRequired"));
      return;
    }
    setError(null);
    // 通用（跨世界）群組無法限定分類：分類 id 是各世界各自產生的，跨世界比對不出來，故一律清空
    onSubmit({ name: name.trim(), scope, fields, restrictedCategoryIds: scope === "global" || !restricted ? [] : restrictedCategoryIds });
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／建立」按鈕；唯讀模式沒有送出動作可觸發
  useSaveShortcut(handleSubmit, !readOnly);

  return (
    <Modal title={readOnly ? t("createGroupDialog.viewTitle", { name: group?.name ?? "" }) : group ? t("createGroupDialog.editTitle") : t("createGroupDialog.newTitle")} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("createGroupDialog.nameLabel")}
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
            <input
              type="checkbox"
              checked={restricted}
              onChange={(e) => setRestricted(e.target.checked)}
              disabled={readOnly || scope === "global"}
            />
            {t("blockEditor.restrictToCategoriesCheckbox")}
          </label>
          {scope === "global" ? (
            <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
              {t("createGroupDialog.globalRestrictionHint")}
            </p>
          ) : (
            restricted && (
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
            )
          )}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>{t("blockEditor.fieldsHeader")}</strong>
            {!readOnly && (
              <button className="btn-ghost" onClick={() => setShowAddField(true)}>
                {t("createGroupDialog.addField")}
              </button>
            )}
          </div>
          {fields.map((f, i) => (
            <div
              key={f.id}
              className="card"
              style={{
                padding: "6px 10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
                opacity: dragIndex === i ? 0.5 : 1,
                ...dropIndicatorStyle(i),
              }}
              {...rowProps(i)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!readOnly && (
                  <span {...handleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("common.dragToReorder")}>
                    ⠿
                  </span>
                )}
                <div>
                  <span>{f.label}</span>
                  <FieldHint field={f} />
                </div>
              </div>
              {!readOnly && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn-ghost" onClick={() => setEditingField(f)}>
                    {t("common.edit")}
                  </button>
                  <button className="btn-ghost" onClick={() => setFields(fields.filter((x) => x.id !== f.id))}>
                    {t("common.remove")}
                  </button>
                </div>
              )}
            </div>
          ))}
          {fields.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("createGroupDialog.noFieldsYet")}</p>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {group && (
            <button className="btn" style={{ marginRight: "auto" }} onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          {error && <span style={{ color: "var(--danger, #e08283)", fontSize: 12, marginRight: group ? 0 : "auto" }}>{error}</span>}
          <button className="btn" onClick={onClose}>
            {readOnly ? t("common.close") : t("common.cancel")}
          </button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleSubmit}>
              {group ? t("common.save") : t("common.create")}
            </button>
          )}
        </div>
      </div>
      {group && showHistory && <VersionHistoryDialog entityType="groups" entityId={group.id} onClose={() => setShowHistory(false)} />}
      {showAddField && (
        <AddFieldDialog
          worldId={worldId}
          onClose={() => setShowAddField(false)}
          onSubmit={(f) => {
            setFields([...fields, f]);
            setShowAddField(false);
          }}
        />
      )}
      {editingField && (
        <AddFieldDialog
          worldId={worldId}
          field={editingField}
          onClose={() => setEditingField(null)}
          onSubmit={(f) => {
            setFields(fields.map((x) => (x.id === f.id ? f : x)));
            setEditingField(null);
          }}
        />
      )}
    </Modal>
  );
}
