import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { addColorSwatch, updateColorSwatch } from "../../data/repositories/colorSwatch";
import { isSwatchRef, makeSwatchRef, swatchIdFromRef, useResolvedColor } from "../../data/colorResolve";
import DropdownMenu from "./DropdownMenu";
import { useLanguage } from "../../i18n";

interface ColorInputProps {
  label?: string;
  value?: string;
  onChange: (color: string) => void;
  allowClear?: boolean;
  /** 目前所在的世界；只列出通用（全域）標籤色彩＋這個世界自己的標籤色彩，避免其他世界的專屬色彩混進來可選。
   * 省略（例如尚未建立世界、或通用範圍的內容）則只顯示通用色彩 */
  worldId?: string;
  /** value 未設定時實際會生效的顏色（例如事件顏色留空就沿用所在分支的顏色，分支本身也有預設的橘色，
   * 從來就不是真的「沒有顏色」）。提供後，色塊按鈕在未設定時會顯示這個顏色本身而不是格狀的「未設定」
   * 圖案，「無設置」的清除按鈕也會改標成「使用OO顏色」，避免使用者誤以為目前真的沒有顏色 */
  fallbackColor?: string;
  /** 搭配 fallbackColor 顯示在清除按鈕上的說明文字，例如「分支」「線段」，預設「來源」 */
  fallbackLabel?: string;
}

/** 色彩選擇器：單一按鈕點擊後彈出色彩面板（RGB／色碼 + 標籤色彩），以草稿方式編輯，按確認才寫入、取消一律還原原色 */
export default function ColorInput({ label, value, onChange, allowClear, worldId, fallbackColor, fallbackLabel }: ColorInputProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<string | undefined>(value);
  const swatches = useLiveQuery(
    () => db.colorSwatches.filter((s) => !s.scope || s.scope === "global" || s.worldId === worldId).sortBy("order"),
    [worldId]
  );
  const resolvedFallbackHex = useResolvedColor(fallbackColor);
  const resolvedValueHex = useResolvedColor(value) ?? (value ? undefined : resolvedFallbackHex);
  const resolvedDraftHex = useResolvedColor(draft) ?? (draft ? undefined : resolvedFallbackHex) ?? "#888888";
  const linkedDraft = isSwatchRef(draft);
  const linkedDraftSwatch = linkedDraft && swatches ? swatches.find((s) => s.id === swatchIdFromRef(draft!)) : undefined;

  return (
    <DropdownMenu
      align="left"
      minWidth={520}
      zIndex={9500}
      closeOnOutsideClick={false}
      onOpen={() => setDraft(value)}
      onClose={() => setDraft(value)}
      renderTrigger={({ ref, onClick }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          title={t("colorInput.clickToChooseTitle")}
          style={{
            width: 48,
            height: 36,
            padding: 0,
            borderRadius: 6,
            border: "1px solid var(--border)",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            background: resolvedValueHex
              ? resolvedValueHex
              : "repeating-conic-gradient(var(--bg-hover) 0% 25%, var(--bg) 0% 50%) 50% / 10px 10px",
            flexShrink: 0,
          }}
        />
      )}
    >
      {(close) => {
        const cancel = () => {
          setDraft(value);
          close();
        };
        const confirm = () => {
          // 只有草稿真的跟原值不一樣才觸發 onChange——開了面板但什麼都沒動就按確認（draft 從 onOpen
          // 起就等於 value）不該把 undefined 硬轉成空字串送出去，否則呼叫端若沒有另外把空字串轉回
          // undefined（例如分支/事件顏色的畫布渲染用 ?? 接預設色，只認 null/undefined，不認空字串），
          // 顏色就會從「沿用預設」的橘色變成完全沒有顏色、線條或色點直接消失不見
          if (draft !== value) onChange(draft ?? "");
          close();
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 6, maxWidth: 520 }}>
            {/* 色塊放最上方：點擊會開啟瀏覽器原生色彩面板（無法用 CSS 控制其位置或大小，固定往色塊下方或上方展開）。
                下方內容刻意分成左右兩欄，左欄留給色塊下方展開的原生面板（寬度抓一般原生面板常見的寬度預留空間），
                色票列表等其餘內容整個挪到右欄，即使原生面板往下展開也不會蓋住 */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <input
                type="color"
                value={resolvedDraftHex}
                onChange={(e) => setDraft(e.target.value)}
                style={{ width: 44, height: 36, padding: 2, cursor: "pointer", flexShrink: 0 }}
              />
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button type="button" className="btn" onClick={cancel}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="btn btn-primary" onClick={confirm}>
                  {t("colorInput.confirm")}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", width: 200, flexShrink: 0 }}>{t("colorInput.clickSwatchHint")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
                {label && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{label}</span>}
                {linkedDraft && (
                  <span style={{ fontSize: 12, color: "var(--accent)" }}>
                    {t("colorInput.linkedTo", { name: linkedDraftSwatch?.label ?? linkedDraftSwatch?.color ?? "…" })}
                  </span>
                )}
                {allowClear && (
                  <button
                    type="button"
                    className={!draft ? "btn btn-primary" : "btn-ghost"}
                    style={{ alignSelf: "flex-start", fontSize: 12 }}
                    onClick={() => setDraft("")}
                  >
                    {fallbackColor ? t("colorInput.useFallbackColor", { label: fallbackLabel ?? t("colorInput.defaultFallbackLabel") }) : t("colorInput.noColorSet")}
                  </button>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {(swatches ?? []).map((s, i) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setDraft(makeSwatchRef(s.id))}
                        title={t("colorInput.selectTagColorTitle")}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          background: s.color,
                          flexShrink: 0,
                          border: draft === makeSwatchRef(s.id) ? "2px solid var(--accent)" : "1px solid var(--border)",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      />
                      <span style={{ color: "var(--text-faint)", fontSize: 12, width: 22, flexShrink: 0 }}>#{i + 1}</span>
                      <input
                        value={s.label ?? ""}
                        placeholder={s.color}
                        onChange={(e) => updateColorSwatch(s.id, { label: e.target.value })}
                        style={{ flex: 1, fontSize: 12, padding: "3px 6px" }}
                      />
                    </div>
                  ))}
                  {(!swatches || swatches.length === 0) && (
                    <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>{t("colorInput.noSwatches")}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ alignSelf: "flex-start", fontSize: 12 }}
                  onClick={async () => {
                    const swatch = await addColorSwatch(resolvedDraftHex);
                    setDraft(makeSwatchRef(swatch.id));
                  }}
                >
                  {t("colorInput.saveAsNewSwatch")}
                </button>
              </div>
            </div>
          </div>
        );
      }}
    </DropdownMenu>
  );
}
