import { useState } from "react";
import Modal from "../common/Modal";
import type { ManuscriptDoc } from "../../data/manuscript/manuscriptIR";
import { buildEpubBlob } from "../../data/manuscript/exportEpub";
import { buildDocxBlob } from "../../data/manuscript/exportDocx";
import { buildPdfBlob } from "../../data/manuscript/exportPdf";
import { downloadBlob } from "../../data/downloadFile";
import { useLanguage, type TranslationKey } from "../../i18n";

interface ManuscriptExportDialogProps {
  /** 呼叫端已經用 writingDocToManuscript／scriptDocToManuscript 轉換好的內容；
   * 書名／作者在這個對話框裡還能再調整，不會回寫到原始文件 */
  manuscript: ManuscriptDoc;
  onClose: () => void;
}

type ExportFormat = "pdf" | "epub" | "docx";

const FORMAT_LABELS: Record<ExportFormat, TranslationKey> = {
  pdf: "manuscriptExportDialog.downloadPdf",
  epub: "manuscriptExportDialog.downloadEpub",
  docx: "manuscriptExportDialog.downloadDocx",
};

/** 「成稿匯出」對話框（規格文件「六、使用者設定」）：把一篇 WritingDoc／ScriptDoc 匯出成
 * PDF／EPUB／Word，全部在瀏覽器端完成。PDF 第一次產生時要下載＋嵌入約 14MB 的繁中字型檔
 * （見 exportPdf.ts），會比另外兩種格式慢一些，所以三顆按鈕各自獨立顯示產生中狀態 */
export default function ManuscriptExportDialog({ manuscript, onClose }: ManuscriptExportDialogProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(manuscript.title);
  const [author, setAuthor] = useState(manuscript.author ?? "");
  const [generating, setGenerating] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setGenerating(format);
    setError(null);
    try {
      const doc: ManuscriptDoc = { ...manuscript, title: title.trim() || t("manuscriptExportDialog.unnamedDocument"), author: author.trim() || undefined };
      const safeName = doc.title.replace(/[\\/:*?"<>|]/g, "_");
      if (format === "epub") downloadBlob(await buildEpubBlob(doc, t), `${safeName}.epub`);
      else if (format === "docx") downloadBlob(await buildDocxBlob(doc, t), `${safeName}.docx`);
      else downloadBlob(await buildPdfBlob(doc, t), `${safeName}.pdf`);
    } catch (e) {
      setError(t("imageExportDialog.exportFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <Modal title={t("manuscriptExportDialog.title")} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("manuscriptExportDialog.bookTitleLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          {t("manuscriptExportDialog.authorLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>

        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((format) => (
            <button
              key={format}
              className={format === "pdf" ? "btn btn-primary" : "btn"}
              disabled={generating !== null}
              onClick={() => handleExport(format)}
            >
              {generating === format ? t("imageExportDialog.generating") : t(FORMAT_LABELS[format])}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
