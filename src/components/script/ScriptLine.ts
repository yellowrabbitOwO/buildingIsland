import { mergeAttributes } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { scriptManualSetKey } from "./ScriptAutoFormat";
import type { ScriptLineType } from "./scriptLineTypes";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    scriptLine: {
      setScriptLineType: (lineType: ScriptLineType) => ReturnType;
    };
  }
}

/** 劇本編輯器裡的一行：延續 TipTap 內建 Paragraph 的 schema（group:"block", content:"inline*"），
 * 只多掛 lineType（場景/動作/角色/對白/括號說明/轉場/置中）與 manualOverride（使用者手動指定過，
 * ScriptAutoFormat 的自動分類要跳過這一行）兩個屬性；不用另外刻一個自訂 Document 節點——
 * 停用 StarterKit 的預設 paragraph 之後，doc 的 content:"block+" 底下唯一剩下的 block 群組成員
 * 就是這個節點，效果等同專用文件結構，但沿用了 Paragraph 內建的分割/合併鍵盤行為 */
export const ScriptLine = Paragraph.extend({
  name: "scriptLine",

  addAttributes() {
    return {
      lineType: {
        default: "action" as ScriptLineType,
        parseHTML: (el) => el.getAttribute("data-line-type") ?? "action",
        renderHTML: (attrs) => ({ "data-line-type": attrs.lineType }),
      },
      manualOverride: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-manual-override") === "true",
        renderHTML: (attrs) => (attrs.manualOverride ? { "data-manual-override": "true" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { class: "script-line" }), 0];
  },

  addCommands() {
    return {
      setScriptLineType:
        (lineType: ScriptLineType) =>
        ({ tr, dispatch }) => {
          // 直接鎖定選取範圍「起點」所在的那一行，不透過 updateAttributes——updateAttributes 對非
          // 收合選取範圍是掃過範圍內每一個符合型別的節點各自套用，使用者從一行拖曳選取到下一行時
          // 會連相鄰、沒打算更動的那一行也被改掉
          const { $from } = tr.selection;
          const pos = $from.before($from.depth);
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== this.name) return false;
          if (dispatch) {
            tr.setNodeAttribute(pos, "lineType", lineType);
            tr.setNodeAttribute(pos, "manualOverride", true);
            // 告訴 ScriptAutoFormat 這個 transaction 是剛手動設定的，這次 pass 不要把類型／
            // manualOverride 蓋回去——即使游標當時在空行上（isEmpty）也一樣
            tr.setMeta(scriptManualSetKey, true);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection;
        const atEnd = $from.parentOffset === $from.parent.content.size;
        // 行尾按 Enter：ProseMirror 預設分割行為本來就會給新行乾淨的預設屬性，不用介入
        if (atEnd) return false;
        // 行中間（非行尾）按 Enter：ProseMirror 預設分割行為會把這一行目前的 lineType/manualOverride
        // 原封不動複製到新分出來的下半段（即使文字內容完全不同）——分割後在同一個 transaction 內
        // 立刻把新行重設回預設值，讓它跟一般新建的空行一樣重新交給自動分類器判斷
        return this.editor
          .chain()
          .splitBlock()
          .command(({ tr, dispatch }) => {
            if (dispatch) {
              const { $from: newFrom } = tr.selection;
              const pos = newFrom.before(newFrom.depth);
              tr.setNodeAttribute(pos, "lineType", "action");
              tr.setNodeAttribute(pos, "manualOverride", false);
            }
            return true;
          })
          .run();
      },
    };
  },
});
