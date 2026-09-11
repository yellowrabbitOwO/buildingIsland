import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirm } from "./ConfirmProvider";
import { useLanguage } from "../../i18n";

export const MIN_PANEL_WIDTH = 280;
export const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 360;

export type PanelView =
  | { kind: "entry"; entryId: string }
  | { kind: "worldHome" }
  | { kind: "narrativeGraph"; graphId: string }
  | { kind: "relationGraph"; graphId: string }
  | { kind: "map"; mapId: string }
  | { kind: "writingDoc"; docId: string }
  | { kind: "storyboard"; storyboardId: string }
  | { kind: "scriptDoc"; docId: string }
  | { kind: "timeline"; timelineId: string }
  | { kind: "storyOutline"; outlineId: string }
  | { kind: "category"; categoryId: string };

interface SidePanelContextValue {
  panelView: PanelView | null;
  panelWidth: number;
  openPanel: (view: PanelView) => void;
  closePanel: () => void;
  setPanelWidth: (width: number) => void;
  setPanelDirty: (dirty: boolean) => void;
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

/** 側邊面板（主畫面之外再開一個可調寬度的面板顯示條目或主世界）的全域狀態；
 * 掛在 WorldWorkspace，同一世界內共用，切換世界時靠外層 key 重新掛載重置 */
export function SidePanelProvider({ children }: { children: ReactNode }) {
  const confirm = useConfirm();
  const { t } = useLanguage();
  const [panelView, setPanelView] = useState<PanelView | null>(null);
  const [panelWidth, setPanelWidthState] = useState(DEFAULT_PANEL_WIDTH);
  // 與 state 同步的 ref：openPanel/closePanel 的確認流程是非同步的，過程中不能只看到呼叫當下的 state closure
  const dirtyRef = useRef(false);
  // 快速連續呼叫 openPanel/closePanel（例如確認對話框還沒回應完就又點了下一個）時，
  // 用遞增序號標記「這次呼叫是不是最新的一次」——舊呼叫的確認對話框事後才回應時，
  // 如果已經有更新的呼叫發生過，就不再執行舊呼叫的 action，避免舊結果蓋掉新結果
  const requestIdRef = useRef(0);

  const setPanelDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  // 已有未儲存變更時先跳確認對話框，取消則不繼續；沒有變更或使用者確認離開才執行 action
  const confirmDiscardIfDirty = useCallback(
    async (action: () => void) => {
      if (!dirtyRef.current) {
        action();
        return;
      }
      const myRequestId = ++requestIdRef.current;
      const ok = await confirm({
        title: t("sidePanelProvider.leaveConfirm.title"),
        message: t("sidePanelProvider.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok && requestIdRef.current === myRequestId) {
        dirtyRef.current = false;
        action();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm]
  );

  const openPanel = useCallback(
    (view: PanelView) => {
      confirmDiscardIfDirty(() => setPanelView(view));
    },
    [confirmDiscardIfDirty]
  );

  const closePanel = useCallback(() => {
    confirmDiscardIfDirty(() => setPanelView(null));
  }, [confirmDiscardIfDirty]);

  const setPanelWidth = useCallback((width: number) => {
    setPanelWidthState(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width)));
  }, []);

  const value = useMemo<SidePanelContextValue>(
    () => ({ panelView, panelWidth, openPanel, closePanel, setPanelWidth, setPanelDirty }),
    [panelView, panelWidth, openPanel, closePanel, setPanelWidth, setPanelDirty]
  );

  return <SidePanelContext.Provider value={value}>{children}</SidePanelContext.Provider>;
}

export function useSidePanel(): SidePanelContextValue {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error("useSidePanel 必須在 SidePanelProvider 內使用");
  return ctx;
}
