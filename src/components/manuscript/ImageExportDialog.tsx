import { useState } from "react";
import Modal from "../common/Modal";
import { downloadBlob } from "../../data/downloadFile";
import { useLanguage } from "../../i18n";

interface ImageExportDialogProps {
  title: string;
  /** 各自獨立產生，避免使用者只想要其中一種格式時，也要等另一種先跑完（PNG 光柵化跟 PDF
   * 字型載入都不是瞬間完成） */
  getPngBlob: () => Promise<Blob>;
  getPdfBlob: () => Promise<Blob>;
  onClose: () => void;
}

type ExportFormat = "png" | "pdf";

/** 比照 ManuscriptExportDialog.tsx 的 Modal 寫法，給地圖／關係圖／分支敘事圖這類視覺化內容用——
 * 只有 PNG／PDF 兩種格式，不像成稿匯出還有書名/作者可編輯（圖片本身沒有可編輯的正文內容） */
export default function ImageExportDialog({ title, getPngBlob, getPdfBlob, onClose }: ImageExportDialogProps) {
  const [generating, setGenerating] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleExport = async (format: ExportFormat) => {
    setGenerating(format);
    setError(null);
    try {
      const safeName = title.replace(/[\\/:*?"<>|]/g, "_") || t("imageExportDialog.unnamedFallback");
      if (format === "png") downloadBlob(await getPngBlob(), `${safeName}.png`);
      else downloadBlob(await getPdfBlob(), `${safeName}.pdf`);
    } catch (e) {
      setError(t("imageExportDialog.exportFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <Modal title={t("imageExportDialog.title")} onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button className="btn btn-primary" disabled={generating !== null} onClick={() => handleExport("png")}>
          {generating === "png" ? t("imageExportDialog.generating") : t("imageExportDialog.downloadPng")}
        </button>
        <button className="btn" disabled={generating !== null} onClick={() => handleExport("pdf")}>
          {generating === "pdf" ? t("imageExportDialog.generating") : t("imageExportDialog.downloadPdf")}
        </button>
      </div>
    </Modal>
  );
}
