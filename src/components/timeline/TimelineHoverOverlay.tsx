import { ordinalToDate } from "../../data/calendarMath";
import { eventPrimaryOrdinal } from "../../data/timelineEventOrdinals";
import { eventDate } from "../../data/repositories/timelineEvent";
import { buildCharacterEndpoints, computeAgeAt, formatAge } from "../../data/characterAge";
import { formatDate } from "../common/DateValueEditor";
import type { Calendar, DateTimePrecision, TimelineEvent } from "../../data/types";
import { useLanguage } from "../../i18n";

/** 附近事件的判斷門檻：可視範圍（ordinalRange）的一小段比例，而非固定像素距離——這樣不論縮放
 * 多少，「游標附近」給人的感覺都一致（縮得很小時附近範圍自然跟著收窄，避免抓到整條線上一大票事件） */
const NEARBY_ORDINAL_FRACTION = 0.012;
const MAX_NEARBY_EVENTS = 6;
const MAX_CHARACTER_STATUSES = 8;

interface TimelineHoverOverlayProps {
  calendar: Calendar;
  /** 目前縮放層級能看到的最細時間單位（比照 TimelineViewPage 本體的定位牌），提示框的日期要顯示到
   * 同一個精細度，而不是固定只到日——放大到看得到時/分/秒刻度時，游標旁邊的提示也該跟著顯示 */
  precision: DateTimePrecision;
  /** PannableCanvas onHover 回報的內容座標；null 代表游標不在畫布上 */
  hover: { x: number; y: number } | null;
  /** 把內容座標換算成最終螢幕座標（比照 TimelineViewPage 本體的 sx/sy，同一份精度懸崖問題，同一種
   * 解法：這裡畫的線/圓點/提示框全部改用固定像素大小，不再依賴縮放比例反向縮放） */
  sx: (contentX: number) => number;
  sy: (contentY: number) => number;
  x: (ordinal: number) => number;
  xToOrdinal: (px: number) => number;
  ordinalRange: number;
  contentHeight: number;
  events: TimelineEvent[];
  /** 目前畫布實際看得到的內容座標範圍（左右緣），供提示框判斷會不會超出可視範圍——超出右緣就
   * 翻到游標左側顯示，而不是被畫布邊界（尤其是嵌入角色資訊卡那種較窄的畫布）直接裁掉看不到內容 */
  viewportLeftX: number;
  viewportRightX: number;
}

/** 時間軸畫布的游標懸浮提示：跟著游標畫一條垂直參考線，換算出游標位置對應的日期，並列出附近的
 * 事件、以及（若這條時間線上有角色自動事件）每個角色當下的生命階段（出生前／胎兒期／幾歲／死後）。
 * 跟 TimelineViewPage 本體共用同一份邏輯（角色資訊卡上嵌入的也是同一個 TimelineViewPage） */
export default function TimelineHoverOverlay({
  calendar,
  precision,
  hover,
  sx,
  sy,
  x,
  xToOrdinal,
  ordinalRange,
  contentHeight,
  events,
  viewportLeftX,
  viewportRightX,
}: TimelineHoverOverlayProps) {
  const { t } = useLanguage();
  if (!hover) return null;

  const ordinal = xToOrdinal(hover.x);
  const date = ordinalToDate(calendar, ordinal);
  const guideX = sx(x(ordinal));
  const tolerance = Math.max(1, ordinalRange * NEARBY_ORDINAL_FRACTION);

  const nearbyEvents = events
    .map((e) => ({ event: e, distance: Math.abs(eventPrimaryOrdinal(calendar, eventDate(e)) - ordinal) }))
    .filter((n) => n.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_NEARBY_EVENTS)
    .map((n) => n.event);

  const characterStatuses = buildCharacterEndpoints(calendar, events)
    .map((c) => ({ name: c.name, text: formatAge(computeAgeAt(calendar, c.birth, c.config, date), t) }))
    .filter((c): c is { name: string; text: string } => c.text !== null)
    .slice(0, MAX_CHARACTER_STATUSES);

  const lines = [
    `${calendar.name}${formatDate(calendar, date, precision, t)}`,
    ...nearbyEvents.map((e) => t("timelineHoverOverlay.nearbyEventPrefix", { name: e.name })),
    ...characterStatuses.map((c) => t("timelineHoverOverlay.characterStatusLine", { name: c.name, text: c.text })),
  ];

  // 畫面上的東西（提示框、參考線、字級）改用固定像素大小，不用再乘縮放係數反向抵銷——連帶把
  // 游標/可視範圍換算成螢幕座標，跟這裡固定像素的框體大小維持同一個座標系比較不會算錯
  const fontSize = 12;
  const lineHeight = 17;
  const padding = 8;
  const boxWidth = Math.max(...lines.map((l) => l.length)) * fontSize * 0.62 + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 1.5;
  const gap = 12;
  const hoverScreenX = sx(hover.x);
  const hoverScreenY = sy(hover.y);
  const viewportLeftScreenX = sx(viewportLeftX);
  const viewportRightScreenX = sx(viewportRightX);
  // 提示框預設畫在游標右側／上方；超出畫布目前看得到的右緣就翻到左側，超出上緣就翻到下方——
  // 嵌入角色資訊卡那種較窄較矮的畫布很容易游標一靠邊，框就整個被裁掉看不到內容
  const overflowsRight = hoverScreenX + gap + boxWidth > viewportRightScreenX;
  const boxX = overflowsRight ? Math.max(viewportLeftScreenX, hoverScreenX - gap - boxWidth) : hoverScreenX + gap;
  const overflowsTop = hoverScreenY - boxHeight - gap < 0;
  const boxY = overflowsTop ? hoverScreenY + gap : hoverScreenY - boxHeight - gap;

  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={guideX} x2={guideX} y1={sy(0)} y2={sy(contentHeight)} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 4" />
      <circle cx={hoverScreenX} cy={hoverScreenY} r={2.5} fill="var(--accent)" />
      <rect x={boxX} y={boxY} width={boxWidth} height={boxHeight} rx={4} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1} />
      {lines.map((line, i) => (
        <text
          key={i}
          x={boxX + padding}
          y={boxY + padding + fontSize + i * lineHeight}
          fontSize={fontSize}
          fontWeight={i === 0 ? 700 : 400}
          fill={i === 0 ? "var(--text)" : "var(--text-muted)"}
        >
          {line}
        </text>
      ))}
    </g>
  );
}
