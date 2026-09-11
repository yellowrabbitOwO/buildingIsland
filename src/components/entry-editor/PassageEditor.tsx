import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { newId } from "../../data/db";
import type { Passage, PassageChoice } from "../../data/types";
import { deletePassage, getPassage, listPassages, savePassage } from "../../data/repositories/passage";
import { getNarrativeGraph, setStartPassage } from "../../data/repositories/narrativeGraph";
import { useConfirm } from "../common/ConfirmProvider";
import ColorInput from "../common/ColorInput";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { DEFAULT_PASSAGE_NODE_H, DEFAULT_PASSAGE_NODE_W } from "../common/GraphPrimitives";
import { useLanguage } from "../../i18n";

interface PassageEditorProps {
  passageId: string;
  graphId: string;
  onDirtyChange?: (dirty: boolean) => void;
  /** 段落被刪除後呼叫，供外層（底部段落編輯區）關閉自己 */
  onDeleted?: () => void;
}

/** 樣式編輯用的小型數值輸入（帶標籤），節點寬高／連接線粗細／文字字級共用 */
function StyleNumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--text-muted)" }}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        style={{ width: 64 }}
      />
    </label>
  );
}

/** 樣式編輯用的小型色彩輸入（帶標籤），節點底色／文字顏色／連接線顏色共用 */
function StyleColorField({
  label,
  value,
  onChange,
  worldId,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  worldId?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--text-muted)" }}>
      {label}
      <ColorInput value={value} onChange={onChange} allowClear worldId={worldId} />
    </label>
  );
}

/** 底部段落編輯區裡的內容：閱覽／編輯模式＋手動存檔，比照 EntryPage 的 draft 慣例。
 * 段落只透過這個底部編輯區編輯（不另外做整頁路由），不會有「兩處同時編輯同一段落」的情境 */
