import type { ScriptLineType } from "./scriptLineTypes";

const SCENE_HEADING_RE = /^(int|ext|est|int\.?\/ext|i\/e)[./]/i;
const TRANSITION_RE = /^(fade (in|out)[:.]|[a-z0-9 .'-]+to:)$/i;
const PARENTHETICAL_RE = /^\(.*\)$/;

/** 整行都是大寫字母（允許數字/標點/空白），且至少含一個字母 */
function isAllCaps(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text);
}

/**
 * 依 Fountain 慣例判斷一行劇本文字該屬於哪種行類型。純函式，不依賴 ProseMirror——
 * `prevType`/`prevLineEmpty` 是「上一行剛算出來的分類結果」與「上一行文字是否為空」，
 * 呼叫端（ScriptAutoFormat）必須左到右單一遍歷、把這次算出來的結果餵給下一行，
 * 這樣「刪掉角色名，後面的對白該掉回動作」這種連鎖效果才能在一次遍歷內正確處理。
 */
export function classifyLine(
  text: string,
  prevType: ScriptLineType | null,
  prevLineEmpty: boolean
): ScriptLineType {
  const trimmed = text.trim();

  // 空行：緊接在角色名／括號說明後面的空行，還沒打字就先預覽成對白縮排（讓使用者按 Enter 後立刻看到
  // 對白樣式）；但緊接在「對白」後面的空行不能同樣處理——比照 Fountain 慣例，空行代表對白區塊已經結束，
  // 這裡如果仍分類成 dialogue，下面規則6會讓空行後面接的動作句誤判成對白的延續，永遠掉不出對白區塊
  if (trimmed.length === 0) {
    return prevType === "character" || prevType === "parenthetical" ? "dialogue" : "action";
  }

  if (SCENE_HEADING_RE.test(trimmed)) return "sceneHeading";

  // Fountain 慣例要求轉場整行必須是大寫（跟角色名判斷一樣用 isAllCaps），否則像
  // "He turns to:" 這種一般英文句尾剛好接 to: 也會被誤判成轉場
  if (TRANSITION_RE.test(trimmed) && isAllCaps(trimmed)) return "transition";

  // 括號說明要排在角色名判斷之前——(V.O.)／(O.S.)／(CONT'D) 這類劇本業界常見的
  // 全大寫括號說明本身也會通過 isAllCaps，順序反過來會被誤判成角色名
  if (PARENTHETICAL_RE.test(trimmed)) return "parenthetical";

  // 角色名：整行大寫，且前一行是空行（或本身是文件第一行）——比照 Fountain 慣例，
  // 不能只看「前一行不是對白」，否則接在一般動作句後面的全大寫短句（例如「SILENCE.」）會被誤判成角色名
  if (prevLineEmpty && isAllCaps(trimmed)) return "character";

  if (prevType === "character" || prevType === "dialogue" || prevType === "parenthetical") return "dialogue";

  return "action";
}
