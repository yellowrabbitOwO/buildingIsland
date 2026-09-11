import { useState } from "react";
import type { ChartFieldConfig, FieldDef, FieldType, FieldValue, ScaleFieldConfig } from "../../data/types";
import FieldRowCluster from "./FieldRowCluster";
import GroupBlockAddMenu from "./GroupBlockAddMenu";
import { moveItem, useDragReorder } from "../../data/reorder";
import { useLanguage } from "../../i18n";

interface FieldsListProps {
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  editing: boolean;
  worldId: string;
  currentEntryId?: string;
  starredFieldIds?: string[];
  onChangeValue?: (fieldId: string, value: unknown) => void;
  onChangeExtraSlotValue?: (fieldId: string, slotId: string, value: unknown) => void;
  onChangeExtraSlotType?: (fieldId: string, slotId: string, type: FieldType) => void;
  onChangeExtraSlotChartConfig?: (fieldId: string, slotId: string, patch: Partial<ChartFieldConfig>) => void;
  onToggleStar?: (fieldId: string) => void;
  onRemoveField?: (fieldId: string) => void;
  onDuplicateField?: (fieldId: string) => void;
  onRelabelField?: (fieldId: string, label: string) => void;
  onChangeFieldType?: (fieldId: string, type: FieldType) => void;
  onChangeFieldChartConfig?: (fieldId: string, patch: Partial<ChartFieldConfig>) => void;
  onChangeFieldScaleConfig?: (fieldId: string, patch: Partial<ScaleFieldConfig>) => void;
  onOpenFieldSettings?: (clusterFields: FieldDef[]) => void;
  onRelabelGroup?: (groupInstanceId: string, label: string) => void;
  onAddFieldToGroup?: (groupInstanceId: string, groupLabel: string) => void;
  onAddBlankGroupAfter?: (afterInstanceId: string) => void;
  /** 將選取的群組欄位合併進 afterInstanceId 所在的區塊（而非另開新區塊），並附上該群組名稱供合併標題 */
  onMergeGroupInto?: (afterInstanceId: string, fields: FieldDef[], groupName: string) => void;
  onReorderFields?: (newFields: FieldDef[]) => void;
  /** 同一叢集裡有多個實例（「階段」）時，拖曳調整彼此順序 */
  onReorderClusterInstances?: (orderedFieldIds: string[]) => void;
  /** 供群組區塊「合併其他群組」選單依分類限制過濾可選群組 */
  categoryId?: string;
  /** 若提供，僅顯示這些欄位，且一律以純單行呈現（不聚合群組框），用於主世界重點彙整 */
  onlyFieldIds?: string[];
}

type Block =
  | { kind: "field"; key: string; label: string; fields: FieldDef[] }
  | { kind: "group"; instanceId: string; label: string; fields: FieldDef[] };

/** 依欄位 key 聚合同一欄位新增的多個實例，讓標題只顯示一次 */
function clusterByKey(fields: FieldDef[]): { key: string; label: string; fields: FieldDef[] }[] {
  const order: string[] = [];
  const map = new Map<string, FieldDef[]>();
  for (const f of fields) {
    if (!map.has(f.key)) {
      map.set(f.key, []);
      order.push(f.key);
    }
    map.get(f.key)!.push(f);
  }
  return order.map((key) => {
    const arr = map.get(key)!;
    // 叢集的顯示/編輯標籤一律取第一個實例目前的原始標籤：
    // relabelCluster／duplicateField 都保證第一個實例的 label 不會被自動加上編號後綴，
    // 因此這裡不能再用 baseLabel() 去掉結尾數字，否則使用者打完數字後、下一次重繪會被立刻清掉
    return { key, label: arr[0].label, fields: arr };
  });
}

