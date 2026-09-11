import { useEffect, useState } from "react";
import Modal from "../common/Modal";
import { listGroups } from "../../data/repositories/template";
import type { FieldGroup } from "../../data/types";
import { useLanguage } from "../../i18n";

export default function PickGroupDialog({
  worldId,
  categoryId,
  onClose,
  onPick,
}: {
  worldId: string;
  /** 若提供，僅顯示通用或有限定此分類的群組 */
  categoryId?: string;
  onClose: () => void;
  onPick: (group: FieldGroup) => void;
}) {
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const { t } = useLanguage();
  useEffect(() => {
    listGroups(worldId).then(setGroups);
  }, [worldId]);

  // 沒有指定分類時（例如範本設為「適用所有分類」、或從模組編輯畫面挑選），代表挑出來的群組要能套用在任何分類上，
  // 這時只能顯示「不限分類」的群組——顯示限定特定分類的群組會讓限制形同虛設
  const visible = categoryId
    ? groups.filter((g) => !g.restrictedCategoryIds?.length || g.restrictedCategoryIds.includes(categoryId))
    : groups.filter((g) => !g.restrictedCategoryIds?.length);

  return (
    <Modal title={t("pickGroupDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((g) => (
          <button
            key={g.id}
            className="btn"
            style={{ textAlign: "left", display: "flex", justifyContent: "space-between" }}
            onClick={() => onPick(g)}
          >
            <span>
              {g.name}
              {g.isBuiltIn && <span className="builtin-badge" style={{ marginLeft: 6 }}>{t("common.builtIn")}</span>}
              {g.restrictedCategoryIds?.length ? <span className="builtin-badge" style={{ marginLeft: 6 }}>{t("managerPicker.restrictedBadge")}</span> : null}
            </span>
            <span style={{ color: "var(--text-faint)" }}>{t("pickGroupDialog.fieldCount", { count: g.fields.length })}</span>
          </button>
        ))}
        {visible.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("pickGroupDialog.noGroups")}</p>}
      </div>
    </Modal>
  );
}