export default function PassageEditor({ passageId, graphId, onDirtyChange, onDeleted }: PassageEditorProps) {
  const confirm = useConfirm();
  const { t } = useLanguage();

  const passage = useLiveQuery(() => getPassage(passageId), [passageId]);
  const siblings = useLiveQuery(() => listPassages(graphId), [graphId]) ?? [];
  const graph = useLiveQuery(() => getNarrativeGraph(graphId), [graphId]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Passage | null>(null);
  const [expandedChoices, setExpandedChoices] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (editing && passage && !draft) setDraft(structuredClone(passage));
  }, [editing, passage, draft]);

  const hasUnsavedChanges = editing && draft !== null && passage != null && JSON.stringify(draft) !== JSON.stringify(passage);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  if (passage === undefined || !graph) return null;
  if (passage === null || !passage) return <p style={{ padding: 8 }}>{t("passageEditor.notFound")}</p>;

  const active = editing && draft ? draft : passage;
  const isStart = graph.startPassageId === passage.id;
  const otherPassages = siblings.filter((p) => p.id !== passage.id);
  const titleOf = (id?: string) => (id ? siblings.find((p) => p.id === id)?.title ?? t("passageEditor.deletedPassage") : undefined);

  const startEdit = () => {
    setDraft(structuredClone(passage));
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };
  const handleSave = async () => {
    if (!draft) return;
    await savePassage(draft);
    setDraft(null);
    setEditing(false);
  };
  const handleDelete = async () => {
    const ok = await confirm({
      title: t("passageEditor.deleteConfirm.title"),
      message: t("passageEditor.deleteConfirm.message", { name: passage.title }),
    });
    if (!ok) return;
    await deletePassage(passage.id);
    onDeleted?.();
  };

  const updateDraft = (patch: Partial<Passage>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const updateChoice = (id: string, patch: Partial<PassageChoice>) =>
    setDraft((prev) => (prev ? { ...prev, choices: prev.choices.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : prev));
  const addChoice = () =>
    setDraft((prev) => (prev ? { ...prev, choices: [...prev.choices, { id: newId(), label: "" }] } : prev));
  const removeChoice = (id: string) =>
    setDraft((prev) => (prev ? { ...prev, choices: prev.choices.filter((c) => c.id !== id) } : prev));

  const toggleChoiceExpanded = (id: string) =>
    setExpandedChoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const wordCount = active.body.length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        {editing ? (
          <input
            autoFocus
            style={{ fontSize: 16, fontFamily: "var(--font-serif)", flex: 1, minWidth: 0 }}
            value={draft?.title ?? ""}
            onChange={(e) => updateDraft({ title: e.target.value })}
          />
        ) : (
          <h3 style={{ margin: 0, flex: 1, minWidth: 0 }}>
            {isStart && <span title={t("passageEditor.startPassageTitle")}>▶ </span>}
            {active.title}
          </h3>
        )}
      </div>

      {editing ? (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, padding: 10, border: "1px solid var(--border)", borderRadius: 6 }}>
            <StyleColorField
              label={t("passageEditor.bgColorLabel")}
              value={draft?.bgColor}
              onChange={(c) => updateDraft({ bgColor: c || undefined })}
              worldId={graph.worldId}
            />
            <StyleColorField
              label={t("writingDocViewPage.toolbar.textColor")}
              value={draft?.textColor}
              onChange={(c) => updateDraft({ textColor: c || undefined })}
              worldId={graph.worldId}
            />
            <StyleNumberField
              label={t("passageEditor.nodeWidthLabel")}
              value={draft?.width ?? DEFAULT_PASSAGE_NODE_W}
              min={60}
              max={400}
              step={10}
              onChange={(v) => updateDraft({ width: v })}
            />
            <StyleNumberField
              label={t("passageEditor.nodeHeightLabel")}
              value={draft?.height ?? DEFAULT_PASSAGE_NODE_H}
              min={30}
              max={200}
              step={5}
              onChange={(v) => updateDraft({ height: v })}
            />
          </div>

          <textarea
            style={{ width: "100%", minHeight: 220 }}
            placeholder={t("passageEditor.bodyPlaceholder")}
            value={draft?.body ?? ""}
            onChange={(e) => updateDraft({ body: e.target.value })}
          />
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "4px 0 14px" }}>{wordCount} {t("writingDocCard.wordsUnit")}</p>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{t("passageEditor.choicesLabel")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(draft?.choices ?? []).map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 6 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      style={{ flex: 1, minWidth: 0 }}
                      placeholder={t("passageEditor.choiceTextPlaceholder")}
                      value={c.label}
                      onChange={(e) => updateChoice(c.id, { label: e.target.value })}
                    />
                    <select
                      value={c.targetPassageId ?? ""}
                      onChange={(e) => updateChoice(c.id, { targetPassageId: e.target.value || undefined })}
                      style={{ maxWidth: 110 }}
                    >
                      <option value="">{t("passageEditor.notLinkedOption")}</option>
                      {otherPassages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost" title={t("passageEditor.lineAndTextStyleTitle")} onClick={() => toggleChoiceExpanded(c.id)}>
                      {expandedChoices.has(c.id) ? "▾" : "🎨"}
                    </button>
                    <button className="btn-ghost" title={t("passageEditor.removeChoiceTitle")} onClick={() => removeChoice(c.id)}>
                      ✕
                    </button>
                  </div>
                  {expandedChoices.has(c.id) && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <StyleColorField
                          label={t("passageEditor.lineColorLabel")}
                          value={c.lineColor}
                          onChange={(v) => updateChoice(c.id, { lineColor: v || undefined })}
                          worldId={graph.worldId}
                        />
                        <StyleNumberField
                          label={t("passageEditor.lineWidthLabel")}
                          value={c.lineWidth ?? 1.5}
                          min={0.5}
                          max={8}
                          step={0.5}
                          onChange={(v) => updateChoice(c.id, { lineWidth: v })}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                          {t("passageEditor.aboveBelowTextHint")}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <span style={{ fontSize: 11, color: "var(--text-faint)", width: 14 }}>{t("passageEditor.aboveLabel")}</span>
                            <input
                              placeholder={t("passageEditor.aboveTextPlaceholder")}
                              value={c.aboveText ?? ""}
                              onChange={(e) => updateChoice(c.id, { aboveText: e.target.value || undefined })}
                              style={{ minWidth: 100, maxWidth: 160 }}
                            />
                            <StyleColorField
                              label={t("relationGraphViewPage.groupDialog.colorLabel")}
                              value={c.aboveTextColor}
                              onChange={(v) => updateChoice(c.id, { aboveTextColor: v || undefined })}
                              worldId={graph.worldId}
                            />
                            <StyleNumberField
                              label={t("writingDocViewPage.toolbar.fontSize")}
                              value={c.aboveTextSize ?? 11}
                              min={8}
                              max={24}
                              onChange={(v) => updateChoice(c.id, { aboveTextSize: v })}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <span style={{ fontSize: 11, color: "var(--text-faint)", width: 14 }}>{t("passageEditor.belowLabel")}</span>
                            <input
                              placeholder={t("passageEditor.belowTextPlaceholder")}
                              value={c.belowText ?? ""}
                              onChange={(e) => updateChoice(c.id, { belowText: e.target.value || undefined })}
                              style={{ minWidth: 100, maxWidth: 160 }}
                            />
                            <StyleColorField
                              label={t("relationGraphViewPage.groupDialog.colorLabel")}
                              value={c.belowTextColor}
                              onChange={(v) => updateChoice(c.id, { belowTextColor: v || undefined })}
                              worldId={graph.worldId}
                            />
                            <StyleNumberField
                              label={t("writingDocViewPage.toolbar.fontSize")}
                              value={c.belowTextSize ?? 11}
                              min={8}
                              max={24}
                              onChange={(v) => updateChoice(c.id, { belowTextSize: v })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 8 }} onClick={addChoice}>
              {t("passageEditor.addChoiceButton")}
            </button>
          </div>

          <button
            className="btn"
            disabled={isStart}
            onClick={() => setStartPassage(graphId, passage.id)}
            style={{ marginBottom: 14 }}
          >
            {isStart ? t("passageEditor.alreadyStartPassage") : t("passageEditor.setAsStartPassage")}
          </button>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={cancelEdit}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              {t("common.save")}
            </button>
          </div>
        </>
      ) : (
        <>
          {active.body ? (
            <p style={{ whiteSpace: "pre-wrap" }}>{active.body}</p>
          ) : (
            <p style={{ color: "var(--text-faint)" }}>{t("passageEditor.noBodyYet")}</p>
          )}
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "4px 0 14px" }}>{wordCount} {t("writingDocCard.wordsUnit")}</p>

          {active.choices.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>{t("passageEditor.choicesLabel")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {active.choices.map((c) => (
                  <div key={c.id} style={{ fontSize: 13 }}>
                    {c.label || t("narrativeGraphViewPage.unnamedChoice")}
                    <span style={{ color: "var(--text-faint)" }}> → {titleOf(c.targetPassageId) ?? t("passageEditor.notLinkedOption")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={startEdit}>
              {t("common.edit")}
            </button>
            <button className="btn" onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              {t("passageEditor.deletePassageButton")}
            </button>
          </div>
        </>
      )}
      {showHistory && <VersionHistoryDialog entityType="passages" entityId={passage.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
