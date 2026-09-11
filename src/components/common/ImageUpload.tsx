import { useState, type ReactNode } from "react";
import ImageCropModal from "./ImageCropModal";
import { useLanguage } from "../../i18n";

interface ImageUploadProps {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  label?: string;
  hint?: ReactNode;
}

export default function ImageUpload({ value, onChange, label, hint }: ImageUploadProps) {
  const { t } = useLanguage();
  const [pendingCropSrc, setPendingCropSrc] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPendingCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {value && (
          <img src={value} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
        )}
        <div>
          {label && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>}
          <label className="btn" style={{ cursor: "pointer", display: "inline-block" }}>
            {t("imageUpload.chooseFile")}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-faint)" }}>
            {value ? t("imageUpload.selected") : t("imageUpload.notSelected")}
          </span>
        </div>
        {value && (
          <button type="button" className="btn-ghost" onClick={() => onChange(undefined)}>
            {t("common.remove")}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0, width: "100%" }}>{hint}</p>}
      {pendingCropSrc && (
        <ImageCropModal
          imageSrc={pendingCropSrc}
          onCancel={() => setPendingCropSrc(null)}
          onConfirm={(cropped) => {
            onChange(cropped);
            setPendingCropSrc(null);
          }}
        />
      )}
    </div>
  );
}
