import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Modal from "./Modal";
import { useLanguage } from "../../i18n";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // 與 state 同步的 ref：判斷「目前有沒有對話框顯示中」這個副作用（決定要排隊還是直接顯示）
  // 不能放進 setPending 的 updater 裡做，那是 React StrictMode 開發模式下會被多呼叫一次的純函式位置，
  // 副作用寫在那裡會導致同一筆排隊項目被塞進 queueRef 兩次
  const pendingRef = useRef<PendingConfirm | null>(null);
  const queueRef = useRef<PendingConfirm[]>([]);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      const entry = { options, resolve };
      if (pendingRef.current) {
        // 已有對話框顯示中，先排隊等前一個解決後再顯示，避免覆蓋掉尚未 resolve 的呼叫
        queueRef.current.push(entry);
      } else {
        pendingRef.current = entry;
        setPending(entry);
      }
    });
  }, []);

  const settle = (result: boolean) => {
    pending?.resolve(result);
    const next = queueRef.current.shift() ?? null;
    pendingRef.current = next;
    setPending(next);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal title={pending.options.title} onClose={() => settle(false)} width={420}>
          <p style={{ marginBottom: 20, color: "var(--text)" }}>{pending.options.message}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => settle(false)}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-danger" onClick={() => settle(true)}>
              {pending.options.confirmLabel ?? t("common.confirmDelete")}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm 必須在 ConfirmProvider 內使用");
  return ctx;
}
