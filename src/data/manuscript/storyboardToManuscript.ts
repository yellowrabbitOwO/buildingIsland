import type { Storyboard, StoryboardCard, StoryboardLane } from "../types";
import type { ManuscriptBlock, ManuscriptDoc } from "./manuscriptIR";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** 這個檔案裡的函式沒收到 t 時的預設行為：固定顯示中文，與這批函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

const UNASSIGNED_LANE_ID = "";

function cardToBlocks(card: StoryboardCard, entryNameById: Map<string, string>, t: TFn): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [{ kind: "heading", level: 3, runs: [{ text: card.title || t("storyboardCardEditorModal.unnamedCard") }] }];
  const meta: string[] = [];
  if (card.time) meta.push(`${t("storyboardToManuscript.timeLabel")}${card.time}`);
  if (card.location) meta.push(`${t("storyboardToManuscript.locationLabel")}${card.location}`);
  if (meta.length > 0) blocks.push({ kind: "paragraph", runs: [{ text: meta.join("／"), italic: true }] });
  if (card.relatedEntryIds.length > 0) {
    const names = card.relatedEntryIds.map((id) => entryNameById.get(id) ?? t("common.deletedEntry")).join("、");
    blocks.push({ kind: "paragraph", runs: [{ text: t("storyboardToManuscript.relatedEntriesLabel"), bold: true }, { text: names }] });
  }
  if (card.content) blocks.push({ kind: "paragraph", runs: [{ text: card.content }] });
  if (card.emotionalTurn)
    blocks.push({ kind: "paragraph", runs: [{ text: t("storyboardCardChip.emotionalTurnLabel"), bold: true }, { text: card.emotionalTurn }] });
  if (card.conflict) blocks.push({ kind: "paragraph", runs: [{ text: t("storyboardCardChip.conflictLabel"), bold: true }, { text: card.conflict }] });
  return blocks;
}

/** 依 storyboard.lanes（依 order 排序）逐一走訪，每個 lane 底下的卡片依 order 排序，
 * 最後補未分類（laneId === ""）的卡片——順序比照 StoryboardViewPage.tsx 畫面上的既有排法。
 * StoryboardCard 的內容欄位（content/emotionalTurn/conflict）都是純字串，不是 TipTap，
 * 不需要 fieldsToBlocks／docToBlocks 那一套 */
export function storyboardToManuscript(
  storyboard: Storyboard,
  cards: StoryboardCard[],
  entryNameById: Map<string, string>,
  author?: string,
  t: TFn = fallbackT
): ManuscriptDoc {
  const cardsByLane = new Map<string, StoryboardCard[]>();
  for (const c of cards) {
    if (!cardsByLane.has(c.laneId)) cardsByLane.set(c.laneId, []);
    cardsByLane.get(c.laneId)!.push(c);
  }
  for (const list of cardsByLane.values()) list.sort((a, b) => a.order - b.order);

  const blocks: ManuscriptBlock[] = [];
  if (storyboard.description) blocks.push({ kind: "paragraph", runs: [{ text: storyboard.description, italic: true }] });

  const sortedLanes: StoryboardLane[] = [...storyboard.lanes].sort((a, b) => a.order - b.order);
  for (const lane of sortedLanes) {
    const laneCards = cardsByLane.get(lane.id) ?? [];
    if (laneCards.length === 0) continue;
    blocks.push({ kind: "heading", level: 2, runs: [{ text: lane.name }] });
    for (const card of laneCards) blocks.push(...cardToBlocks(card, entryNameById, t));
  }
  const unassigned = cardsByLane.get(UNASSIGNED_LANE_ID) ?? [];
  if (unassigned.length > 0) {
    blocks.push({ kind: "heading", level: 2, runs: [{ text: t("entryCard.unfiled") }] });
    for (const card of unassigned) blocks.push(...cardToBlocks(card, entryNameById, t));
  }

  return { title: storyboard.name, author, blocks };
}
