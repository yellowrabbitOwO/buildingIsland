import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlocker, useOutletContext, useParams, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { deleteTimeline, getTimeline, toggleTimelineStar, updateTimelineMeta } from "../data/repositories/timeline";
import {
  createBranch,
  countBranchDeletionImpact,
  deleteBranchCascade,
  listBranches,
  updateBranch,
} from "../data/repositories/timelineBranch";
import { createEvent, deleteEvent, eventDate, listEvents, updateEvent } from "../data/repositories/timelineEvent";
import { dateToOrdinal, ordinalToDate, totalDaysInYear } from "../data/calendarMath";
import { eventOrdinalsForViewRange, eventPrimaryOrdinal, recurringOccurrenceOrdinals } from "../data/timelineEventOrdinals";
import { assignLanes } from "../data/timelineLayout";
import { DATE_TIME_PRECISION_LABELS } from "../data/fieldTypeLabels";
import type { DateTimePrecision, Entry } from "../data/types";
import { createEventFromEntry } from "../data/repositories/timelineEventSync";
import { importTimeline } from "../data/repositories/timelineImport";
import { buildCharacterEndpoints } from "../data/characterAge";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { PannableCanvas, branchPath } from "../components/common/GraphPrimitives";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import { pushEscapeHandler } from "../components/common/escapeStack";
import ColorInput from "../components/common/ColorInput";
import DateValueEditor from "../components/common/DateValueEditor";
import CollapsibleSection from "../components/common/CollapsibleSection";
import { CanvasWorkbench } from "../components/common/CanvasWorkbench";
import TimelineBranchDialog from "../components/timeline/TimelineBranchDialog";
import TimelineEventEditorModal from "../components/timeline/TimelineEventEditorModal";
import TimelineHoverOverlay from "../components/timeline/TimelineHoverOverlay";
import type { MarkdownExportContext } from "../data/exportMarkdown";
import { timelineToManuscript } from "../data/manuscript/timelineToManuscript";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import TimelineCalendarView from "../components/timeline/TimelineCalendarView";
import ImportEventEntryDialog from "../components/timeline/ImportEventEntryDialog";
import ImportTimelineDialog from "../components/timeline/ImportTimelineDialog";
import { useLanguage, type TranslationKey } from "../i18n";

const LANE_HEIGHT = 90;
const LEFT_MARGIN = 90;
const TOP_MARGIN = 50;
const CANVAS_INNER_WIDTH = 900;
const TIMELINE_GRID = { style: "dot" as const, size: 40 };
/** 沒有可視範圍設定、也沒有任何事件／分岔點時的預設可視範圍起點（如果日後想改成
 * 「以今年為中心」之類更聰明的預設值，這裡是唯一要改的地方） */
const DEFAULT_VIEW_START_YEAR = 0;
/** 只設定了可視範圍其中一邊（起始或結束年）時，往另一邊推算的預設跨度年數 */
const DEFAULT_VIEW_SPAN_YEARS = 10;
/** 故事核心時間是「單一時間點」時，聚焦範圍額外往兩邊各加這麼多年當緩衝，避免整個畫面只塞得下
 * 一年、看不出前後脈絡；區間焦點使用者自己設定了起訖，不額外加這個緩衝 */
const FOCUS_POINT_PADDING_YEARS = 3;
/** 時間線畫布的縮放上限（倍數）：比其他共用 PannableCanvas 的畫布（預設 20 倍）高很多，
 * 即使時間線本身的可視範圍設定得很寬（例如預設 10 年），放大到底也要能看清楚到秒的刻度——從「日」
 * 放大到「秒」本身就要多轉 86400 倍，預設 10 年可視範圍換算下來大約要 500 萬倍以上的縮放才摸得到秒，
 * 所以這個上限開得比只需要看到「時／分」時高很多。畫面座標已經改用 screenSpaceChildren 自己算
 * （見 sx/sy），不會再受 SVG 變換矩陣的浮點精度限制，可以放心開這麼高。只套用在時間線，
 * 不影響關係圖／分支敘事圖 */
const TIMELINE_MAX_SCALE = 10000000;
/** 格線標籤之間至少要留這麼多螢幕像素，才不會互相重疊看不清楚（見 niceStep／pickStep） */
const MIN_LABEL_PX = 56;

/** 把一個「至少要多大」的原始間隔，捨入成好讀的 1/2/5 × 10ⁿ 倍數（常見座標軸刻度演算法），
 * 用於年份格線間距——年份沒有像月/日/時/分那樣天然的進位單位，只能退而求其次找一個看起來順眼的整數間距 */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / magnitude;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * magnitude;
}

/** 從一組候選間隔（例如月份可以照 1/2/3/4/6/12 個月分組）裡，挑出最小一個大於等於 raw 的；
 * 都不夠大就用候選裡最大的那個。用於有天然進位單位（月/日/時/分）的格線間距，
 * 比 niceStep 的十進位捨入更符合這些單位本身的分組習慣（例如一天 24 小時適合切 2/3/4/6/12） */
function pickStep(candidates: number[], raw: number): number {
  for (const c of candidates) {
    if (c >= raw) return c;
  }
  return candidates[candidates.length - 1] ?? 1;
}

