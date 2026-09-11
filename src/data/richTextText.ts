/** TipTap／ProseMirror 文件 JSON 裡的節點形狀，只取得到這個工具函式在意的欄位 */
interface ProseMirrorNode {
  type?: string;
  text?: string;
  content?: ProseMirrorNode[];
}

/** 遞迴走過 ProseMirror JSON 節點樹，把所有文字節點串接成純文字；區塊節點（段落／標題等）之間補換行，
 * 供字數計算與清單頁／主世界預覽卡片的摘要文字共用，不用為了抽文字另外掛一個完整的 TipTap editor instance */
export function extractPlainText(content: object | undefined): string {
  if (!content) return "";
  const node = content as ProseMirrorNode;
  const parts: string[] = [];

  const walk = (n: ProseMirrorNode) => {
    if (n.type === "text" && n.text) {
      parts.push(n.text);
      return;
    }
    n.content?.forEach(walk);
    if (n.content?.length && n.type !== "text") parts.push("\n");
  };

  walk(node);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** 字數：純文字字元數，不含 extractPlainText 為了可讀性補上的段落換行，
 * 比照專案既有慣例（如 Passage.body.length）直接數字元、不特別處理英文斷詞 */
export function countWords(content: object | undefined): number {
  return extractPlainText(content).replace(/\n/g, "").length;
}
