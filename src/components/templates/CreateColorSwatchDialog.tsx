import { useState } from "react";
import Modal from "../common/Modal";
import type { Scope } from "../../data/types";
import { useLanguage } from "../../i18n";

interface CreateColorSwatchDialogProps {
  onClose: () => void;
  onSubmit: (input: { color: string; label?: string; scope: Scope }) => void;
}

export default function CreateColorSwatchDialog({ onClose, onSubmit }: CreateColorSwatchDialogProps) {
  const [color, setColor] = useState("#c9a463");
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<Scope>("global");
  const { t } = useLanguage();

  return (
    <Modal title={t("createColorSwatchDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 32, padding: 2 }} />
          <input
            placeholder={t("createColorSwatchDialog.namePlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
        </div>
        <div>
          <div style={{ marginBottom: 4, fontSize: 13, color: "var(--text-muted)" }}>{t("createColorSwatchDialog.scopeLabel")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={scope === "world" ? "btn btn-primary" : "btn"} onClick={() => setScope("world")}>
              {t("templateManagerPage.scopeSingleWorld")}
            </button>
            <button type="button" className={scope === "global" ? "btn btn-primary" : "btn"} onClick={() => setScope("global")}>
              {t("templateManagerPage.scopeGlobal")}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit({ color, label: label.trim() || undefined, scope })}>
            {t("common.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
