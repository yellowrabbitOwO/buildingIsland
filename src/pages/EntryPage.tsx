import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId } from "../data/db";
import type { ChartFieldConfig, Entry, FieldDef, FieldSlotDef, FieldType, ScaleFieldConfig } from "../data/types";
import { deleteEntry, saveEntry, toggleEntryStar, toggleFieldStar } from "../data/repositories/entry";
import { getIncomingRelations, type IncomingRelation } from "../data/repositories/relation";
import { buildInitialFieldValue, buildInitialSlotValue, buildInitialValues } from "../data/fieldDefaults";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import FieldsList from "../components/entry-editor/FieldsList";
import ColorInput from "../components/common/ColorInput";
import ImageUpload from "../components/common/ImageUpload";
import ResolvedColor from "../components/common/ResolvedColor";
import { isColorValue } from "../data/colorResolve";
import AddFieldDialog from "../components/entry-editor/AddFieldDialog";
import AddFieldMenu from "../components/entry-editor/AddFieldMenu";
import CharacterTimelineSummary from "../components/entry-editor/CharacterTimelineSummary";
import type { MarkdownExportContext } from "../data/exportMarkdown";
import { entryToManuscript } from "../data/manuscript/entryToManuscript";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { useLanguage, categoryDisplayName } from "../i18n";
import { isReadOnlyDemo } from "../demoMode";

// 模組層級登記「目前正在編輯中」的條目 id（進入編輯時 +1、離開編輯時 -1）；
// 主畫面與側邊面板各自是獨立的 EntryPage 實例，靠這個共用登記表偵測「同一條目被同時在兩處編輯」
const activelyEditingEntryIds = new Map<string, number>();

/** 找出 instanceId 該群組區塊最後一個欄位之後的插入位置；找不到則插到最後 */
function insertAfterGroupIndex(fields: FieldDef[], instanceId: string): number {
  for (let i = fields.length - 1; i >= 0; i--) {
    if (fields[i].groupInstanceId === instanceId) return i + 1;
  }
  return fields.length;
}

/** 依欄位設定變更前後的額外子值格定義，重新整理既有的子值：型態不變的格子保留原值，
 * 新增或型態改變的格子重新播種預設值，被移除的格子直接捨棄 */
function reconcileExtraSlotValues(
  oldSlots: FieldSlotDef[] | undefined,
  newSlots: FieldSlotDef[] | undefined,
  existing: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!newSlots || newSlots.length === 0) return undefined;
  const oldById = new Map((oldSlots ?? []).map((s) => [s.id, s]));
  const result: Record<string, unknown> = {};
  for (const slot of newSlots) {
    const old = oldById.get(slot.id);
    if (old && old.type === slot.type && existing && slot.id in existing) {
      result[slot.id] = existing[slot.id];
    } else {
      const seeded = buildInitialSlotValue(slot);
      if (seeded !== undefined) result[slot.id] = seeded;
    }
  }
  return result;
}