export default function FieldsList({
  fields,
  values,
  editing,
  worldId,
  currentEntryId,
  starredFieldIds = [],
  onChangeValue,
  onChangeExtraSlotValue,
  onChangeExtraSlotType,
  onChangeExtraSlotChartConfig,
  onToggleStar,
  onRemoveField,
  onDuplicateField,
  onRelabelField,
  onChangeFieldType,
  onChangeFieldChartConfig,
  onChangeFieldScaleConfig,
  onOpenFieldSettings,
  onRelabelGroup,
  onAddFieldToGroup,
  onAddBlankGroupAfter,
  onMergeGroupInto,
  onReorderFields,
  onReorderClusterInstances,
  categoryId,
  onlyFieldIds,
}: FieldsListProps) {
  const { t } = useLanguage();
  // 依欄位聚合成區塊；onlyFieldIds 模式不需要這份分組，維持空陣列即可——
  // 但仍需讓下方 hooks 每次渲染都無條件呼叫，故不能在算出 blocks 前就 return
  const blocks: Block[] = [];
  if (!onlyFieldIds) {
    const groupIndex = new Map<string, number>();
    const fieldClusterIndex = new Map<string, number>();
    for (const field of fields) {
      if (field.groupInstanceId) {
        const existingIdx = groupIndex.get(field.groupInstanceId);
        if (existingIdx !== undefined) {
          (blocks[existingIdx] as Extract<Block, { kind: "group" }>).fields.push(field);
        } else {
          groupIndex.set(field.groupInstanceId, blocks.length);
          blocks.push({ kind: "group", instanceId: field.groupInstanceId, label: field.groupLabel ?? t("fieldsList.groupFallback"), fields: [field] });
        }
      } else {
        const existingIdx = fieldClusterIndex.get(field.key);
        if (existingIdx !== undefined) {
          (blocks[existingIdx] as Extract<Block, { kind: "field" }>).fields.push(field);
        } else {
          fieldClusterIndex.set(field.key, blocks.length);
          blocks.push({ kind: "field", key: field.key, label: field.label, fields: [field] });
        }
      }
    }
  }

  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(
    blocks,
    (newBlocks) => onReorderFields?.(newBlocks.flatMap((b) => b.fields)),
    !onlyFieldIds && editing && !!onReorderFields
  );

  const [groupDrag, setGroupDrag] = useState<{ groupInstanceId: string; index: number } | null>(null);
  const [groupOver, setGroupOver] = useState<{ index: number; position: "before" | "after" } | null>(null);

  if (onlyFieldIds) {
    const visible = fields.filter((f) => onlyFieldIds.includes(f.id));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {clusterByKey(visible).map((cluster) => (
          <FieldRowCluster
            key={cluster.key}
            label={cluster.label}
            fields={cluster.fields}
            values={values}
            editing={false}
            worldId={worldId}
            currentEntryId={currentEntryId}
            starredFieldIds={[]}
          />
        ))}
      </div>
    );
  }

  const reorderWithinGroup = (
    groupInstanceId: string,
    clusters: { key: string; label: string; fields: FieldDef[] }[],
    from: number,
    to: number
  ) => {
    if (!onReorderFields) return;
    const newClusters = moveItem(clusters, from, to);
    const newBlocks = blocks.map((b) =>
      b.kind === "group" && b.instanceId === groupInstanceId ? { ...b, fields: newClusters.flatMap((c) => c.fields) } : b
    );
    onReorderFields(newBlocks.flatMap((b) => b.fields));
  };

  const relabelCluster = (clusterFields: FieldDef[], newLabel: string) => {
    if (!onRelabelField) return;
    clusterFields.forEach((f, i) => onRelabelField(f.id, i === 0 ? newLabel : `${newLabel} ${i + 1}`));
  };

  const cluster = (label: string, clusterFields: FieldDef[], key: string) => (
    <FieldRowCluster
      key={key}
      label={label}
      fields={clusterFields}
      values={values}
      editing={editing}
      worldId={worldId}
      currentEntryId={currentEntryId}
      starredFieldIds={starredFieldIds}
      onChangeValue={onChangeValue}
      onChangeExtraSlotValue={onChangeExtraSlotValue}
      onChangeExtraSlotType={onChangeExtraSlotType}
      onChangeExtraSlotChartConfig={onChangeExtraSlotChartConfig}
      onToggleStar={onToggleStar}
      onRemoveField={onRemoveField}
      onDuplicateField={onDuplicateField}
      onRelabel={onRelabelField ? (newLabel) => relabelCluster(clusterFields, newLabel) : undefined}
      onTypeChange={onChangeFieldType}
      onChartConfigChange={onChangeFieldChartConfig}
      onScaleConfigChange={onChangeFieldScaleConfig}
      onOpenFieldSettings={onOpenFieldSettings}
      onReorderInstances={onReorderClusterInstances}
    />
  );

  const dragHandle = (index: number) =>
    editing && onReorderFields ? (
      <span
        {...handleProps(index)}
        style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0, paddingTop: 3 }}
        title={t("common.dragToReorder")}
      >
        ⠿
      </span>
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {blocks.map((block, i) =>
        block.kind === "field" ? (
          <div
            key={block.key}
            style={{ display: "flex", alignItems: "flex-start", gap: 4, opacity: dragIndex === i ? 0.5 : 1, ...dropIndicatorStyle(i) }}
            {...rowProps(i)}
          >
            {dragHandle(i)}
            <div style={{ flex: 1, minWidth: 0 }}>{cluster(block.label, block.fields, block.key)}</div>
          </div>
        ) : (
          <div
            key={block.instanceId}
            className="card"
            style={{ padding: "16px 16px 18px", margin: "12px 0", opacity: dragIndex === i ? 0.5 : 1, ...dropIndicatorStyle(i) }}
            {...rowProps(i)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              {dragHandle(i)}
              {editing && onRelabelGroup ? (
                <input
                  value={block.label}
                  onChange={(e) => onRelabelGroup(block.instanceId, e.target.value)}
                  style={{
                    fontWeight: 700,
                    fontSize: 17,
                    fontFamily: "var(--font-serif)",
                    color: "var(--text)",
                    flex: 1,
                    minWidth: 0,
                    padding: "2px 6px",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 17,
                    fontFamily: "var(--font-serif)",
                    color: "var(--text)",
                  }}
                >
                  {block.label}
                </div>
              )}
              {editing && (onAddFieldToGroup || onAddBlankGroupAfter || onMergeGroupInto) && (
                <span style={{ flexShrink: 0 }}>
                  <GroupBlockAddMenu
                    worldId={worldId}
                    categoryId={categoryId}
                    onAddField={onAddFieldToGroup ? () => onAddFieldToGroup(block.instanceId, block.label) : undefined}
                    onAddBlankGroup={onAddBlankGroupAfter ? () => onAddBlankGroupAfter(block.instanceId) : undefined}
                    onInsertGroup={onMergeGroupInto ? (fields, groupName) => onMergeGroupInto(block.instanceId, fields, groupName) : undefined}
                  />
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(() => {
                const innerClusters = clusterByKey(block.fields);
                return innerClusters.map((c, ci) => (
                  <div
                    key={`${block.instanceId}:${c.key}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 4,
                      opacity: groupDrag?.groupInstanceId === block.instanceId && groupDrag.index === ci ? 0.5 : 1,
                      ...(groupDrag?.groupInstanceId === block.instanceId && groupOver?.index === ci && groupDrag.index !== ci
                        ? { boxShadow: groupOver.position === "after" ? "0 2px 0 0 var(--accent)" : "0 -2px 0 0 var(--accent)" }
                        : {}),
                    }}
                    onDragOver={
                      editing && onReorderFields
                        ? (e) => {
                            e.preventDefault();
                            if (!groupDrag || groupDrag.groupInstanceId !== block.instanceId || groupDrag.index === ci) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const before = e.clientY < rect.top + rect.height / 2;
                            setGroupOver({ index: ci, position: before ? "before" : "after" });
                          }
                        : undefined
                    }
                    onDrop={
                      editing && onReorderFields
                        ? (e) => {
                            e.preventDefault();
                            if (groupDrag && groupDrag.groupInstanceId === block.instanceId && groupOver) {
                              let to = groupOver.index + (groupOver.position === "after" ? 1 : 0);
                              if (groupDrag.index < to) to -= 1;
                              if (groupDrag.index !== to) reorderWithinGroup(block.instanceId, innerClusters, groupDrag.index, to);
                            }
                            setGroupDrag(null);
                            setGroupOver(null);
                          }
                        : undefined
                    }
                  >
                    {editing && onReorderFields && (
                      <span
                        draggable
                        onDragStart={() => setGroupDrag({ groupInstanceId: block.instanceId, index: ci })}
                        onDragEnd={() => {
                          setGroupDrag(null);
                          setGroupOver(null);
                        }}
                        style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0, paddingTop: 3 }}
                        title={t("common.dragToReorder")}
                      >
                        ⠿
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>{cluster(c.label, c.fields, `${block.instanceId}:${c.key}`)}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )
      )}
      {blocks.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("fieldsList.empty")}</p>}
    </div>
  );
}
