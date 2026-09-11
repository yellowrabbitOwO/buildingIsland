import { useEffect, useRef, type ReactNode } from "react";
import { pushEscapeHandler } from "./escapeStack";
import { useLanguage } from "../../i18n";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** 選填：顯示在標題列、緊接在標題右側（✕ 關閉鈕之前）的額外操作按鈕群——需要把操作按鈕跟標題
   * 放同一排、不佔用內容捲動區高度的情境用這個（例如篇章編輯彈窗的刪除/取消/儲存） */
  headerActions?: ReactNode;
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, width = 480, headerActions }: ModalProps) {
  const { t } = useLanguage();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    return pushEscapeHandler(() => onCloseRef.current());
  }, []);

  useEffect(() => {
    const container = cardRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 若子內容自己已用 autoFocus 搶到焦點（常見於新增對話框的名稱輸入框），保留原樣，不強制搶回
    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? container).focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", handleTab);
    return () => {
      container.removeEventListener("keydown", handleTab);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        ref={cardRef}
        className="card"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        style={{ width, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", padding: 20, outline: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
          <h3 style={{ flexShrink: 0 }}>{title}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {headerActions}
            <button className="btn-ghost" onClick={onClose} aria-label={t("common.close")}>
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
