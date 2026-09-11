import { useRef, useState } from "react";
import Modal from "./Modal";
import { useLanguage } from "../../i18n";

interface ImageCropModalProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

const DISPLAY_MAX = 380;
const OUTPUT_SIZE = 512;

interface Box {
  x: number;
  y: number;
  size: number;
}

export default function ImageCropModal({ imageSrc, onConfirm, onCancel }: ImageCropModalProps) {
  const { t } = useLanguage();
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, size: 0 });
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: Box } | null>(null);

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const ratio = Math.min(DISPLAY_MAX / img.naturalWidth, DISPLAY_MAX / img.naturalHeight, 1);
    const w = img.naturalWidth * ratio;
    const h = img.naturalHeight * ratio;
    setDisplaySize({ w, h });
    const size = Math.min(w, h) * 0.8;
    setBox({ x: (w - size) / 2, y: (h - size) / 2, size });
  };

  const clampBox = (b: Box, bounds: { w: number; h: number }): Box => {
    const size = Math.min(Math.max(b.size, 20), Math.min(bounds.w, bounds.h));
    const x = Math.min(Math.max(b.x, 0), bounds.w - size);
    const y = Math.min(Math.max(b.y, 0), bounds.h - size);
    return { x, y, size };
  };

  const onPointerDownMove = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode: "move", startX: e.clientX, startY: e.clientY, box };
  };

  const onPointerDownResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode: "resize", startX: e.clientX, startY: e.clientY, box };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !displaySize) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const base = dragRef.current.box;
    if (dragRef.current.mode === "move") {
      setBox(clampBox({ ...base, x: base.x + dx, y: base.y + dy }, displaySize));
    } else {
      const delta = Math.max(dx, dy);
      setBox(clampBox({ ...base, size: base.size + delta }, displaySize));
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !displaySize) return;
    const scale = img.naturalWidth / displaySize.w;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      img,
      box.x * scale,
      box.y * scale,
      box.size * scale,
      box.size * scale,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );
    onConfirm(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <Modal title={t("imageCropModal.title")} onClose={onCancel} width={460}>
      <div
        style={{
          position: "relative",
          width: displaySize?.w ?? DISPLAY_MAX,
          height: displaySize?.h ?? DISPLAY_MAX,
          margin: "0 auto",
          userSelect: "none",
          touchAction: "none",
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          onLoad={handleImgLoad}
          style={{ width: displaySize?.w, height: displaySize?.h, display: "block" }}
        />
        {displaySize && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                clipPath: `polygon(0 0, 0 100%, ${box.x}px 100%, ${box.x}px ${box.y}px, ${box.x + box.size}px ${box.y}px, ${
                  box.x + box.size
                }px ${box.y + box.size}px, ${box.x}px ${box.y + box.size}px, ${box.x}px 100%, 100% 100%, 100% 0)`,
              }}
            />
            <div
              onPointerDown={onPointerDownMove}
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.size,
                height: box.size,
                border: "2px solid var(--accent)",
                cursor: "move",
                boxSizing: "border-box",
              }}
            >
              <div
                onPointerDown={onPointerDownResize}
                style={{
                  position: "absolute",
                  right: -6,
                  bottom: -6,
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: "var(--accent)",
                  cursor: "nwse-resize",
                }}
              />
            </div>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button className="btn btn-primary" onClick={handleConfirm}>
          {t("imageCropModal.confirmCrop")}
        </button>
      </div>
    </Modal>
  );
}
