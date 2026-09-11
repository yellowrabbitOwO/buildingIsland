import { useEffect, useState } from "react";
import Modal from "../common/Modal";
import { listModules } from "../../data/repositories/template";
import type { FieldModule } from "../../data/types";
import { useLanguage } from "../../i18n";

export default function PickModuleDialog({
  worldId,
  categoryId,
  onClose,
  onPick,
}: {
  worldId: string;
  /** 若提供，僅顯示通用或有限定此分類的模組 */
  categoryId?: string;
  onClose: () => void;
  onPick: (mod: FieldModule) => void;
}) {
  const [modules, setModules] = useState<FieldModule[]>([]);
  const { t } = useLanguage();
  useEffect(() => {
    listModules(worldId).then(setModules);
  }, [worldId]);

  // 沒有指定分類時（例如範本設為「適用所有分類」），代表挑出來的模組要能套用在任何分類上，
  // 這時只能顯示「不限分類」的模組——顯示限定特定分類的模組會讓限制形同虛設
  const visible = categoryId
    ? modules.filter((m) => !m.restrictedCategoryIds?.length || m.restrictedCategoryIds.includes(categoryId))
    : modules.filter((m) => !m.restrictedCategoryIds?.length);

  return (
    <Modal title={t("pickModuleDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((m) => (
          <button
            key={m.id}
            className="btn"
            style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
            onClick={() => onPick(m)}
          >
            <span>
              {m.name}
              {m.isBuiltIn && <span className="builtin-badge" style={{ marginLeft: 6 }}>{t("common.builtIn")}</span>}
              {m.restrictedCategoryIds?.length ? <span className="builtin-badge" style={{ marginLeft: 6 }}>{t("managerPicker.restrictedBadge")}</span> : null}
            </span>
            <span style={{ color: "var(--text-faint)" }}>{t("pickModuleDialog.blockCount", { count: m.blocks.length })}</span>
          </button>
        ))}
        {visible.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("pickModuleDialog.noModules")}</p>}
      </div>
    </Modal>
  );
}
