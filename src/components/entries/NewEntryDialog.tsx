import { useEffect, useState } from "react";
import Modal from "../common/Modal";
import type { Category, EntryFolder, Template } from "../../data/types";
import { listTemplates } from "../../data/repositories/template";
import { useLanguage, categoryDisplayName } from "../../i18n";

interface NewEntryDialogProps {
  category: Category;
  folders: EntryFolder[];
  defaultFolderId?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; templateId?: string; folderId?: string }) => void;
}

export default function NewEntryDialog({
  category,
  folders,
  defaultFolderId,
  onClose,
  onSubmit,
}: NewEntryDialogProps) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>(defaultFolderId ?? "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    listTemplates(category.worldId, category).then((tpls) => {
      setTemplates(tpls);
      // 分類的預設範本可能已被刪除或改套用到其他分類而變得無效，此時不預選，避免送出時仍帶著失效的 templateId
      if (category.defaultTemplateId && tpls.some((t) => t.id === category.defaultTemplateId)) {
        setTemplateId(category.defaultTemplateId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id]);

  const handleSubmit = () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    onSubmit({ name: name.trim(), templateId: templateId || undefined, folderId: folderId || undefined });
  };

  return (
    <Modal title={t("newEntryDialog.title", { category: categoryDisplayName(category, t) })} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("newEntryDialog.nameLabel")}
          <input
            style={{ width: "100%", marginTop: 4 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </label>
        <label>
          {t("newEntryDialog.templateLabel")}
          <select style={{ width: "100%", marginTop: 4 }} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t("newEntryDialog.noTemplate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
                {tpl.isBuiltIn ? t("newEntryDialog.builtInSuffix") : ""}
              </option>
            ))}
          </select>
        </label>
        {folders.length > 0 && (
          <label>
            {t("newEntryDialog.folderLabel")}
            <select style={{ width: "100%", marginTop: 4 }} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{t("newEntryDialog.noFolder")}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