interface TimelineViewPageProps {
  timelineIdOverride?: string;
  worldIdOverride?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一時間線的畫布：分支像 git commit 圖那樣往下岔出平行車道，事件依日期橫向排列。
 * 分支/事件的新增刪改即時寫入 Dexie（比照分支敘事圖/關係圖畫布本身的做法），
 * 只有時間線自己的標題/簡述/標題色用 draft+存檔 */
export default function TimelineViewPage({
  timelineIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: TimelineViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ timelineId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const timelineId = timelineIdOverride ?? params.timelineId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel, panelWidth } = useSidePanel();
  const { t } = useLanguage();

  const timeline = useLiveQuery(() => (timelineId ? getTimeline(timelineId) : undefined), [timelineId]);
  const calendar = useLiveQuery(() => (timeline ? db.calendars.get(timeline.calendarId) : undefined), [timeline?.calendarId]);
  const branches = useLiveQuery(() => (timelineId ? listBranches(timelineId) : undefined), [timelineId]);
  const events = useLiveQuery(() => (timelineId ? listEvents(timelineId) : undefined), [timelineId]);

  const [editing, setEditing] = useState(false);
  const [metaDraft, setMetaDraft] = useState<{
    name: string;
    description?: string;
    tagColor?: string;
    viewStartYear?: number;
    viewEndYear?: number;
    timePrecision?: DateTimePrecision;
    focusYear?: number;
    focusEndYear?: number;
  } | null>(null);
  const [newBranchVariant, setNewBranchVariant] = useState<"fork" | "independent" | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const worldEntriesForExport = useLiveQuery(() => (worldId ? db.entries.where({ worldId }).toArray() : []), [worldId]);
  const worldCalendarsForExport = useLiveQuery(
    () => db.calendars.filter((c) => c.scope === "global" || c.worldId === worldId).toArray(),
    [worldId]
  );
  const exportCtx: MarkdownExportContext = useMemo(
    () => ({
      entryNameById: new Map((worldEntriesForExport ?? []).map((e) => [e.id, e.name])),
      calendarById: new Map((worldCalendarsForExport ?? []).map((c) => [c.id, c])),
    }),
    [worldEntriesForExport, worldCalendarsForExport]
  );
  const [canvasView, setCanvasView] = useState({ x: 0, y: 0, scale: 1 });
  // 非 embedded 時，畫布可視窗尺寸不再寫死 900×560，改成量測 CanvasWorkbench 實際分給畫布的
  // 容器尺寸（做法跟 MapViewPage 一致，見該檔案的說明）
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [measuredCanvasSize, setMeasuredCanvasSize] = useState<{ width: number; height: number } | null>(null);
  /** 事件列表點一下要跳去的位置（見 jumpToEvent）：token 每次點擊都給新值，同一個事件再點一次
   * 也能重新觸發置中 */
  const [jumpToRange, setJumpToRange] = useState<{ x1: number; x2: number; y: number; token: number } | null>(null);
  /** token 用遞增計數器而不是 Date.now()——部分瀏覽器（例如開了防追蹤保護的 Brave）會把
   * Date.now() 的精度刻意鈍化成幾十~一百毫秒一格，快速連點兩次同一個事件可能拿到一模一樣的
   * 時間戳，導致 React 依賴陣列比對不出變化、第二次點擊悄悄沒反應。計數器保證每次呼叫都不同 */
  const jumpTokenRef = useRef(0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  /** 點擊分支線段時彈出的子選單（時間線設定／新增事件）：screenX/screenY 是選單定位用的視窗座標，
   * date 是點擊處換算出的日期，供選「新增事件」時直接在那個日期建立事件 */
  const [lineMenu, setLineMenu] = useState<{
    branchId: string;
    date: { year: number; monthIndex: number; day: number };
    screenX: number;
    screenY: number;
  } | null>(null);
  /** 「匯入既有事件」對話框要匯入到哪條分支，null 表示對話框沒開 */
  const [importEventTarget, setImportEventTarget] = useState<{ branchId: string } | null>(null);
  /** 「匯入其他時間線」對話框是否開啟 */
  const [showImportTimeline, setShowImportTimeline] = useState(false);
  /** 畫布／月曆兩種檢視模式切換：嵌入模式（角色資訊卡側欄）空間有限，月曆格子放不下，固定用畫布 */
  const [viewMode, setViewMode] = useState<"canvas" | "calendar">("canvas");

  const metaSnapshot = (t: {
    name: string;
    description?: string;
    tagColor?: string;
    viewStartYear?: number;
    viewEndYear?: number;
    timePrecision?: DateTimePrecision;
    focusYear?: number;
    focusEndYear?: number;
  }) => ({
    name: t.name,
    description: t.description,
    tagColor: t.tagColor,
    viewStartYear: t.viewStartYear,
    viewEndYear: t.viewEndYear,
    timePrecision: t.timePrecision,
    focusYear: t.focusYear,
    focusEndYear: t.focusEndYear,
  });

  const hasMetaChanges =
    editing && metaDraft !== null && timeline != null && JSON.stringify(metaDraft) !== JSON.stringify(metaSnapshot(timeline));

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !embedded && hasMetaChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const ok = await confirm({
        title: t("entryPage.leaveConfirm.title"),
        message: t("timelineViewPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  useEffect(() => {
    onDirtyChange?.(hasMetaChanges);
  }, [hasMetaChanges, onDirtyChange]);

  // embedded 模式維持原本用 panelWidth／車道數換算尺寸的做法；非 embedded 才量測。
  // 依賴陣列的 fullyLoaded 要跟下面那行 early return 的條件完全一致（timeline/calendar/
  // branches/events 四個 useLiveQuery 都讀出來才算）——這四個查詢各自獨立非同步完成，時間點
  // 通常不同；如果只挑其中一個（例如 timeline）當依賴，很可能 timeline 最先讀出來、其他三個
  // 還沒好，此時 canvasHostRef 那個 DOM 節點根本還沒掛上去（下面提早 return null 了），effect
  // 抓不到 host 只能先跳過，但 timelineLoaded 已經在那次就變成 true 了；等其餘三個也讀出來、
  // DOM 真的掛上去的那次重新渲染，因為 timelineLoaded 沒有再變化，React 會直接跳過重跑這個
  // effect，永遠量不到尺寸、畫布也就永遠不會出現
  const fullyLoaded = !!timeline && !!calendar && !!branches && !!events && !!worldId;
  useLayoutEffect(() => {
    if (embedded) return;
    const host = canvasHostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setMeasuredCanvasSize({
        width: Math.max(240, Math.floor(rect.width)),
        height: Math.max(200, Math.floor(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [embedded, fullyLoaded]);

  // handleSaveMeta 要等下面的 null 檢查過了才能定義（裡面要用到窄化過型別的 timeline），但 hook
  // 呼叫本身不能被那個檢查擋住（否則這幾個 useLiveQuery 從 undefined 變有值時，hook 呼叫次數會
  // 在兩次 render 之間不一致）——所以用一個 ref 轉一手：這裡先無條件掛上 shortcut，實際要跑的
  // 函式晚點再指定
  const handleSaveMetaRef = useRef<() => void>(() => {});
  useSaveShortcut(() => handleSaveMetaRef.current(), editing);

  if (!timeline || !calendar || !branches || !events || !worldId) return null;

  const width = embedded ? Math.max(240, panelWidth - 40) : (measuredCanvasSize?.width ?? 900);
  const laneCount = branches.length;
  // 嵌入模式（角色資訊卡）依實際車道數決定高度，而不是固定給一個偏高的值——分支通常只有 1～2 條，
  // 固定 380px 會空出一大截沒內容的畫布，還把「編輯」欄位與縮放控制擠到摺疊區域外，要多滾動才看得到
  const height = embedded ? Math.min(320, Math.max(200, TOP_MARGIN + laneCount * LANE_HEIGHT + 90)) : (measuredCanvasSize?.height ?? 560);

  const lanes = assignLanes(branches);
  const branchById = new Map(branches.map((b) => [b.id, b]));

  const ordinalOf = (e: (typeof events)[number]) => eventPrimaryOrdinal(calendar, eventDate(e));
  const forkOrdinalOf = (b: (typeof branches)[number]) =>
    b.divergeYear !== undefined && b.divergeMonthIndex !== undefined && b.divergeDay !== undefined
      ? dateToOrdinal(calendar, { year: b.divergeYear, monthIndex: b.divergeMonthIndex, day: b.divergeDay })
      : undefined;
  const endOrdinalOf = (b: (typeof branches)[number]) =>
    b.endYear !== undefined && b.endMonthIndex !== undefined && b.endDay !== undefined
      ? dateToOrdinal(calendar, { year: b.endYear, monthIndex: b.endMonthIndex, day: b.endDay })
      : undefined;

  // 可視範圍：分支不一定要有事件才顯示線——即使一個事件都還沒有，分支的線也要能先畫出來。
  // 底線範圍（base）永遠存在：使用者兩個年份都設定就用設定值；只設定一邊就以預設跨度往另一邊推算；
  // 都沒設定就用預設範圍。實際的 min/max 再用事件與分岔日期去擴張這個底線——只擴張、不收縮，
  // 這樣「範圍裡只有一個事件」也不會讓底線範圍被單一日期蓋掉、線退化回一個點。固定性事件沒有
  // 內在的日期邊界（永遠重複下去），不參與這裡的自動擴張，只在既有範圍內展開發生點
  const eventOrdinals = events.flatMap((e) => eventOrdinalsForViewRange(calendar, eventDate(e)));
  const forkOrdinals = branches.map(forkOrdinalOf).filter((o): o is number => o !== undefined);
  const endOrdinals = branches.map(endOrdinalOf).filter((o): o is number => o !== undefined);
  // 故事核心時間焦點也要讓底線範圍一起擴張：點狀焦點視為那一整年，區間焦點涵蓋整個設定範圍。
  // 這樣「重置檢視」聚焦過去的那段，時間線這條連續的線一定畫得到，不會跳去一段畫布上沒有線的地方
  const focusOrdinals: number[] =
    timeline.focusYear !== undefined
      ? [
          dateToOrdinal(calendar, { year: timeline.focusYear, monthIndex: 0, day: 1 }),
          dateToOrdinal(calendar, { year: (timeline.focusEndYear ?? timeline.focusYear) + 1, monthIndex: 0, day: 1 }) - 1,
        ]
      : [];
  const baseStartYear =
    timeline.viewStartYear ??
    (timeline.viewEndYear !== undefined ? timeline.viewEndYear - DEFAULT_VIEW_SPAN_YEARS : DEFAULT_VIEW_START_YEAR);
  const baseEndYear =
    timeline.viewEndYear ??
    (timeline.viewStartYear !== undefined ? timeline.viewStartYear + DEFAULT_VIEW_SPAN_YEARS : DEFAULT_VIEW_START_YEAR + DEFAULT_VIEW_SPAN_YEARS);
  const baseStartOrdinal = dateToOrdinal(calendar, { year: baseStartYear, monthIndex: 0, day: 1 });
  const baseEndOrdinal = dateToOrdinal(calendar, { year: baseEndYear + 1, monthIndex: 0, day: 1 }) - 1;
  const candidateOrdinals = [...eventOrdinals, ...forkOrdinals, ...endOrdinals, ...focusOrdinals, baseStartOrdinal, baseEndOrdinal];
  const minOrdinal = Math.min(...candidateOrdinals);
  const maxOrdinal = Math.max(...candidateOrdinals);
  const ordinalRange = Math.max(1, maxOrdinal - minOrdinal);
  const contentInnerWidth = Math.max(CANVAS_INNER_WIDTH, events.length * 130);
  const x = (ordinal: number) => LEFT_MARGIN + ((ordinal - minOrdinal) / ordinalRange) * contentInnerWidth;
  const xToOrdinal = (px: number) => minOrdinal + ((px - LEFT_MARGIN) / contentInnerWidth) * ordinalRange;
  const laneY = (branchId: string) => TOP_MARGIN + (lanes.get(branchId) ?? 0) * LANE_HEIGHT + LANE_HEIGHT / 2;

  // 把內容座標換算成最終螢幕座標（比照 PannableCanvas 內部 <g transform> 的公式），供畫面上實際渲染
  // 的線條/文字/圖形使用——時間線縮放上限開到 50000 倍，套在單一個 <g transform> 上的搬移量會衝到
  // 百萬等級，這時瀏覽器內部合成畫面用的變換矩陣精度不夠，線條/文字會整個畫不出來。這裡改成自己
  // 用一般的 JS 雙精度浮點數（不受這個限制）先算好最終螢幕座標，PannableCanvas 那邊用
  // screenSpaceChildren 讓這些內容跳過它自己的 <g transform>，直接照這裡給的座標畫，就不會踩到那個
  // 精度懸崖。既有的 x()/xToOrdinal() 等內容座標系維持不變（給非渲染用途的計算，例如可視範圍反推），
  // 只有實際畫到畫面上的座標才需要再套 sx()/sy()
  const sx = (contentX: number) => contentX * canvasView.scale + canvasView.x;
  const sy = (contentY: number) => contentY * canvasView.scale + canvasView.y;

  const contentWidth = LEFT_MARGIN + contentInnerWidth + 120;
  const contentHeight = TOP_MARGIN + laneCount * LANE_HEIGHT + 40;

  // 掛載時與按「重置檢視」時，若有設定故事核心時間，畫布改成聚焦縮放到這段範圍，而不是縮小顯示全部內容
  const resetFocusRange =
    timeline.focusYear !== undefined
      ? (() => {
          const isPoint = timeline.focusEndYear === undefined;
          const pad = isPoint ? FOCUS_POINT_PADDING_YEARS : 0;
          const startOrdinal = dateToOrdinal(calendar, { year: timeline.focusYear - pad, monthIndex: 0, day: 1 });
          const endOrdinal =
            dateToOrdinal(calendar, { year: (timeline.focusEndYear ?? timeline.focusYear) + pad + 1, monthIndex: 0, day: 1 }) - 1;
          return { x1: x(startOrdinal), x2: x(endOrdinal), y: contentHeight / 2 };
        })()
      : undefined;

  const eventsByBranch = new Map<string, typeof events>();
  for (const e of events) {
    if (!eventsByBranch.has(e.branchId)) eventsByBranch.set(e.branchId, []);
    eventsByBranch.get(e.branchId)!.push(e);
  }

  // 目前畫布實際看得到的內容座標範圍（依平移縮放反推）。分支線／格線都以這個為準往外延伸，
  // 而不是只畫到事件所在的既有範圍——這樣不管使用者往哪個方向平移多遠，線跟格線都會一路跟著鋪過去，
  // 感覺像一條真正沒有起訖點的時間線，而不是平移到某個固定邊界就斷掉。額外多留一個可視範圍寬度當緩衝，
  // 讓平移開始的當下就已經看得到更遠的內容，不用等畫面追上
  const viewportOrdinalMin = xToOrdinal((0 - canvasView.x) / canvasView.scale);
  const viewportOrdinalMax = xToOrdinal((width - canvasView.x) / canvasView.scale);
  const viewportSpan = Math.max(1, viewportOrdinalMax - viewportOrdinalMin);
  const lineOrdinalMin = Math.min(minOrdinal, viewportOrdinalMin - viewportSpan);
  const lineOrdinalMax = Math.max(maxOrdinal, viewportOrdinalMax + viewportSpan);

  // 格線的垂直長度比照上面同一套邏輯：以目前看得到的內容 y 範圍為準往外延伸，而不是固定只畫到
  // 最後一條車道的高度（0～contentHeight）——這樣不管使用者往上下平移多遠，格線都會一路跟著鋪過去，
  // 不會平移到車道範圍以外就看到格線突然斷掉、變成一段空白
  const viewportContentYMin = (0 - canvasView.y) / canvasView.scale;
  const viewportContentYMax = (height - canvasView.y) / canvasView.scale;
  const viewportYSpan = Math.max(1, viewportContentYMax - viewportContentYMin);
  const lineContentYMin = Math.min(0, viewportContentYMin - viewportYSpan);
  const lineContentYMax = Math.max(contentHeight, viewportContentYMax + viewportYSpan);

  // 分支的線：有起始日期的從起始日期開始（不會往之前延伸），主線／沒設起始日期的獨立世界線
  // 往兩邊都延伸到 lineOrdinalMin/Max；結尾預設一律延伸到 lineOrdinalMax（故事可以一直繼續下去），
  // 但設定了結束日期的分支/世界線改成畫到那個日期就停住，不再往右無限延伸
  const laneStartX = (branch: (typeof branches)[number]) => {
    const forkOrdinal = forkOrdinalOf(branch);
    return x(forkOrdinal ?? lineOrdinalMin);
  };
  const laneEndX = (branch: (typeof branches)[number]) => {
    const endOrdinal = endOrdinalOf(branch);
    return x(endOrdinal ?? lineOrdinalMax);
  };

  const minYear = ordinalToDate(calendar, minOrdinal).year;
  const maxYear = ordinalToDate(calendar, maxOrdinal).year;

  /** 排序／跳轉用的「有意義代表 ordinal」：單一時間／持續型直接用 ordinalOf（本來就是真實日期，
   * 沒問題）；固定性事件沒有單一對應的日期，ordinalOf 內部用「year 0」純粹當排序占位，不代表真實
   * 日期，不能直接拿來當畫布跳轉位置或跟其他事件比先後——改成用它在目前可視年份範圍內「第一次
   * 發生」的日期（跟畫布上實際畫出來的菱形標記用同一份 recurringOccurrenceOrdinals），這樣「統整
   * 事件列表」的排序、以及點一下要跳去的位置，才會跟畫面上真正看到的位置一致 */
  const representativeOrdinal = (e: (typeof events)[number]): number => {
    const d = eventDate(e);
    if (d.mode !== "recurring") return ordinalOf(e);
    const occurrences = recurringOccurrenceOrdinals(calendar, d, minYear, maxYear);
    return occurrences[0] ?? ordinalOf(e);
  };

  // 格線改用「目前縮放下每個時間單位佔多少螢幕像素」決定要不要顯示、間隔要拉多開，並且只在目前
  // 看得到的視窗範圍內展開（不是整個可視範圍，範圍可能橫跨幾百年，逐日/逐時展開會爆量也會讓標籤
  // 擠在一起重疊）——這樣不管放大縮小到什麼程度，同一層級的標籤之間都會保持看得清楚的間距，
  // 同時隨著縮放依序加開年→月→日→時→分更細的刻度
  const pxPerDay = (contentInnerWidth / ordinalRange) * canvasView.scale;
  const avgDaysPerMonth = totalDaysInYear(calendar) / Math.max(1, calendar.months.length);
  const pxPerYear = pxPerDay * totalDaysInYear(calendar);
  const pxPerMonth = pxPerDay * avgDaysPerMonth;
  const pxPerHour = pxPerDay / 24;
  const pxPerMinute = pxPerDay / 1440;
  const pxPerSecond = pxPerDay / 86400;

  // 年份本身沒有比「1 年」更小的天然單位——放大到連一年一條線都綽綽有餘時，間距不該再往下切成
  // 零點幾年，是改由月/日/時/分/秒格線接手更細的刻度，所以這裡的下限固定夾在 1。月/日/時/分/秒
  // 也各自用 pickStep 算出「這個層級目前該多密」，跟 yearStep 是同一套邏輯，一併提到這裡先算好，
  // 讓下面判斷「該不該顯示下一層」時可以直接問「上一層是不是已經頂到自己的天然最小單位」
  const yearStep = Math.max(1, niceStep(MIN_LABEL_PX / Math.max(pxPerYear, 1e-9)));
  const monthCount = calendar.months.length;
  const monthStep = pickStep([1, 2, 3, 4, 6, 12].filter((s) => s <= monthCount), MIN_LABEL_PX / Math.max(pxPerMonth, 1e-9));
  const dayStep = pickStep([1, 2, 3, 5, 10, 15], MIN_LABEL_PX / Math.max(pxPerDay, 1e-9));
  const hourStep = pickStep([1, 2, 3, 4, 6, 12], MIN_LABEL_PX / Math.max(pxPerHour, 1e-9));
  const minuteStep = pickStep([1, 5, 10, 15, 30, 60], MIN_LABEL_PX / Math.max(pxPerMinute, 1e-9));
  const secondStep = pickStep([1, 5, 10, 15, 30, 60], MIN_LABEL_PX / Math.max(pxPerSecond, 1e-9));

  // 該不該顯示下一層的判斷，改成「上一層是不是已經頂到自己的天然最小單位（step===1，再怎麼放大
  // 也不可能比這更密）」，而不是各自獨立比「這一層自己塞滿 1 個單位的寬度」。原本的門檻會讓年格線
  // 明明已經每年都畫、中間還有一大段空隙，月格線卻因為還沒到「每個月都塞得下」的門檻完全不顯示，
  // 空隙裡什麼資訊都沒有；改成這樣，年一頂到底就馬上交棒給月，月要顯示多密由 monthStep 自己決定
  // （空隙夠大就選比較密的間隔，空隙還很窄就選比較疏的間隔，至少不會整段空白），月→日、日→時、
  // 時→分、分→秒都比照同一個規則，一路類推
  const showMonthMarks = yearStep === 1;
  const showDayMarks = showMonthMarks && monthStep === 1;
  const showHourMarks = showDayMarks && dayStep === 1;
  const showMinuteMarks = showHourMarks && hourStep === 1;
  const showSecondMarks = showMinuteMarks && minuteStep === 1;

  // 目前刻度定位牌：放大到很細的刻度（時／分／秒）時，年／月格線的錨點（每年 1/1、每月 1 日）
  // 常常落在視窗外一大段距離之外，光靠格線完全看不出「現在是哪一年哪一月」，需要一塊固定貼在畫布上、
  // 不隨縮放平移消失的牌子，直接顯示（曆法名稱＋）完整日期一路到目前縮放層級能看到的最細單位。
  // 有游標時用游標對應的日期（放大時想知道的通常是「游標這個點」而不是整個視窗中心的日期）；
  // 游標不在畫布上（hover 為 null）才退回用視窗中心的日期，讓牌子隨時都有東西可顯示
  const finestUnitLabel = showSecondMarks
    ? t("dateValueEditor.secondLabel")
    : showMinuteMarks
      ? t("dateValueEditor.minuteLabel")
      : showHourMarks
        ? t("dateValueEditor.hourLabel")
        : showDayMarks
          ? t("dateValueEditor.dayLabel")
          : showMonthMarks
            ? t("dateValueEditor.monthLabel")
            : t("dateValueEditor.yearLabel");
  // 機器可讀版本的目前刻度（給 formatDate 用），跟上面給人看的中文標籤是同一件事——游標旁邊的
  // 懸浮提示框（TimelineHoverOverlay）也要跟著目前縮放層級顯示到同樣的精細度，而不是固定顯示到日
  const currentPrecision: DateTimePrecision = showSecondMarks
    ? "second"
    : showMinuteMarks
      ? "minute"
      : showHourMarks
        ? "hour"
        : showDayMarks
          ? "day"
          : showMonthMarks
            ? "month"
            : "year";
  const badgeOrdinal = hover ? xToOrdinal(hover.x) : (viewportOrdinalMin + viewportOrdinalMax) / 2;
  const badgeDate = ordinalToDate(calendar, badgeOrdinal);
  const badgeMonthName = calendar.months[badgeDate.monthIndex]?.name ?? "";
  let currentTimeLabel = `${calendar.name}${t("timelineViewPage.badgeYear", { year: badgeDate.year })}`;
  if (showMonthMarks) currentTimeLabel += ` ${badgeMonthName}`;
  if (showDayMarks) currentTimeLabel += t("timelineViewPage.badgeDay", { day: badgeDate.day });
  if (showHourMarks) currentTimeLabel += t("timelineViewPage.badgeHour", { hour: badgeDate.hour ?? 0 });
  if (showMinuteMarks) currentTimeLabel += t("timelineViewPage.badgeMinute", { minute: badgeDate.minute ?? 0 });
  if (showSecondMarks) currentTimeLabel += t("timelineViewPage.badgeSecond", { second: Math.floor(badgeDate.second ?? 0) });

  const yearMarks: number[] = [];
  {
    const viewYearMin = ordinalToDate(calendar, viewportOrdinalMin).year;
    const viewYearMax = ordinalToDate(calendar, viewportOrdinalMax).year;
    const start = Math.floor(viewYearMin / yearStep) * yearStep - yearStep;
    const end = viewYearMax + yearStep;
    for (let y = start; y <= end; y += yearStep) yearMarks.push(y);
  }
  // 可視範圍很大時，均勻分布的格線很容易剛好跳過故事核心時間那幾年，讓「重置檢視」聚焦過去卻看不到
  // 任何有標數字的格線可以確認自己在哪一年——強制把焦點年份本身也加進來，不管有沒有落在既有間距上
  if (timeline.focusYear !== undefined && !yearMarks.includes(timeline.focusYear)) yearMarks.push(timeline.focusYear);
  if (timeline.focusEndYear !== undefined && !yearMarks.includes(timeline.focusEndYear)) yearMarks.push(timeline.focusEndYear);

  const monthMarks: { ordinal: number; label: string }[] = [];
  if (showMonthMarks) {
    const startYear = ordinalToDate(calendar, viewportOrdinalMin).year - 1;
    const endYear = ordinalToDate(calendar, viewportOrdinalMax).year + 1;
    for (let year = startYear; year <= endYear; year++) {
      for (let m = 0; m < monthCount; m += monthStep) {
        const ord = dateToOrdinal(calendar, { year, monthIndex: m, day: 1 });
        if (ord >= viewportOrdinalMin - 1 && ord <= viewportOrdinalMax + 1) monthMarks.push({ ordinal: ord, label: calendar.months[m].name });
      }
    }
  }

  const dayMarks: { ordinal: number; day: number }[] = [];
  if (showDayMarks) {
    const start = Math.floor(viewportOrdinalMin / dayStep) * dayStep - dayStep;
    const end = viewportOrdinalMax + dayStep;
    for (let ord = start; ord <= end; ord += dayStep) dayMarks.push({ ordinal: ord, day: ordinalToDate(calendar, ord).day });
  }

  const hourMarks: { ordinal: number; hour: number }[] = [];
  if (showHourMarks) {
    const unit = hourStep / 24;
    const start = Math.floor(viewportOrdinalMin / unit) * unit - unit;
    const end = viewportOrdinalMax + unit;
    for (let ord = start; ord <= end; ord += unit) hourMarks.push({ ordinal: ord, hour: ordinalToDate(calendar, ord).hour ?? 0 });
  }

  const minuteMarks: { ordinal: number; minute: number }[] = [];
  if (showMinuteMarks) {
    const unit = minuteStep / 1440;
    const start = Math.floor(viewportOrdinalMin / unit) * unit - unit;
    const end = viewportOrdinalMax + unit;
    for (let ord = start; ord <= end; ord += unit) minuteMarks.push({ ordinal: ord, minute: ordinalToDate(calendar, ord).minute ?? 0 });
  }

  const secondMarks: { ordinal: number; second: number }[] = [];
  if (showSecondMarks) {
    const unit = secondStep / 86400;
    const start = Math.floor(viewportOrdinalMin / unit) * unit - unit;
    const end = viewportOrdinalMax + unit;
    for (let ord = start; ord <= end; ord += unit) secondMarks.push({ ordinal: ord, second: Math.floor(ordinalToDate(calendar, ord).second ?? 0) });
  }

  // 事件標籤防重疊：同一車道上的事件依 x 座標排序，貪婪地把每個標籤放進「第一個不會跟該層
  // 上一個標籤重疊」的層級（層數不夠就自動往下開新的一層，不是只有兩層交錯）——只用「跟上一個
  // 比」的簡單版本在三個以上事件擠在同一點時會誤判（前後兩個沒重疊，但都跟中間那個重疊），
  // 要每層各自記自己的上一個右緣才會準。只處理單一時間模式的事件——區間／固定性的標籤定位邏輯
  // 不同，且通常本來就比較不容易跟其他事件同一個點重疊。halfWidth 要乘上 inv：標籤文字本身用
  // fontSize×inv 畫（見下方事件渲染），維持螢幕上固定大小不隨縮放變形，寬度估計也要跟著縮放，
  // 不然放大到底時明明文字已經縮到看不見了，還是誤判成會重疊
  const eventLabelTier = new Map<string, number>();
  {
    const labelInv = 1 / canvasView.scale;
    const perLane = new Map<string, { id: string; x: number; halfWidth: number }[]>();
    for (const e of events) {
      const d = eventDate(e);
      if (d.mode !== "single") continue;
      const ex = x(ordinalOf(e));
      const halfWidth = ((e.name.length * 6.5) / 2 + 4) * labelInv;
      if (!perLane.has(e.branchId)) perLane.set(e.branchId, []);
      perLane.get(e.branchId)!.push({ id: e.id, x: ex, halfWidth });
    }
    for (const list of perLane.values()) {
      list.sort((a, b) => a.x - b.x);
      const lastRightByTier: number[] = [];
      for (const item of list) {
        const left = item.x - item.halfWidth;
        let tier = 0;
        while (lastRightByTier[tier] !== undefined && left < lastRightByTier[tier]) tier++;
        lastRightByTier[tier] = item.x + item.halfWidth;
        eventLabelTier.set(item.id, tier);
      }
    }
  }

  // 角色生命階段底色：每個有出生自動事件的角色，依出生/受孕/死亡三個端點，在牠出生事件所在的那條
  // 車道背後畫「出生前」「胎兒期」「死後」三段淡色色塊，不用把游標移過去才知道當下是哪個階段
  // （懸浮提示的文字版本仍然保留，見 TimelineHoverOverlay）。「出生前」「死後」沒有天然的邊界，
  // 分別畫到 lineOrdinalMin／lineOrdinalMax，跟分支線本身「一直延伸」的處理方式一致
  const lifeBands = buildCharacterEndpoints(calendar, events).map((c) => {
    const birthOrdinal = dateToOrdinal(calendar, c.birth);
    const deathOrdinal = c.config.trackDeath && c.birth.death ? dateToOrdinal(calendar, c.birth.death) : undefined;
    const conceptionOrdinal = c.config.gestationDays ? birthOrdinal - c.config.gestationDays : undefined;
    return { branchId: c.branchId, birthOrdinal, deathOrdinal, conceptionOrdinal };
  });

  const startEdit = () => {
    setMetaDraft(metaSnapshot(timeline));
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSaveMeta = async () => {
    if (!metaDraft) return;
    await updateTimelineMeta(timeline.id, metaDraft);
    setMetaDraft(null);
    setEditing(false);
  };
  handleSaveMetaRef.current = handleSaveMeta;
  const handleDeleteTimeline = async () => {
    const ok = await confirm({
      title: t("timeline.deleteConfirm.title"),
      message: t("timelineViewPage.deleteConfirm.message", { name: timeline.name }),
    });
    if (!ok) return;
    await deleteTimeline(timeline.id);
    if (embedded) {
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/timeline`);
    }
  };

  const handleAddEventAt = async (branchId: string, date: { year: number; monthIndex: number; day: number }) => {
    const event = await createEvent(worldId, timeline.id, branchId, { name: t("timeline.defaultEventName"), date: { mode: "single", ...date } });
    setOpenEventId(event.id);
  };

  /** 從「事件」分類挑一張既有資訊卡，讀出它時間欄位的日期換算後建立成這條分支上的事件（見
   * createEventFromEntry）；資訊卡還沒填時間欄位、或欄位沒填值時會回傳 undefined，用既有的
   * confirm() 當簡易提示告知使用者，而不是靜靜地什麼都不做 */
  const handleImportEvent = async (branchId: string, entry: Entry) => {
    setImportEventTarget(null);
    const event = await createEventFromEntry(worldId, timeline.id, branchId, entry, calendar);
    if (!event) {
      await confirm({
        title: t("timelineViewPage.importFailedNoDate.title"),
        message: t("timelineViewPage.importFailedNoDate.message", { name: entry.name }),
        confirmLabel: t("common.gotIt"),
      });
      return;
    }
    setOpenEventId(event.id);
  };

  /** 把另一條時間線（同世界任何時間線，例如角色時間線總表「全部角色」）的事件整條複製成這條
   * 時間線的一條新分支，讓非角色時間線也能對照著看角色的生日／死亡等事件（見 importTimeline） */
  const handleImportTimeline = async (source: { id: string; name: string }) => {
    setShowImportTimeline(false);
    const count = await importTimeline(worldId, timeline.id, source.id, calendar, t);
    if (count === 0) {
      await confirm({
        title: t("timelineViewPage.noEventsToImport.title"),
        message: t("timelineViewPage.noEventsToImport.message", { name: source.name }),
        confirmLabel: t("common.gotIt"),
      });
      return;
    }
    await confirm({
      title: t("timelineViewPage.importComplete.title"),
      message: t("timelineViewPage.importComplete.message", { name: source.name, count }),
      confirmLabel: t("common.gotIt"),
    });
  };

  /** 點擊分支線段上的某個位置時，把點擊處的畫布座標換算回日期，彈出子選單讓使用者選擇
   * 「時間線」（開啟這條分支的設定）或「新增事件」（在換算出的日期新增事件，比分支列的
   * 「＋新增事件」按鈕更直覺，位置跟日期一次決定） */
  const handleLineClick = (branchId: string, e: React.MouseEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    const vb = svg?.viewBox.baseVal;
    if (!rect || !vb) return;
    const scaleX = rect.width ? vb.width / rect.width : 1;
    const viewBoxX = (e.clientX - rect.left) * scaleX;
    const contentX = (viewBoxX - canvasView.x) / canvasView.scale;
    const ordinal = Math.round(xToOrdinal(contentX));
    setLineMenu({ branchId, date: ordinalToDate(calendar, ordinal), screenX: e.clientX, screenY: e.clientY });
  };

  /** 事件列表點一下要跳去的位置：置中縮放到事件所在的那一小段時間，範圍固定用內容座標的寬度
   * （不是按 ordinalRange 的比例），這樣不管時間線本身橫跨的是幾天還是幾千年，點下去都是同一個
   * 「比全覽再放大一截、看得到附近其他事件跟格線」的合理縮放程度，而不是動不動就放大到底 */
  const JUMP_FOCUS_SPAN = 80;
  const jumpToEvent = (e: (typeof events)[number]) => {
    const ex = x(representativeOrdinal(e));
    const ey = laneY(e.branchId);
    jumpTokenRef.current += 1;
    setJumpToRange({ x1: ex - JUMP_FOCUS_SPAN / 2, x2: ex + JUMP_FOCUS_SPAN / 2, y: ey, token: jumpTokenRef.current });
  };

  const handleDeleteBranch = async (branchId: string) => {
    const branch = branchById.get(branchId);
    if (!branch) return;
    const impact = await countBranchDeletionImpact(timeline.id, branchId);
    const ok = await confirm({
      title: t("timelineViewPage.deleteBranchConfirm.title"),
      message: t("timelineViewPage.deleteBranchConfirm.message", { name: branch.name, branchCount: impact.branchCount, eventCount: impact.eventCount }),
    });
    if (!ok) return;
    await deleteBranchCascade(timeline.id, branchId);
  };

  const openEvent = openEventId ? events.find((e) => e.id === openEventId) : undefined;
  const editingBranch = editingBranchId ? branchById.get(editingBranchId) : undefined;

  return (
    <>
      <CanvasWorkbench
        embedded={embedded}
        titleBar={
          <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {editing ? (
            <input
              autoFocus
              style={{ fontSize: 20, fontFamily: "var(--font-serif)", width: "100%" }}
              value={metaDraft?.name ?? ""}
              onChange={(e) => setMetaDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          ) : (
            <h2 style={{ margin: 0 }}>{timeline.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "timeline", timelineId: timeline.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("entryCard.star")}
            onClick={() => toggleTimelineStar(timeline.id)}
            style={{ color: timeline.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {timeline.starred ? "★" : "☆"}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("timelineViewPage.titleColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSaveMeta}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setShowExport(true)}>
                {t("entryPage.exportManuscript")}
              </button>
              <button className="btn" onClick={() => setShowHistory(true)}>
                {t("common.versionHistory")}
              </button>
              <button className="btn btn-primary" onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={handleDeleteTimeline}>
                {t("common.delete")}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <>
          <input
            style={{ width: "100%", marginBottom: 8 }}
            placeholder={t("timelineViewPage.descriptionPlaceholder")}
            value={metaDraft?.description ?? ""}
            onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>{t("timelineViewPage.viewRangeLabel")}</span>
            <input
              type="number"
              placeholder={t("timelineViewPage.startYearPlaceholder")}
              style={{ width: 140 }}
              value={metaDraft?.viewStartYear ?? ""}
              onChange={(e) =>
                setMetaDraft((d) => (d ? { ...d, viewStartYear: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } : d))
              }
            />
            <span style={{ color: "var(--text-faint)" }}>～</span>
            <input
              type="number"
              placeholder={t("timelineViewPage.endYearPlaceholder")}
              style={{ width: 140 }}
              value={metaDraft?.viewEndYear ?? ""}
              onChange={(e) =>
                setMetaDraft((d) => (d ? { ...d, viewEndYear: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } : d))
              }
            />
            <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>{t("fieldSlotEditor.precisionLabel")}</span>
            <select
              value={metaDraft?.timePrecision ?? "day"}
              onChange={(e) => setMetaDraft((d) => (d ? { ...d, timePrecision: e.target.value as DateTimePrecision } : d))}
            >
              {(Object.entries(DATE_TIME_PRECISION_LABELS) as [DateTimePrecision, TranslationKey][]).map(([precision, key]) => (
                <option key={precision} value={precision}>
                  {t(key)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-muted)" }}>{t("timelineViewPage.focusTimeLabel")}</span>
            <input
              type="number"
              placeholder={t("timelineViewPage.focusYearPlaceholder")}
              style={{ width: 140 }}
              value={metaDraft?.focusYear ?? ""}
              onChange={(e) =>
                setMetaDraft((d) =>
                  d
                    ? {
                        ...d,
                        focusYear: e.target.value === "" ? undefined : parseInt(e.target.value, 10),
                        focusEndYear: e.target.value === "" ? undefined : d.focusEndYear,
                      }
                    : d
                )
              }
            />
            <span style={{ color: "var(--text-faint)" }}>～</span>
            <input
              type="number"
              placeholder={t("timelineViewPage.focusEndYearPlaceholder")}
              style={{ width: 140 }}
              disabled={metaDraft?.focusYear === undefined}
              value={metaDraft?.focusEndYear ?? ""}
              onChange={(e) =>
                setMetaDraft((d) => (d ? { ...d, focusEndYear: e.target.value === "" ? undefined : parseInt(e.target.value, 10) } : d))
              }
            />
          </div>
        </>
      ) : (
        timeline.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>{timeline.description}</p>
      )}
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 12 }}>{t("timelineViewPage.calendarLabel", { name: calendar.name })}</p>
          </>
        }
        sidePanel={
          <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {branches.map((b) => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" }}>
            <span
              style={{ width: 10, height: 10, borderRadius: "50%", background: b.color ?? "var(--accent)", flexShrink: 0 }}
            />
            <strong>{b.name}</strong>
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("timeline.eventCount", { count: (eventsByBranch.get(b.id) ?? []).length })}</span>
            <div style={{ flex: 1 }} />
            <button className="btn-ghost" onClick={() => handleAddEventAt(b.id, ordinalToDate(calendar, forkOrdinalOf(b) ?? minOrdinal))}>
              {t("timelineViewPage.addEvent")}
            </button>
            <button className="btn-ghost" onClick={() => setImportEventTarget({ branchId: b.id })}>
              {t("timelineViewPage.importExistingEvent")}
            </button>
            <button className="btn-ghost" onClick={() => setEditingBranchId(b.id)}>
              ✎
            </button>
            <button className="btn-ghost" onClick={() => handleDeleteBranch(b.id)}>
              🗑
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setNewBranchVariant("fork")}>
            {t("timelineViewPage.addBranch")}
          </button>
          <button className="btn" onClick={() => setNewBranchVariant("independent")}>
            {t("timelinePage.addTimeline")}
          </button>
          <button className="btn" onClick={() => setShowImportTimeline(true)}>
            {t("timelineViewPage.importTimelineButton")}
          </button>
        </div>
      </div>

      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 2 }}>
        {t("timelineViewPage.displayRange", { start: baseStartYear, end: baseEndYear })}
      </p>
      <div style={{ marginBottom: 8 }}>
        <CollapsibleSection title={t("timelineViewPage.eventListTitle", { count: events.length })} defaultCollapsed={false}>
          {events.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 12, margin: 0 }}>{t("timelineViewPage.noEvents")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
              {/* 預設照時間順序排列，點一下就把畫布置中縮放到該事件所在的位置（見 jumpToEvent）——
                  時間線一長，光靠畫布捲來捲去找特定事件很沒效率，這裡當一份總覽索引 */}
              {[...events]
                .sort((a, b) => representativeOrdinal(a) - representativeOrdinal(b))
                .map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="btn-ghost"
                    onClick={() => jumpToEvent(e)}
                    title={t("timelineViewPage.jumpToEventTitle")}
                    style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "4px 6px", fontSize: 13 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: e.color ?? branchById.get(e.branchId)?.color ?? "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                    <span style={{ color: "var(--text-faint)", fontSize: 11, flexShrink: 0 }}>{branchById.get(e.branchId)?.name ?? ""}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>
                      <DateValueEditor
                        calendar={calendar}
                        mode={eventDate(e).mode}
                        value={eventDate(e)}
                        editing={false}
                        precision={timeline.timePrecision ?? "day"}
                        onChange={() => {}}
                      />
                    </span>
                  </button>
                ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
          </>
        }
        toolbar={
          !embedded ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button className={viewMode === "canvas" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("canvas")}>
                {t("timelineViewPage.canvasViewLabel")}
              </button>
              <button className={viewMode === "calendar" ? "btn btn-primary" : "btn"} onClick={() => setViewMode("calendar")}>
                {t("timelineViewPage.calendarViewLabel")}
              </button>
            </div>
          ) : undefined
        }
      >
      <div ref={canvasHostRef} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      {viewMode === "calendar" && !embedded ? (
        <TimelineCalendarView
          calendar={calendar}
          branches={branches}
          events={events}
          branchById={branchById}
          defaultYear={timeline.focusYear ?? baseStartYear}
          defaultMonthIndex={0}
          onOpenEvent={(id) => setOpenEventId(id)}
          onAddEventAt={handleAddEventAt}
        />
      ) : !(embedded || measuredCanvasSize) ? null : (
        <>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 6 }}>{t("timelineViewPage.lineClickHint")}</p>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            zIndex: 10,
            pointerEvents: "none",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 8px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{currentTimeLabel}</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{t("timelineViewPage.currentPrecisionLabel", { unit: finestUnitLabel })}</div>
        </div>
        <PannableCanvas
          width={width}
          height={height}
          contentWidth={contentWidth}
          contentHeight={contentHeight}
          grid={TIMELINE_GRID}
          showZoomInput
          maxScale={TIMELINE_MAX_SCALE}
          resetFocusRange={resetFocusRange}
          jumpToRange={jumpToRange ?? undefined}
          onViewChange={setCanvasView}
          onHover={setHover}
          screenSpaceChildren
        >
        <g>
          {yearMarks.map((y) => {
            const gx = sx(x(dateToOrdinal(calendar, { year: y, monthIndex: 0, day: 1 })));
            return (
              <g key={y}>
                <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--text-faint)" strokeWidth={1.3} />
                {/* 年份數字釘在畫面上緣附近，固定畫面像素 y=14，不用再像以前那樣反推內容座標 */}
                <text x={gx + 4} y={16} fontSize={15} fontWeight={600} fill="var(--text-muted)">
                  {t("timelineViewPage.yearGridLabel", { year: y })}
                </text>
              </g>
            );
          })}
        </g>
        {showMonthMarks && (
          <g>
            {monthMarks.map((m) => {
              const gx = sx(x(m.ordinal));
              return (
                <g key={m.ordinal}>
                  <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--border)" strokeWidth={1.2} opacity={0.85} />
                  <text x={gx + 4} y={35} fontSize={13} fill="var(--text-faint)">
                    {m.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {showDayMarks && (
          <g>
            {dayMarks.map((d) => {
              const gx = sx(x(d.ordinal));
              return (
                <g key={d.ordinal}>
                  <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--border)" strokeWidth={0.7} opacity={0.55} />
                  <text x={gx + 3} y={52} fontSize={12} fill="var(--text-faint)">
                    {t("timelineViewPage.dayGridLabel", { day: d.day })}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {showHourMarks && (
          <g>
            {hourMarks.map((h) => {
              const gx = sx(x(h.ordinal));
              return (
                <g key={h.ordinal}>
                  <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--border)" strokeWidth={0.65} opacity={0.48} />
                  <text x={gx + 3} y={69} fontSize={11} fill="var(--text-faint)">
                    {t("timelineViewPage.hourGridLabel", { hour: h.hour })}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {showMinuteMarks && (
          <g>
            {minuteMarks.map((m) => {
              const gx = sx(x(m.ordinal));
              return (
                <g key={m.ordinal}>
                  <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--border)" strokeWidth={0.55} opacity={0.4} />
                  <text x={gx + 3} y={86} fontSize={11} fill="var(--text-faint)">
                    {t("timelineViewPage.minuteGridLabel", { minute: m.minute })}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {showSecondMarks && (
          <g>
            {secondMarks.map((s) => {
              const gx = sx(x(s.ordinal));
              return (
                <g key={s.ordinal}>
                  <line x1={gx} x2={gx} y1={sy(lineContentYMin)} y2={sy(lineContentYMax)} stroke="var(--border)" strokeWidth={0.45} opacity={0.34} />
                  <text x={gx + 3} y={103} fontSize={10} fill="var(--text-faint)">
                    {t("timelineViewPage.secondGridLabel", { second: s.second })}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        <g style={{ pointerEvents: "none" }}>
          {lifeBands.flatMap((band) => {
            const bandTop = sy(laneY(band.branchId) - LANE_HEIGHT / 2);
            const bandBottom = sy(laneY(band.branchId) + LANE_HEIGHT / 2);
            const rects: React.ReactNode[] = [];
            const beforeBirthEnd = band.conceptionOrdinal ?? band.birthOrdinal;
            if (beforeBirthEnd > lineOrdinalMin) {
              rects.push(
                <rect
                  key={`${band.branchId}-before`}
                  x={sx(x(lineOrdinalMin))}
                  y={bandTop}
                  width={sx(x(beforeBirthEnd)) - sx(x(lineOrdinalMin))}
                  height={bandBottom - bandTop}
                  fill="#888888"
                  opacity={0.08}
                />
              );
            }
            if (band.conceptionOrdinal !== undefined) {
              rects.push(
                <rect
                  key={`${band.branchId}-pregnancy`}
                  x={sx(x(band.conceptionOrdinal))}
                  y={bandTop}
                  width={Math.max(0, sx(x(band.birthOrdinal)) - sx(x(band.conceptionOrdinal)))}
                  height={bandBottom - bandTop}
                  fill="#e08283"
                  opacity={0.15}
                />
              );
            }
            if (band.deathOrdinal !== undefined) {
              rects.push(
                <rect
                  key={`${band.branchId}-after`}
                  x={sx(x(band.deathOrdinal))}
                  y={bandTop}
                  width={Math.max(0, sx(x(lineOrdinalMax)) - sx(x(band.deathOrdinal)))}
                  height={bandBottom - bandTop}
                  fill="#4a5568"
                  opacity={0.18}
                />
              );
            }
            return rects;
          })}
        </g>
        <g>
          {branches.map((b) => (
            <g key={b.id}>
              {/* 較粗的透明線疊在視覺線上方，加大可點擊範圍，讓使用者不用精準點在細線上才能新增事件 */}
              <line
                x1={sx(laneStartX(b))}
                x2={sx(laneEndX(b))}
                y1={sy(laneY(b.id))}
                y2={sy(laneY(b.id))}
                stroke={b.color ?? "var(--accent)"}
                strokeWidth={b.parentBranchId ? 2 : 3}
                style={{ pointerEvents: "none" }}
              />
              <line
                x1={sx(laneStartX(b))}
                x2={sx(laneEndX(b))}
                y1={sy(laneY(b.id))}
                y2={sy(laneY(b.id))}
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: "pointer" }}
                onClick={(e) => handleLineClick(b.id, e)}
              />
            </g>
          ))}
        </g>
        <g>
          {branches
            .filter((b) => b.parentBranchId)
            .map((b) => (
              <path
                key={b.id}
                d={branchPath(sx(laneStartX(b)), sy(laneY(b.parentBranchId!)), sx(laneStartX(b)), sy(laneY(b.id)), "curved")}
                stroke={b.color ?? "var(--accent)"}
                strokeWidth={2}
                fill="none"
                style={{ pointerEvents: "none" }}
              />
            ))}
        </g>
        <g>
          {branches.map((b) => (
            <text
              key={b.id}
              x={sx(laneStartX(b)) - 6}
              y={sy(laneY(b.id)) - 10}
              fontSize={12}
              textAnchor="end"
              fill="var(--text-muted)"
              style={{ pointerEvents: "none" }}
            >
              {b.name}
            </text>
          ))}
        </g>
        <g>
          {events.flatMap((e) => {
            const d = eventDate(e);
            const ey = sy(laneY(e.branchId));
            const color = e.color ?? branchById.get(e.branchId)?.color ?? "var(--accent)";
            const openEditor = () => setOpenEventId(e.id);

            if (d.mode === "single") {
              const ex = sx(x(ordinalOf(e)));
              const tier = eventLabelTier.get(e.id) ?? 0;
              return [
                <g key={e.id} onClick={openEditor} style={{ cursor: "pointer" }}>
                  <circle cx={ex} cy={ey} r={6} fill={color} />
                  <text x={ex} y={ey + 22 + tier * 14} fontSize={12} textAnchor="middle" fill="var(--text)">
                    {e.name}
                  </text>
                </g>,
              ];
            }

            if (d.mode === "range") {
              // 持續型事件不疊在車道線本身上面，改畫在車道線下方一小段獨立的「有頭有尾」的迷你時間線：
              // 一條橫線代表持續期間，頭尾各一條短直線當端點；沒有結束日期（至今仍在延續）就把尾端
              // 端點換成一個箭頭，跟「已經結束」的區間用視覺區隔開
              const startOrdinal = dateToOrdinal(calendar, d.start);
              const endOrdinal = d.end ? dateToOrdinal(calendar, d.end) : maxOrdinal;
              const rawX1 = sx(x(startOrdinal));
              const rawX2 = sx(x(endOrdinal));
              const rangeX1 = Math.min(rawX1, rawX2);
              const rangeX2 = Math.max(rawX1, rawX2);
              // 往下多留一段（比單一時間事件的標籤行 ey+22 更低），避免持續期間的橫線正好從
              // 同一車道上單一時間事件的名稱文字中間穿過去——單一時間事件的標籤固定畫在 ey+22
              // 那一行，這裡刻意錯開一整行
              const rangeY = ey + 38;
              const capHalf = 5;
              return [
                <g key={e.id} onClick={openEditor} style={{ cursor: "pointer" }}>
                  <line x1={rangeX1} x2={rangeX2} y1={rangeY} y2={rangeY} stroke={color} strokeWidth={3} />
                  <line x1={rangeX1} x2={rangeX1} y1={rangeY - capHalf} y2={rangeY + capHalf} stroke={color} strokeWidth={2} />
                  {d.end ? (
                    <line x1={rangeX2} x2={rangeX2} y1={rangeY - capHalf} y2={rangeY + capHalf} stroke={color} strokeWidth={2} />
                  ) : (
                    <text x={rangeX2 + 4} y={rangeY + 4} fontSize={12} fill={color}>
                      →
                    </text>
                  )}
                  <text x={rangeX1} y={rangeY + 16} fontSize={12} textAnchor="start" fill="var(--text)">
                    {e.name}
                    {!d.end && t("timelineViewPage.ongoingSuffix")}
                  </text>
                </g>,
              ];
            }

            // 固定性：在可視年份範圍內展開每次發生的日期，畫小菱形標記跟單一時間的圓點區隔開；
            // 全部點擊都開啟同一個底層事件的編輯器，名稱只在第一個可視發生點顯示一次避免擠成一團
            const occurrences = recurringOccurrenceOrdinals(calendar, d, minYear, maxYear);
            return occurrences.map((ord, i) => {
              const ex = sx(x(ord));
              return (
                <g key={`${e.id}-${i}`} onClick={openEditor} style={{ cursor: "pointer" }}>
                  <rect x={ex - 4} y={ey - 4} width={8} height={8} fill={color} transform={`rotate(45 ${ex} ${ey})`} />
                  {i === 0 && (
                    <text x={ex} y={ey + 22} fontSize={12} textAnchor="middle" fill="var(--text)">
                      {e.name}
                    </text>
                  )}
                </g>
              );
            });
          })}
        </g>
        <TimelineHoverOverlay
          calendar={calendar}
          precision={currentPrecision}
          hover={hover}
          sx={sx}
          sy={sy}
          x={x}
          xToOrdinal={xToOrdinal}
          ordinalRange={ordinalRange}
          contentHeight={contentHeight}
          events={events}
          viewportLeftX={x(viewportOrdinalMin)}
          viewportRightX={x(viewportOrdinalMax)}
        />
        </PannableCanvas>
      </div>
        </>
      )}
      </div>
      </CanvasWorkbench>

      {newBranchVariant && (
        <TimelineBranchDialog
          worldId={worldId}
          calendar={calendar}
          branches={branches}
          variant={newBranchVariant}
          defaultDivergeYear={timeline.viewStartYear}
          onClose={() => setNewBranchVariant(null)}
          onSubmit={async (input) => {
            await createBranch(timeline.id, input);
            setNewBranchVariant(null);
          }}
        />
      )}
      {lineMenu &&
        createPortal(
          <LineClickMenu
            menu={lineMenu}
            onClose={() => setLineMenu(null)}
            onEditBranch={() => {
              setEditingBranchId(lineMenu.branchId);
              setLineMenu(null);
            }}
            onAddEvent={() => {
              handleAddEventAt(lineMenu.branchId, lineMenu.date);
              setLineMenu(null);
            }}
            onImportEvent={() => {
              setImportEventTarget({ branchId: lineMenu.branchId });
              setLineMenu(null);
            }}
          />,
          document.body
        )}
      {importEventTarget && (
        <ImportEventEntryDialog
          worldId={worldId}
          onClose={() => setImportEventTarget(null)}
          onSelect={(entry) => handleImportEvent(importEventTarget.branchId, entry)}
        />
      )}
      {showImportTimeline && (
        <ImportTimelineDialog
          worldId={worldId}
          excludeTimelineId={timeline.id}
          onClose={() => setShowImportTimeline(false)}
          onSelect={handleImportTimeline}
        />
      )}
      {editingBranch && (
        <TimelineBranchDialog
          worldId={worldId}
          calendar={calendar}
          branches={branches}
          branch={editingBranch}
          onClose={() => setEditingBranchId(null)}
          onSubmit={async (input) => {
            await updateBranch(editingBranch.id, {
              name: input.name,
              color: input.color,
              endYear: input.endYear,
              endMonthIndex: input.endMonthIndex,
              endDay: input.endDay,
            });
            setEditingBranchId(null);
          }}
        />
      )}
      {openEvent && (
        <TimelineEventEditorModal
          event={openEvent}
          worldId={worldId}
          calendar={calendar}
          timePrecision={timeline.timePrecision}
          branchColor={branchById.get(openEvent.branchId)?.color}
          onClose={() => setOpenEventId(null)}
          onSave={(patch) => updateEvent(openEvent.id, patch)}
          onDelete={() => deleteEvent(openEvent.id)}
        />
      )}
      {showExport && (
        <ManuscriptExportDialog
          manuscript={timelineToManuscript(timeline, branches, events, calendar, exportCtx, currentLocalUser?.name, t)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="timelines" entityId={timeline.id} onClose={() => setShowHistory(false)} />}
    </>
  );
}

const LINE_MENU_MARGIN = 8;

/** 點擊分支線段後彈出的小選單：「時間線」開啟這條分支的設定（同分支列的 ✎ 按鈕），
 * 「新增事件」在點擊處換算出的日期新增事件（原本點線段直接建事件的行為，改成先選過一次）。
 * 定位／關閉方式比照 DropdownMenu：fixed + portal 掛到 body，點擊外部或按 Escape 關閉 */
function LineClickMenu({
  menu,
  onClose,
  onEditBranch,
  onAddEvent,
  onImportEvent,
}: {
  menu: { screenX: number; screenY: number };
  onClose: () => void;
  onEditBranch: () => void;
  onAddEvent: () => void;
  onImportEvent: () => void;
}) {
  useEffect(() => pushEscapeHandler(onClose), [onClose]);
  const { t } = useLanguage();

  const menuWidth = 150;
  const left = Math.min(Math.max(LINE_MENU_MARGIN, menu.screenX), window.innerWidth - menuWidth - LINE_MENU_MARGIN);
  const top = Math.min(menu.screenY, window.innerHeight - 126);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9000 }} onClick={onClose} />
      <div
        className="card"
        style={{ position: "fixed", left, top, zIndex: 9001, padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: menuWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn-ghost" style={{ textAlign: "left" }} onClick={onEditBranch}>
          {t("lineClickMenu.timelineSettings")}
        </button>
        <button className="btn-ghost" style={{ textAlign: "left" }} onClick={onAddEvent}>
          {t("lineClickMenu.addEvent")}
        </button>
        <button className="btn-ghost" style={{ textAlign: "left" }} onClick={onImportEvent}>
          {t("timelineViewPage.importExistingEvent")}
        </button>
      </div>
    </>
  );
}
