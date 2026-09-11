import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { classifyLine } from "./classifyScriptLine";
import type { ScriptLineType } from "./scriptLineTypes";

const scriptAutoFormatKey = new PluginKey("scriptAutoFormat");

/** setScriptLineType（ScriptLine.ts）用來標記「這個 transaction 剛手動設定了某一行的類型」的
 * meta key，讓下面的 appendTransaction 在同一個 pass 內不要把使用者剛選的類型／覆寫標記蓋回去——
 * 跟 scriptAutoFormatKey（純粹擋自己補的 transaction 別再重跑）用途不同，不能共用同一把 key，
 * 否則「剛手動設定」的 transaction 會被誤判成「已經是自動修正結果」而整個跳過分類、殃及其他行 */
export const scriptManualSetKey = new PluginKey("scriptManualSet");

/**
 * 每個 scriptLine 節點打字後即時重新分類。單一左到右遍歷，把剛算出來的類型當作下一行的
 * prevType（不是讀節點自己存的舊屬性）——這樣「刪掉角色名，後面的對白該掉回動作」這種連鎖效果
 * 一次遍歷就能處理，不用另外抓「哪幾行文字變了」。setNodeAttribute 只改屬性不動內容，
 * 位置映射是恆等的，游標不會跳；用兩個不同的 meta 分別擋「自己補的 transaction 別再跑一次」
 * （scriptAutoFormatKey，只有這個 plugin 自己認得）跟「這個屬性變化不要佔一個 Undo 步驟」
 * （addToHistory，ProseMirror history 套件認得的標準 key），兩者用途不同、缺一不可。
 */
export const ScriptAutoFormat = Extension.create({
  name: "scriptAutoFormat",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: scriptAutoFormatKey,
        appendTransaction(transactions, _oldState, newState) {
          if (transactions.every((tr) => tr.getMeta(scriptAutoFormatKey))) return null;
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // 剛手動設定過某一行類型的 transaction：這個 pass 不要把使用者剛選的類型／manualOverride
          // 蓋回去，就算游標當時在空行上也一樣——否則工具列按鈕在空行上點擊會立刻被下面的分類/清除
          // 邏輯蓋掉，形同沒反應
          const justManuallySet = transactions.some((tr) => tr.getMeta(scriptManualSetKey));

          const tr = newState.tr;
          let prevType: ScriptLineType | null = null;
          let prevEmpty = true;
          let changed = false;

          newState.doc.forEach((node, pos) => {
            if (node.type.name !== "scriptLine") return;
            const text = node.textContent;
            // 用 trim() 判斷是否為空行，跟 classifyLine 自己判斷「是不是空行」的定義一致——
            // 否則只留一個空格的行，這裡跟 classifyLine 內部會得出不同答案，導致覆寫清不掉、
            // 角色名偵測（靠 prevLineEmpty 判斷前一行是否為空行）也跟著失靈
            const isEmpty = text.trim().length === 0;
            const currentType = node.attrs.lineType as ScriptLineType;
            const hasOverride = node.attrs.manualOverride === true && (!isEmpty || justManuallySet);

            const type = hasOverride ? currentType : classifyLine(text, prevType, prevEmpty);

            if (type !== currentType) {
              tr.setNodeAttribute(pos, "lineType", type);
              changed = true;
            }
            if (isEmpty && node.attrs.manualOverride === true && !justManuallySet) {
              tr.setNodeAttribute(pos, "manualOverride", false);
              changed = true;
            }

            prevType = type;
            prevEmpty = isEmpty;
          });

          if (!changed) return null;
          tr.setMeta(scriptAutoFormatKey, true);
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});
