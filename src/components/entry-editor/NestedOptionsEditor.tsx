import { newId } from "../../data/db";
import type { NestedOptionNode } from "../../data/types";
import { useConfirm } from "../common/ConfirmProvider";
import { useLanguage } from "../../i18n";

interface NestedOptionsEditorProps {
  options: NestedOptionNode[];
  onChange: (options: NestedOptionNode[]) => void;
}

function countDescendants(node: NestedOptionNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/** 巢狀欄位「手動編輯選項」用的遞迴樹狀編輯器：每一層可新增同層選項／子選項／移除 */
export default function NestedOptionsEditor({ options, onChange }: NestedOptionsEditorProps) {
  const confirm = useConfirm();
  return <NodeList nodes={options} onChange={onChange} depth={0} confirm={confirm} />;
}

function NodeList({
  nodes,
  onChange,
  depth,
  confirm,
}: {
  nodes: NestedOptionNode[];
  onChange: (nodes: NestedOptionNode[]) => void;
  depth: number;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const { t } = useLanguage();
  const updateNode = (id: string, updater: (n: NestedOptionNode) => NestedOptionNode) => {
    onChange(nodes.map((n) => (n.id === id ? updater(n) : n)));
  };
  const removeNode = async (n: NestedOptionNode) => {
    const descendantCount = countDescendants(n);
    if (descendantCount > 0) {
      const ok = await confirm({
        title: t("nestedOptionsEditor.removeConfirm.title"),
        message: t("nestedOptionsEditor.removeConfirm.message", {
          label: n.label || t("common.unnamed"),
          count: descendantCount,
        }),
        confirmLabel: t("nestedOptionsEditor.removeConfirm.confirmLabel"),
      });
      if (!ok) return;
    }
    onChange(nodes.filter((x) => x.id !== n.id));
  };
  const addSibling = () => onChange([...nodes, { id: newId(), label: "", children: [] }]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: depth > 0 ? 16 : 0 }}>
      {nodes.map((n) => (
        <div key={n.id}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{ flex: 1, fontSize: 13 }}
              placeholder={t("common.optionNamePlaceholder")}
              value={n.label}
              onChange={(e) => updateNode(n.id, (node) => ({ ...node, label: e.target.value }))}
            />
            <button
              className="btn-ghost"
              style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() =>
                updateNode(n.id, (node) => ({
                  ...node,
                  children: [...node.children, { id: newId(), label: "", children: [] }],
                }))
              }
            >
              {t("nestedOptionsEditor.addSubOption")}
            </button>
            <button
              className="btn-ghost"
              style={{ flexShrink: 0 }}
              onClick={() => removeNode(n)}
              title={t("nestedOptionsEditor.removeOptionTitle")}
            >
              ✕
            </button>
          </div>
          {n.children.length > 0 && (
            <NodeList
              nodes={n.children}
              onChange={(children) => updateNode(n.id, (node) => ({ ...node, children }))}
              depth={depth + 1}
              confirm={confirm}
            />
          )}
        </div>
      ))}
      <button className="btn-ghost" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={addSibling}>
        {t("common.addOption")}
      </button>
    </div>
  );
}