interface EntryPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的條目渲染這個元件 */
  entryIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：不與瀏覽器網址／導覽攔截互動，避免跟主畫面的網址互相干擾 */
  embedded?: boolean;
  /** embedded 時回報目前是否有未儲存變更，供側邊面板決定切換／關閉前是否要先確認 */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function EntryPage({ entryIdOverride, worldIdOverride, embedded = false, onDirtyChange }: EntryPageProps = {}) {
  const params = useParams<{ worldId: string; entryId: string }>();
  const worldId = worldIdOverride ?? params.worldId;
  const entryId = entryIdOverride ?? params.entryId;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel, setPanelDirty } = useSidePanel();
  const { t } = useLanguage();

  const entry = useLiveQuery(() => (entryId ? db.entries.get(entryId) : undefined), [entryId]);
  const category = useLiveQuery(
    () => (entry ? db.categories.get(entry.categoryId) : undefined),
    [entry?.categoryId]
  );

  const [editing, setEditing] = useState(!isReadOnlyDemo && !embedded && searchParams.get("edit") === "1");
  const [draft, setDraft] = useState<Entry | null>(null);
  const [incoming, setIncoming] = useState<IncomingRelation[]>([]);
  const [showAddField, setShowAddField] = useState(false);
  const [addFieldGroupTarget, setAddFieldGroupTarget] = useState<
    { instanceId: string; label: string; insertAfterInstanceId?: string } | null
  >(null);
  const [editingFieldCluster, setEditingFieldCluster] = useState<FieldDef[] | null>(null);
  const [starStatusMsg, setStarStatusMsg] = useState<string | null>(null);
  const starStatusTimeout = useRef<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  // 匯出成稿要能解析 entryLink／date 欄位，查表範圍拉整個世界（條目可能連到世界裡任何一張條目），
  // 比照 UserSettingsPage.tsx 的 buildMarkdownContext 做法
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

  useEffect(() => {
    if (editing && entry && !draft) setDraft(structuredClone(entry));
  }, [editing, entry, draft]);

  useEffect(() => {
    if (!entryId) return;
    let ignore = false;
    getIncomingRelations(entryId, t).then((r) => {
      if (!ignore) setIncoming(r);
    });
    return () => {
      ignore = true;
    };
  }, [entryId, entry, t]);

  useEffect(() => () => {
    if (starStatusTimeout.current) window.clearTimeout(starStatusTimeout.current);
  }, []);

  const hasUnsavedChanges = editing && draft !== null && entry != null && JSON.stringify(draft) !== JSON.stringify(entry);
  // embedded（側邊面板）時不攔截導覽：面板不掛在 <Outlet> 下，主畫面換頁不會讓它卸載，草稿還在，
  // 攔住主畫面完全無關的導覽反而是誤觸發；未儲存變更改由 onDirtyChange 回報給側邊面板自己處理
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !embedded && hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  // 登記／取消登記「這個條目正在編輯中」，讓另一個畫面（主畫面／側邊面板）能偵測到同一條目被同時編輯
  useEffect(() => {
    if (!editing || !entryId) return;
    activelyEditingEntryIds.set(entryId, (activelyEditingEntryIds.get(entryId) ?? 0) + 1);
    return () => {
      const n = (activelyEditingEntryIds.get(entryId) ?? 1) - 1;
      if (n <= 0) activelyEditingEntryIds.delete(entryId);
      else activelyEditingEntryIds.set(entryId, n);
    };
  }, [editing, entryId]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const ok = await confirm({
        title: t("entryPage.leaveConfirm.title"),
        message: t("entryPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  const handleSave = async () => {
    if (!draft) return;
    await saveEntry(draft);
    setDraft(null);
    setEditing(false);
    if (!embedded) setSearchParams({});
  };
  // Ctrl/Cmd+S：存檔並退出編輯模式，行為等同按「儲存」按鈕；只在真的有草稿可存時才啟用。
  // 這個 hook 呼叫要放在下面的 null 檢查（提早 return）之前，讓每次 render 都無條件呼叫到，
  // 不會因為 entry 從 undefined 變有值而讓 hook 呼叫次數在兩次 render 之間不一致
  useSaveShortcut(handleSave, editing && draft !== null);

  if (!worldId || !entryId || entry === undefined) return null;
  if (entry === null || !entry) return <p style={{ padding: 24 }}>{t("entryPage.notFound")}</p>;

  const startEdit = async () => {
    const editedElsewhere = (activelyEditingEntryIds.get(entryId) ?? 0) > 0;
    if (editedElsewhere) {
      const ok = await confirm({
        title: t("entryPage.concurrentEditConfirm.title"),
        message: t("entryPage.concurrentEditConfirm.message"),
        confirmLabel: t("entryPage.concurrentEditConfirm.confirmLabel"),
      });
      if (!ok) return;
    }
    setDraft(structuredClone(entry));
    setEditing(true);
    if (!embedded) setSearchParams({ edit: "1" });
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    if (!embedded) setSearchParams({});
  };


  // 編輯模式中星號寫在 draft 裡，交由「儲存」一併寫入——否則會被稍後的 saveEntry(draft) 用編輯開始當下的舊星號狀態蓋掉
  const handleToggleStar = async () => {
    const willBeStarred = editing && draft ? !draft.starred : !entry.starred;
    if (editing && draft) {
      setDraft((prev) => (prev ? { ...prev, starred: willBeStarred } : prev));
    } else {
      await toggleEntryStar(entry.id);
    }
    setStarStatusMsg(willBeStarred ? t("entryPage.starredMsg") : t("entryPage.unstarredMsg"));
    if (starStatusTimeout.current) window.clearTimeout(starStatusTimeout.current);
    starStatusTimeout.current = window.setTimeout(() => setStarStatusMsg(null), 5000);
  };

  const handleToggleFieldStar = (fieldId: string) => {
    if (editing && draft) {
      setDraft((prev) => {
        if (!prev) return prev;
        const set = new Set(prev.starredFieldIds);
        if (set.has(fieldId)) set.delete(fieldId);
        else set.add(fieldId);
        return { ...prev, starredFieldIds: [...set] };
      });
      return;
    }
    toggleFieldStar(entry.id, fieldId);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t("entryCard.deleteConfirm.title"),
      message: t("entryCard.deleteConfirm.message", { name: entry.name }),
    });
    if (!ok) return;
    await deleteEntry(entry.id);
    if (embedded) {
      // 條目已刪除，面板裡沒有東西可留戀，直接關閉——不用再跳一次「未儲存變更」確認
      setPanelDirty(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/category/${entry.categoryId}`);
    }
  };

  const active = editing && draft ? draft : entry;

  const updateDraft = (patch: Partial<Entry>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateFieldValue = (fieldId: string, value: unknown) => {
    setDraft((prev) =>
      prev ? { ...prev, values: { ...prev.values, [fieldId]: { ...prev.values[fieldId], current: value } } } : prev
    );
  };

  const changeExtraSlotValue = (fieldId: string, slotId: string, value: unknown) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const existing = prev.values[fieldId];
      return {
        ...prev,
        values: {
          ...prev.values,
          [fieldId]: {
            current: existing?.current,
            extraSlotValues: { ...existing?.extraSlotValues, [slotId]: value },
          },
        },
      };
    });
  };

  /** 切換某個欄位實例裡，額外子值格目前使用中的型態；只影響這一個實例（其他「新增第二個」出來的實例各自獨立），
   * 沿用 changeFieldType 對主值的相同作法：換型態時重置該子值的值 */
  const changeExtraSlotType = (fieldId: string, slotId: string, type: FieldType) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const field = prev.fields.find((f) => f.id === fieldId);
      const slot = field?.extraSlots?.find((s) => s.id === slotId);
      if (!field || !slot || slot.type === type) return prev;
      const updatedSlot: FieldSlotDef = { ...slot, type };
      const updatedField: FieldDef = { ...field, extraSlots: field.extraSlots!.map((s) => (s.id === slotId ? updatedSlot : s)) };
      return {
        ...prev,
        fields: prev.fields.map((f) => (f.id === fieldId ? updatedField : f)),
        values: {
          ...prev.values,
          [fieldId]: {
            current: prev.values[fieldId]?.current,
            extraSlotValues: { ...prev.values[fieldId]?.extraSlotValues, [slotId]: buildInitialSlotValue(updatedSlot) },
          },
        },
      };
    });
  };

  /** 同一叢集裡的多個實例（「階段」）拖曳調整彼此順序：這些欄位在 prev.fields 裡本來就佔著一段連續位置，
   * 依新順序覆寫回這些位置即可，即使不連續也一樣正確 */
  const reorderClusterInstances = (orderedFieldIds: string[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.fields.map((f) => [f.id, f]));
      const reordered = orderedFieldIds.map((id) => byId.get(id)).filter((f): f is FieldDef => !!f);
      if (reordered.length !== orderedFieldIds.length) return prev;
      const positions = prev.fields.reduce<number[]>((acc, f, i) => (orderedFieldIds.includes(f.id) ? [...acc, i] : acc), []);
      const fields = [...prev.fields];
      positions.forEach((pos, i) => {
        fields[pos] = reordered[i];
      });
      return { ...prev, fields };
    });
  };

  const removeField = (fieldId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const fields = prev.fields.filter((f) => f.id !== fieldId);
      const values = { ...prev.values };
      delete values[fieldId];
      return { ...prev, fields, values };
    });
  };

  const duplicateField = (fieldId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx === -1) return prev;
      const original = prev.fields[idx];
      const baseLabel = original.label.replace(/\s*\d+$/, "");
      // 一律插入在「同一叢集最後一個」之後，而非被點擊的那個之後——
      // 否則重複點擊原始欄位的新增第二個時，新副本會插到既有副本前面，導致標籤數字與畫面順序對不上
      const siblingIndices: number[] = [];
      prev.fields.forEach((f, i) => {
        if (f.key === original.key && f.groupInstanceId === original.groupInstanceId) siblingIndices.push(i);
      });
      const insertAt = siblingIndices[siblingIndices.length - 1] + 1;
      const copy: FieldDef = { ...original, id: newId(), label: `${baseLabel} ${siblingIndices.length + 1}` };
      const fields = [...prev.fields.slice(0, insertAt), copy, ...prev.fields.slice(insertAt)];
      return {
        ...prev,
        fields,
        values: { ...prev.values, [copy.id]: buildInitialFieldValue(copy) ?? { current: undefined } },
      };
    });
  };

  const addFields = (fields: FieldDef[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const tagged = addFieldGroupTarget
        ? fields.map((f) => ({ ...f, groupInstanceId: addFieldGroupTarget.instanceId, groupLabel: addFieldGroupTarget.label }))
        : fields;
      const afterInstanceId = addFieldGroupTarget?.insertAfterInstanceId;
      const insertAt = afterInstanceId ? insertAfterGroupIndex(prev.fields, afterInstanceId) : prev.fields.length;
      return {
        ...prev,
        fields: [...prev.fields.slice(0, insertAt), ...tagged, ...prev.fields.slice(insertAt)],
        values: buildInitialValues(tagged, prev.values),
      };
    });
    setShowAddField(false);
    setAddFieldGroupTarget(null);
  };

  const relabelField = (fieldId: string, label: string) => {
    setDraft((prev) => (prev ? { ...prev, fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, label } : f)) } : prev));
  };

  const relabelGroup = (groupInstanceId: string, label: string) => {
    setDraft((prev) =>
      prev
        ? { ...prev, fields: prev.fields.map((f) => (f.groupInstanceId === groupInstanceId ? { ...f, groupLabel: label } : f)) }
        : prev
    );
  };

  const addFieldToGroup = (groupInstanceId: string, groupLabel: string) => {
    setAddFieldGroupTarget({ instanceId: groupInstanceId, label: groupLabel });
    setShowAddField(true);
  };

  const addBlankGroupAfter = (afterInstanceId: string) => {
    setAddFieldGroupTarget({ instanceId: newId(), label: t("entryPage.newGroupLabel"), insertAfterInstanceId: afterInstanceId });
    setShowAddField(true);
  };

  /** 將選取的群組欄位合併進 afterInstanceId 所在的既有區塊（沿用同一個 groupInstanceId），
   * 並把區塊標題合併為「原標題+新群組名稱」，而非另開一個新區塊 */
  const mergeGroupInto = (afterInstanceId: string, fields: FieldDef[], groupName: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const currentLabel = prev.fields.find((f) => f.groupInstanceId === afterInstanceId)?.groupLabel ?? "";
      const combinedLabel = currentLabel ? `${currentLabel}+${groupName}` : groupName;
      const relabeled = prev.fields.map((f) =>
        f.groupInstanceId === afterInstanceId ? { ...f, groupLabel: combinedLabel } : f
      );
      const tagged = fields.map((f) => ({ ...f, groupInstanceId: afterInstanceId, groupLabel: combinedLabel }));
      const insertAt = insertAfterGroupIndex(relabeled, afterInstanceId);
      return { ...prev, fields: [...relabeled.slice(0, insertAt), ...tagged, ...relabeled.slice(insertAt)] };
    });
  };

  const changeFieldType = (fieldId: string, type: FieldType) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const field = prev.fields.find((f) => f.id === fieldId);
      if (!field || field.type === type) return prev;
      const updatedField = { ...field, type };
      // 主值型態改變才重置主值；額外子值格沒有跟著換型態，保留原值不動
      const resetValue = buildInitialFieldValue(updatedField) ?? { current: undefined };
      return {
        ...prev,
        fields: prev.fields.map((f) => (f.id === fieldId ? updatedField : f)),
        values: { ...prev.values, [fieldId]: { ...resetValue, extraSlotValues: prev.values[fieldId]?.extraSlotValues } },
      };
    });
  };

  const changeChartConfig = (fieldId: string, patch: Partial<ChartFieldConfig>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === fieldId && f.chartConfig ? { ...f, chartConfig: { ...f.chartConfig, ...patch } } : f
            ),
          }
        : prev
    );
  };

  /** 圖表型態額外子值格自己的圖表設定（底色／軸範圍／分支形狀等），與主值的 changeChartConfig 對應，
   * 只影響這一個欄位實例的這一個子值格 */
  const changeExtraSlotChartConfig = (fieldId: string, slotId: string, patch: Partial<ChartFieldConfig>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === fieldId
                ? {
                    ...f,
                    extraSlots: f.extraSlots?.map((s) =>
                      s.id === slotId && s.chartConfig ? { ...s, chartConfig: { ...s.chartConfig, ...patch } } : s
                    ),
                  }
                : f
            ),
          }
        : prev
    );
  };

  const changeScaleConfig = (fieldId: string, patch: Partial<ScaleFieldConfig>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === fieldId && f.scaleConfig ? { ...f, scaleConfig: { ...f.scaleConfig, ...patch } } : f
            ),
          }
        : prev
    );
  };

  const reorderFields = (newFields: FieldDef[]) => {
    setDraft((prev) => (prev ? { ...prev, fields: newFields } : prev));
  };

  const applyFieldSettings = (updated: FieldDef) => {
    setDraft((prev) => {
      if (!prev || !editingFieldCluster) return prev;
      const clusterIds = editingFieldCluster.map((f) => f.id);
      const baseLabel = updated.label.replace(/\s*\d+$/, "");
      const valuePatch: Record<string, (typeof prev.values)[string]> = {};
      const fields = prev.fields.map((f) => {
        const idx = clusterIds.indexOf(f.id);
        if (idx === -1) return f;
        const type = updated.allowedTypes && !updated.allowedTypes.includes(f.type) ? updated.type : f.type;
        const chartConfig =
          type === "chart"
            ? {
                ...updated.chartConfig,
                chartType:
                  f.chartConfig && updated.chartConfig?.allowedChartTypes?.includes(f.chartConfig.chartType)
                    ? f.chartConfig.chartType
                    : (updated.chartConfig?.chartType ?? "bar"),
              }
            : undefined;
        // 刻度模式跟圖表類型一樣可在每個實例各自切換（見 FieldRowCluster 的 onScaleConfigChange），
        // 套用欄位設定時同樣要保留每個實例目前選用的模式，不能整批覆蓋回設定視窗當時的模式
        const scaleConfig =
          type === "scale" && updated.scaleConfig
            ? {
                ...updated.scaleConfig,
                mode:
                  f.scaleConfig && updated.scaleConfig.allowedModes?.includes(f.scaleConfig.mode)
                    ? f.scaleConfig.mode
                    : updated.scaleConfig.mode,
              }
            : undefined;
        const newField: FieldDef = {
          ...f,
          label: idx === 0 ? updated.label : `${baseLabel} ${idx + 1}`,
          hint: updated.hint,
          allowedTypes: updated.allowedTypes,
          type,
          numberConfig: updated.numberConfig,
          entryLinkConfig: updated.entryLinkConfig,
          chartConfig,
          nestedConfig: updated.nestedConfig,
          choiceConfig: updated.choiceConfig,
          scaleConfig,
          dateConfig: updated.dateConfig,
          extraSlots: updated.extraSlots,
        };
        const extraSlotValues = reconcileExtraSlotValues(f.extraSlots, updated.extraSlots, prev.values[f.id]?.extraSlotValues);
        valuePatch[f.id] =
          type !== f.type
            ? { ...(buildInitialFieldValue(newField) ?? { current: undefined }), extraSlotValues }
            : { current: prev.values[f.id]?.current, extraSlotValues };
        return newField;
      });
      return {
        ...prev,
        fields,
        values: { ...prev.values, ...valuePatch },
      };
    });
    setEditingFieldCluster(null);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {/* 固定頂欄：條目名稱＋分類麵包屑＋功能按鍵，捲動時不移動 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--bg)",
          paddingTop: 8,
          paddingBottom: 10,
          marginBottom: 16,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--text-faint)", fontSize: 12 }}>
            {embedded ? (
              // 面板內沒有分類頁可以顯示，這裡維持純文字，不做任何導覽
              <span>{category ? categoryDisplayName(category, t) : t("entryPage.categoryFallback")}</span>
            ) : (
              <a onClick={() => navigate(`/world/${worldId}/category/${entry.categoryId}`)} style={{ cursor: "pointer" }}>
                {category ? categoryDisplayName(category, t) : t("entryPage.categoryFallback")}
              </a>
            )}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "var(--font-serif)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
            }}
            title={entry.name}
          >
            {entry.name}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          {starStatusMsg && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{starStatusMsg}</span>}
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "entry", entryId: entry.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            disabled={isReadOnlyDemo}
            onClick={handleToggleStar}
            title={active.starred ? t("entryPage.unstarWholeCard") : t("entryPage.starWholeCard")}
            style={{ color: active.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 18 }}
          >
            {active.starred ? "★" : "☆"}
          </button>
          {editing ? (
            <>
              <ColorInput label={t("entryPage.titleColorLabel")} value={draft?.titleColor} onChange={(c) => updateDraft({ titleColor: c || undefined })} allowClear worldId={worldId} />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn" disabled={isReadOnlyDemo} onClick={() => setShowExport(true)}>
                {t("entryPage.exportManuscript")}
              </button>
              <button className="btn" disabled={isReadOnlyDemo} onClick={() => setShowHistory(true)}>
                {t("common.versionHistory")}
              </button>
              <button className="btn btn-primary" disabled={isReadOnlyDemo} onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" disabled={isReadOnlyDemo} onClick={handleDelete}>
                {t("entryCard.deleteConfirm.title")}
              </button>
            </>
          )}
        </div>
      </div>

      {showExport && (
        <ManuscriptExportDialog
          manuscript={entryToManuscript(entry, exportCtx, currentLocalUser?.name, t)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="entries" entityId={entry.id} onClose={() => setShowHistory(false)} />}

      {!editing && entry.titleColor && (
        <ResolvedColor value={entry.titleColor}>
          {(hex) => <div style={{ height: 6, borderRadius: 6, background: hex, marginBottom: 12 }} />}
        </ResolvedColor>
      )}

      {/* 標題與簡述 */}
      <div style={{ marginBottom: 12 }}>
        {editing ? (
          <input
            style={{ fontSize: 22, fontFamily: "var(--font-serif)", width: "100%", marginBottom: 6 }}
            value={draft?.name ?? ""}
            onChange={(e) => updateDraft({ name: e.target.value })}
          />
        ) : (
          <h1>{entry.name}</h1>
        )}
        {editing ? (
          <input
            style={{ width: "100%" }}
            placeholder={t("entryPage.summaryPlaceholder")}
            value={draft?.summary ?? ""}
            onChange={(e) => updateDraft({ summary: e.target.value })}
          />
        ) : (
          entry.summary && <p style={{ color: "var(--text-muted)" }}>{entry.summary}</p>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("entryPage.insertAvatarLabel")}</span>
              <button
                type="button"
                className={!isColorValue(draft?.thumbnail) ? "btn btn-primary" : "btn"}
                onClick={() => updateDraft({ thumbnail: undefined })}
              >
                {t("entryPage.imageMode")}
              </button>
              <button
                type="button"
                className={isColorValue(draft?.thumbnail) ? "btn btn-primary" : "btn"}
                onClick={() => updateDraft({ thumbnail: "#888888" })}
              >
                {t("entryPage.colorMode")}
              </button>
            </div>
            {isColorValue(draft?.thumbnail) ? (
              <ColorInput value={draft?.thumbnail} onChange={(c) => updateDraft({ thumbnail: c || "#888888" })} worldId={worldId} />
            ) : (
              <ImageUpload
                value={draft?.thumbnail}
                onChange={(v) => updateDraft({ thumbnail: v })}
                hint={t("entryPage.imageUploadHint")}
              />
            )}
          </div>
        ) : isColorValue(entry.thumbnail) ? (
          <ResolvedColor value={entry.thumbnail}>
            {(hex) => <div style={{ width: 64, height: 64, borderRadius: 10, flexShrink: 0, background: hex }} />}
          </ResolvedColor>
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 10,
              flexShrink: 0,
              backgroundColor: entry.thumbnail ? undefined : "var(--bg-hover)",
              backgroundImage: entry.thumbnail ? `url(${entry.thumbnail})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
      </div>

      <FieldsList
        fields={active.fields}
        values={active.values}
        editing={editing}
        worldId={worldId}
        currentEntryId={entry.id}
        starredFieldIds={active.starredFieldIds}
        onChangeValue={updateFieldValue}
        onChangeExtraSlotValue={changeExtraSlotValue}
        onChangeExtraSlotType={changeExtraSlotType}
        onChangeExtraSlotChartConfig={changeExtraSlotChartConfig}
        onToggleStar={handleToggleFieldStar}
        onRemoveField={removeField}
        onDuplicateField={duplicateField}
        onRelabelField={relabelField}
        onChangeFieldType={changeFieldType}
        onChangeFieldChartConfig={changeChartConfig}
        onChangeFieldScaleConfig={changeScaleConfig}
        onOpenFieldSettings={setEditingFieldCluster}
        onRelabelGroup={relabelGroup}
        onAddFieldToGroup={addFieldToGroup}
        onAddBlankGroupAfter={addBlankGroupAfter}
        onMergeGroupInto={mergeGroupInto}
        onReorderFields={reorderFields}
        onReorderClusterInstances={reorderClusterInstances}
        categoryId={entry.categoryId}
      />

      {editing && (
        <AddFieldMenu
          worldId={worldId}
          categoryId={entry.categoryId}
          onAddSingleField={() => setShowAddField(true)}
          onAddBlankGroup={() => addFieldToGroup(newId(), t("entryPage.newGroupLabel"))}
          onAddExpanded={addFields}
        />
      )}

      {!editing && incoming.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ marginBottom: 10 }}>{t("entryPage.incomingRelationsTitle")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {incoming.map((rel) => (
              <div
                key={rel.relation.id}
                className="card"
                style={{ padding: "8px 12px", cursor: "pointer" }}
                onClick={() =>
                  embedded
                    ? openPanel({ kind: "entry", entryId: rel.fromEntry.id })
                    : navigate(`/world/${worldId}/entry/${rel.fromEntry.id}`)
                }
              >
                <strong>{rel.fromEntry.name}</strong>
                <span style={{ color: "var(--text-muted)" }}>{t("entryPage.incomingRelationOf", { field: rel.fieldLabel })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!editing && <CharacterTimelineSummary entry={entry} embedded={embedded} />}

      {showAddField && (
        <AddFieldDialog
          worldId={worldId}
          onClose={() => {
            setShowAddField(false);
            setAddFieldGroupTarget(null);
          }}
          onSubmit={(f) => addFields([f])}
        />
      )}
      {editingFieldCluster && (
        <AddFieldDialog
          worldId={worldId}
          field={editingFieldCluster[0]}
          onClose={() => setEditingFieldCluster(null)}
          onSubmit={applyFieldSettings}
        />
      )}
    </div>
  );
}
