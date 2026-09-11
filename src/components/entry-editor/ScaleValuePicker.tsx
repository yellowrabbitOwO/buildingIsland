import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { ScaleEnd, ScaleFieldConfig, ScalePrecision } from "../../data/types";
import ResolvedColor from "../common/ResolvedColor";
import { useLanguage, type TranslationKey } from "../../i18n";

interface ScaleValuePickerProps {
  config: ScaleFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: unknown) => void;
}

/** 避免浮點數運算誤差（如 4.500000000000001），顯示前四捨五入到小數第 3 位 */
function formatNum(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function validateScaleValue(
  text: string,
  precision: ScalePrecision,
  min: number,
  max: number,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return t("scaleValuePicker.errors.required");
  const num = Number(trimmed);
  if (Number.isNaN(num)) return t("scaleValuePicker.errors.invalidNumber");
  if (precision === "fixed" && !Number.isInteger(num)) return t("scaleValuePicker.errors.integerOnly");
  if (num < min || num > max) return t("scaleValuePicker.errors.outOfRange", { min, max });
  return null;
}

/** 手動輸入數值欄位共用的草稿狀態：本地文字＋錯誤訊息，只有驗證通過才會呼叫 onChange 寫回實際值 */
function useManualNumberInput(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
  precision: ScalePrecision,
  onChange: (v: number) => void
) {
  const { t } = useLanguage();
  const num = typeof value === "number" ? value : defaultValue;
  const [text, setText] = useState(() => formatNum(num));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const formatted = formatNum(typeof value === "number" ? value : defaultValue);
    setText(formatted);
    setError(validateScaleValue(formatted, precision, min, max, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, defaultValue, min, max, precision]);

  const handleTextChange = (next: string) => {
    setText(next);
    const err = validateScaleValue(next, precision, min, max, t);
    setError(err);
    if (!err) onChange(Number(next));
  };

  return { num, text, error, handleTextChange };
}

/** 刻度欄位的值選取器：linear＝左右端點 + 滑桿 + 手動輸入；rating＝星等 + 手動輸入；range＝一組區間值（最小～最大）須落在可接受範圍內 */
export default function ScaleValuePicker({ config, value, editing, onChange }: ScaleValuePickerProps) {
  if (config.mode === "rating") {
    return <RatingPicker config={config} value={value} editing={editing} onChange={onChange} />;
  }
  if (config.mode === "range") {
    return <RangeIntervalPicker config={config} value={value} editing={editing} onChange={onChange} />;
  }
  return <LinearScalePicker config={config} value={value} editing={editing} onChange={onChange} />;
}

function LinearScalePicker({
  config,
  value,
  editing,
  onChange,
}: {
  config: ScaleFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: unknown) => void;
}) {
  const { t } = useLanguage();
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const mid = (min + max) / 2;
  const { num, text, error, handleTextChange } = useManualNumberInput(value, mid, min, max, config.precision, onChange);
  const step = config.precision === "fixed" ? 1 : "any";
  const pct = max > min ? ((Math.min(max, Math.max(min, num)) - min) / (max - min)) * 100 : 0;

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        <ScaleEndPreview end={config.left} />
        <div style={{ position: "relative", flex: 1, height: 6, background: "var(--border)", borderRadius: 3, minWidth: 80 }}>
          <div
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: -5,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--accent)",
              border: "2px solid var(--bg)",
              transform: "translateX(-50%)",
            }}
          />
        </div>
        <ScaleEndPreview end={config.right} />
        <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0 }}>{formatNum(num)}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        <ScaleEndPreview end={config.left} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={num}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <ScaleEndPreview end={config.right} />
        <input
          type="number"
          step={step}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          style={{ width: 72, flexShrink: 0 }}
          title={t("scaleValuePicker.manualInputTitle")}
        />
      </div>
      {error && <p style={{ color: "var(--danger, #e08283)", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

/** 範圍模式的值：一組區間 [最小值, 最大值]，兩者皆須落在欄位設定的可接受範圍（config.min ~ config.max）之內 */
type RangeTuple = [number, number];

function isRangeTuple(v: unknown): v is RangeTuple {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

/** 範圍模式手動輸入的草稿狀態：低／高兩個文字框各自驗證是否為落在可接受範圍內的合法數值，並額外檢查低不可大於高 */
function useManualRangeInput(
  value: unknown,
  min: number,
  max: number,
  precision: ScalePrecision,
  onChange: (v: RangeTuple) => void
) {
  const { t } = useLanguage();
  const tuple = isRangeTuple(value) ? value : ([min, max] as RangeTuple);
  const [lowText, setLowText] = useState(() => formatNum(tuple[0]));
  const [highText, setHighText] = useState(() => formatNum(tuple[1]));
  const [lowError, setLowError] = useState<string | null>(null);
  const [highError, setHighError] = useState<string | null>(null);

  useEffect(() => {
    const next = isRangeTuple(value) ? value : ([min, max] as RangeTuple);
    setLowText(formatNum(next[0]));
    setHighText(formatNum(next[1]));
    setLowError(null);
    setHighError(null);
  }, [value, min, max]);

  const commit = (lowT: string, highT: string) => {
    const lowErr = validateScaleValue(lowT, precision, min, max, t);
    const highErr = validateScaleValue(highT, precision, min, max, t);
    let crossErr: string | null = null;
    if (!lowErr && !highErr && Number(lowT) > Number(highT)) {
      crossErr = t("scaleValuePicker.errors.lowGreaterThanHigh");
    }
    setLowError(lowErr ?? crossErr);
    setHighError(highErr ?? crossErr);
    if (!lowErr && !highErr && !crossErr) onChange([Number(lowT), Number(highT)]);
  };

  const handleLowChange = (t: string) => {
    setLowText(t);
    commit(t, highText);
  };
  const handleHighChange = (t: string) => {
    setHighText(t);
    commit(lowText, t);
  };

  return { low: tuple[0], high: tuple[1], lowText, highText, lowError, highError, handleLowChange, handleHighChange };
}

function RangeIntervalPicker({
  config,
  value,
  editing,
  onChange,
}: {
  config: ScaleFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: unknown) => void;
}) {
  const { t } = useLanguage();
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const { low, high, lowText, highText, lowError, highError, handleLowChange, handleHighChange } = useManualRangeInput(
    value,
    min,
    max,
    config.precision,
    onChange
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // 若元件在拖曳中被卸載（例如放開滑鼠前使用者取消編輯／切換欄位），確保移除殘留在 window 上的監聽器
    return () => dragCleanupRef.current?.();
  }, []);
  const span = max > min ? max - min : 1;
  const pctOf = (n: number) => ((Math.min(max, Math.max(min, n)) - min) / span) * 100;
  const lowPct = pctOf(low);
  const highPct = pctOf(high);

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return min;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + frac * (max - min);
    return config.precision === "fixed" ? Math.round(raw) : Math.round(raw * 100) / 100;
  };

  // 拖曳手把：起始時鎖定「另一端」的數值，拖曳過程即時 clamp 避免兩端交錯，放開前不經過手動輸入的驗證流程（值必為合法）
  const startDrag = (which: "low" | "high") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const otherLow = low;
    const otherHigh = high;
    const move = (ev: PointerEvent) => {
      const v = valueFromClientX(ev.clientX);
      if (which === "low") {
        onChange([Math.max(min, Math.min(v, otherHigh)), otherHigh]);
      } else {
        onChange([otherLow, Math.min(max, Math.max(v, otherLow))]);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragCleanupRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    dragCleanupRef.current = up;
  };

  const handleStyle = (pct: number): React.CSSProperties => ({
    position: "absolute",
    left: `${pct}%`,
    top: -6,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "var(--accent)",
    border: "2px solid var(--bg)",
    transform: "translateX(-50%)",
    cursor: editing ? "grab" : "default",
    touchAction: "none",
  });

  const track = (
    <div ref={trackRef} style={{ position: "relative", flex: 1, height: 6, background: "var(--border)", borderRadius: 3, minWidth: 120 }}>
      <div
        title={t("scaleValuePicker.selectedRangeTitle", { low: formatNum(low), high: formatNum(high) })}
        style={{
          position: "absolute",
          left: `${lowPct}%`,
          width: `${Math.max(0, highPct - lowPct)}%`,
          top: 0,
          bottom: 0,
          background: "var(--accent)",
          opacity: 0.5,
          borderRadius: 3,
        }}
      />
      <div title={t("scaleValuePicker.dragMinTitle")} style={handleStyle(lowPct)} onPointerDown={editing ? startDrag("low") : undefined} />
      <div title={t("scaleValuePicker.dragMaxTitle")} style={handleStyle(highPct)} onPointerDown={editing ? startDrag("high") : undefined} />
    </div>
  );

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        {track}
        <span style={{ fontSize: 12, color: "var(--text-faint)", flexShrink: 0 }}>
          {formatNum(low)} ~ {formatNum(high)}
        </span>
      </div>
    );
  }

  const step = config.precision === "fixed" ? 1 : "any";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
        {track}
        <input
          type="number"
          step={step}
          value={lowText}
          onChange={(e) => handleLowChange(e.target.value)}
          style={{ width: 64, flexShrink: 0 }}
          title={t("scaleValuePicker.rangeMinInputTitle")}
        />
        <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>~</span>
        <input
          type="number"
          step={step}
          value={highText}
          onChange={(e) => handleHighChange(e.target.value)}
          style={{ width: 64, flexShrink: 0 }}
          title={t("scaleValuePicker.rangeMaxInputTitle")}
        />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
        {t("scaleValuePicker.acceptableRange", { min, max })}
      </p>
      {(lowError || highError) && (
        <p style={{ color: "var(--danger, #e08283)", fontSize: 12, margin: 0 }}>{lowError || highError}</p>
      )}
    </div>
  );
}

