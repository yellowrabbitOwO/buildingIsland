import { useEffect, useState } from "react";
import { pushEscapeHandler } from "../common/escapeStack";
import { useLanguage } from "../../i18n";

interface FieldActionsMenuProps {
  onOpenSettings?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
}

/** 欄位「⋯」選單：整合欄位設定／新增第二個／移除欄位，取代原本三顆分開的按鈕 */
export default function FieldActionsMenu({ onOpenSettings, onDuplicate, onRemove }: FieldActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    return pushEscapeHandler(() => setOpen(false));
  }, [open]);

  if (!onOpenSettings && !onDuplicate && !onRemove) return null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button className="btn-ghost" onClick={() => setOpen((v) => !v)} title={t("fieldActionsMenu.moreActionsTitle")}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div
            className="card"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 20,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 140,
            }}
          >
            {onOpenSettings && (
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                {t("fieldActionsMenu.fieldSettings")}
              </button>
            )}
            {onDuplicate && (
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setOpen(false);
                  onDuplicate();
                }}
              >
                {t("fieldActionsMenu.duplicateField")}
              </button>
            )}
            {onRemove && (
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                {t("fieldActionsMenu.removeField")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
