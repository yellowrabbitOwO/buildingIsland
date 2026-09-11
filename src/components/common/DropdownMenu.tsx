import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { pushEscapeHandler } from "./escapeStack";

interface DropdownMenuProps {
  /** 預設觸發按鈕的內容；若需要自訂觸發元素（例如色塊按鈕），改用 renderTrigger */
  label?: ReactNode;
  title?: string;
  buttonClassName?: string;
  renderTrigger?: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: () => void; open: boolean }) => ReactNode;
  /** 選單相對觸發按鈕的水平對齊方向；若空間不足會自動翻到另一側 */
  align?: "left" | "right";
  /** 選單展開方向；"down"（預設）為一般下拉，"right" 為巢狀子選單常用的向右展開（空間不足時自動翻到左側） */
  direction?: "down" | "right";
  minWidth?: number;
  /** 選單以 portal 掛載到 body，z-index 需比外層任何選單高才能正確疊在上面（例如巢狀在另一個選單內時） */
  zIndex?: number;
  /** 是否允許點擊選單外部關閉；預設 true。設為 false 時僅能透過選單內部的操作（如自訂的取消/確認按鈕）關閉，
   * 適合選單內含瀏覽器原生彈出元件（如色彩選擇器）的情況——避免點到原生元件時被誤判成「點擊外部」而意外關閉並遺失草稿 */
  closeOnOutsideClick?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  children: (close: () => void) => ReactNode;
}

const MARGIN = 8;

/** 通用下拉選單：以 fixed + portal 掛載到 body，避免被卡片的 overflow:hidden 切掉，
 * 並依觸發按鈕在畫面上的實際位置自動決定選單要往上/下、往左/右展開 */
export default function DropdownMenu({
  label,
  title,
  buttonClassName = "btn-ghost",
  renderTrigger,
  align = "right",
  direction = "down",
  minWidth = 170,
  zIndex = 9000,
  closeOnOutsideClick = true,
  onOpen,
  onClose,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const close = () => {
    // 關閉前先手動 blur 選單內目前聚焦的元素（如果有）：選單內容即將被卸載，若不主動 blur，
    // 瀏覽器會在節點移除時才觸發原生 blur，但那時 React 的 fiber 已經卸載，onBlur 這類 React
    // 事件處理器收不到通知——內容元素若靠 onBlur 提交草稿（例如數字輸入框），值就會悄悄遺失。
    // 這裡主動呼叫 .blur()，讓 blur 在節點還掛載時就同步觸發，onBlur 才能正常收到。
    if (contentRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
    setOpen(false);
    onClose?.();
    // 焦點還給觸發按鈕，避免關閉後焦點掉到 <body>，鍵盤使用者按 Tab 才能接續原本的操作，不用重新從頭導覽
    btnRef.current?.focus();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    return pushEscapeHandler(() => closeRef.current());
  }, [open]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      if (direction === "right") {
        const spaceRight = window.innerWidth - rect.right - MARGIN;
        const spaceLeft = rect.left - MARGIN;
        const opensLeft = spaceRight < minWidth && spaceLeft > spaceRight;
        const horizontal: CSSProperties = opensLeft
          ? { right: Math.max(MARGIN, window.innerWidth - rect.left + 4) }
          : { left: Math.min(rect.right + 4, window.innerWidth - minWidth - MARGIN) };
        const maxHeight = Math.max(120, Math.min(320, window.innerHeight - rect.top - MARGIN));
        const top = Math.max(MARGIN, Math.min(rect.top, window.innerHeight - MARGIN - maxHeight));
        setStyle({ position: "fixed", top, ...horizontal, maxHeight });
      } else {
        const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
        const spaceAbove = rect.top - MARGIN;
        const opensUp = spaceBelow < 260 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, opensUp ? spaceAbove : spaceBelow);
        const horizontal: CSSProperties =
          align === "left"
            ? rect.left + minWidth > window.innerWidth - MARGIN
              ? { right: Math.max(MARGIN, window.innerWidth - rect.right) }
              : { left: rect.left }
            : rect.right - minWidth < MARGIN
              ? { left: Math.max(MARGIN, rect.left) }
              : { right: window.innerWidth - rect.right };
        setStyle({
          position: "fixed",
          ...(opensUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          ...horizontal,
          maxHeight,
        });
      }
    }
    setOpen(true);
    onOpen?.();
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ ref: btnRef, onClick: toggle, open })
      ) : (
        <button ref={btnRef} type="button" className={buttonClassName} onClick={toggle} title={title}>
          {label}
        </button>
      )}
      {open &&
        style &&
        createPortal(
          <>
            {/* closeOnOutsideClick 為 false 時完全不掛這層攔截點擊用的遮罩，
                避免它以 position:fixed 蓋住整個畫面，導致選單開著時外部（例如上層 Modal 的關閉鈕）完全點不到 */}
            {closeOnOutsideClick && <div style={{ position: "fixed", inset: 0, zIndex }} onClick={close} />}
            <div
              ref={contentRef}
              className="card"
              style={{
                ...style,
                zIndex: zIndex + 1,
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth,
                overflowY: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {children(close)}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