function RatingPicker({
  config,
  value,
  editing,
  onChange,
}: {
  config: ScaleFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: unknown) => void;
}) {
  const { t } = useLanguage();
  const maxStars = Math.max(1, config.maxStars ?? 5);
  const { num, text, error, handleTextChange } = useManualNumberInput(value, 0, 0, maxStars, config.precision, onChange);

  const handleStarPick = (index: number, fraction: number) => {
    const raw = config.precision === "fixed" ? index + 1 : index + fraction;
    const clamped = Math.max(0, Math.min(maxStars, Math.round(raw * 100) / 100));
    onChange(clamped);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {Array.from({ length: maxStars }, (_, i) => (
          <Star key={i} fillFraction={Math.max(0, Math.min(1, num - i))} editable={editing} onPick={(frac) => handleStarPick(i, frac)} />
        ))}
        <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: 4, flexShrink: 0 }}>
          {formatNum(num)} / {maxStars}
        </span>
        {editing && (
          <input
            type="number"
            min={0}
            max={maxStars}
            step={config.precision === "fixed" ? 1 : "any"}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            style={{ width: 64, marginLeft: 6, flexShrink: 0 }}
            title={t("scaleValuePicker.manualStarInputTitle")}
          />
        )}
      </div>
      {error && <p style={{ color: "var(--danger, #e08283)", fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

/** 一顆星：底層灰色空星 + 依 fillFraction 寬度裁切的實心星疊加；editable 時點擊星內的水平位置決定填滿比例 */
function Star({
  fillFraction,
  editable,
  onPick,
}: {
  fillFraction: number;
  editable: boolean;
  onPick: (fraction: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const handleClick = (e: React.MouseEvent) => {
    if (!editable) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0.01, (e.clientX - rect.left) / rect.width));
    onPick(frac);
  };

  return (
    <div
      ref={ref}
      onClick={handleClick}
      title={editable ? t("scaleValuePicker.starClickTitle") : undefined}
      style={{ position: "relative", width: 22, height: 22, cursor: editable ? "pointer" : "default", flexShrink: 0 }}
    >
      <StarShape fill="var(--border)" />
      <div style={{ position: "absolute", top: 0, left: 0, width: `${fillFraction * 100}%`, height: 22, overflow: "hidden" }}>
        <StarShape fill="var(--accent)" />
      </div>
    </div>
  );
}

function StarShape({ fill }: { fill: string }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} style={{ position: "absolute", top: 0, left: 0 }}>
      <path
        d="M12 2.5l2.9 6.26 6.6.79-4.9 4.6 1.3 6.75L12 17.4l-5.9 3.5 1.3-6.75-4.9-4.6 6.6-.79z"
        fill={fill}
      />
    </svg>
  );
}

function ScaleEndPreview({ end }: { end?: ScaleEnd }) {
  const { t } = useLanguage();
  if (!end) return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("common.notSet")}</span>;
  if (end.kind === "text" || end.kind === "number") {
    return <span style={{ fontSize: 13, flexShrink: 0 }}>{end.text || t("common.unnamed")}</span>;
  }
  if (end.kind === "color") {
    return (
      <ResolvedColor value={end.color}>
        {(hex) => (
          <span
            style={{
              display: "inline-block",
              width: 20,
              height: 20,
              borderRadius: 4,
              background: hex ?? "var(--bg-hover)",
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          />
        )}
      </ResolvedColor>
    );
  }
  if (end.kind === "image") {
    return end.image ? (
      <img src={end.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
    ) : (
      <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("common.notSet")}</span>
    );
  }
  return <ScaleEntryEndPreview entryId={end.entryId} />;
}

function ScaleEntryEndPreview({ entryId }: { entryId?: string }) {
  const entry = useLiveQuery(() => (entryId ? db.entries.get(entryId) : undefined), [entryId]);
  const { t } = useLanguage();
  if (!entryId) return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("common.notSet")}</span>;
  return <span style={{ fontSize: 13, flexShrink: 0 }}>{entry?.name ?? t("common.deletedEntry")}</span>;
}
