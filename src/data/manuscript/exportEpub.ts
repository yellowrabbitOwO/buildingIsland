import JSZip from "jszip";
import type { ManuscriptBlock, ManuscriptDoc, ManuscriptRun } from "./manuscriptIR";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** buildEpubBlob 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 把 base64 data URL 拆成 mime type 跟純 base64 內容；這個 app 的圖片一律是 data URL
 * （見 ImageUpload.tsx 慣例），非 data URL 的來源目前不會出現，遇到就整張圖略過不輸出 */
function parseDataUrl(src: string): { mime: string; base64: string } | undefined {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(src);
  if (!m) return undefined;
  return { mime: m[1], base64: m[2] };
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runsToHtml(runs: ManuscriptRun[]): string {
  return runs
    .map((run) => {
      const lines = escapeHtml(run.text).split("\n");
      let html = lines.join("<br/>");
      if (run.code) html = `<code>${html}</code>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.underline) html = `<u>${html}</u>`;
      if (run.strike) html = `<s>${html}</s>`;
      const styles: string[] = [];
      if (run.color) styles.push(`color:${run.color}`);
      if (run.highlight) styles.push(`background-color:${run.highlight}`);
      if (run.fontSize) styles.push(`font-size:${run.fontSize}px`);
      if (styles.length > 0) html = `<span style="${styles.join(";")}">${html}</span>`;
      if (run.href) html = `<a href="${escapeHtml(run.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

const ALIGN_STYLE: Record<string, string> = {
  left: "text-align:left",
  center: "text-align:center",
  right: "text-align:right",
  justify: "text-align:justify",
};

interface ImageCollector {
  resolve(src: string): string | undefined;
  files: { name: string; base64: string }[];
}

function makeImageCollector(): ImageCollector {
  const files: { name: string; base64: string }[] = [];
  let counter = 0;
  return {
    files,
    resolve(src: string) {
      const parsed = parseDataUrl(src);
      if (!parsed) return undefined;
      const ext = MIME_EXT[parsed.mime] ?? "png";
      counter += 1;
      const name = `image${counter}.${ext}`;
      files.push({ name, base64: parsed.base64 });
      return `images/${name}`;
    },
  };
}

function blockToHtml(block: ManuscriptBlock, images: ImageCollector): string {
  switch (block.kind) {
    case "heading": {
      const style = block.align ? ` style="${ALIGN_STYLE[block.align]}"` : "";
      return `<h${block.level}${style}>${runsToHtml(block.runs)}</h${block.level}>`;
    }
    case "paragraph": {
      const style = block.align ? ` style="${ALIGN_STYLE[block.align]}"` : "";
      return `<p${style}>${runsToHtml(block.runs)}</p>`;
    }
    case "scriptLine":
      return `<p class="script-line" data-line-type="${block.lineType}">${runsToHtml(block.runs)}</p>`;
    case "bulletList":
      return `<ul>${block.items.map((item) => `<li>${item.map((b) => blockToHtml(b, images)).join("")}</li>`).join("")}</ul>`;
    case "orderedList":
      return `<ol>${block.items.map((item) => `<li>${item.map((b) => blockToHtml(b, images)).join("")}</li>`).join("")}</ol>`;
    case "blockquote":
      return `<blockquote>${block.blocks.map((b) => blockToHtml(b, images)).join("")}</blockquote>`;
    case "horizontalRule":
      return "<hr/>";
    case "codeBlock":
      return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    case "table":
      return `<table>${block.rows
        .map(
          (row) =>
            `<tr>${row.cells
              .map((cell) => {
                const tag = cell.header ? "th" : "td";
                const attrs = `${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ""}${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ""}`;
                return `<${tag}${attrs}>${cell.blocks.map((b) => blockToHtml(b, images)).join("")}</${tag}>`;
              })
              .join("")}</tr>`
        )
        .join("")}</table>`;
    case "image": {
      const path = images.resolve(block.src);
      return path ? `<img src="${path}" alt=""/>` : "";
    }
  }
}

/** 劇本各 lineType 的排版規則，跟 theme.css 的 .script-line[data-line-type=...] 規則一一對應
 * （見 src/styles/theme.css:248-282）——EPUB 讀不到 app 本身的 CSS，這裡自帶一份 */
const SCRIPT_LINE_CSS = `
.script-line { margin: 0 0 8px; }
.script-line[data-line-type="sceneHeading"] { font-weight: 700; text-transform: uppercase; margin: 18px 0 4px; }
.script-line[data-line-type="character"] { text-transform: uppercase; margin-left: 35%; margin-top: 14px; margin-bottom: 0; }
.script-line[data-line-type="parenthetical"] { margin-left: 28%; max-width: 45%; font-style: italic; margin-top: 0; margin-bottom: 0; }
.script-line[data-line-type="dialogue"] { margin-left: 20%; max-width: 60%; margin-top: 0; }
.script-line[data-line-type="transition"] { text-transform: uppercase; text-align: right; }
.script-line[data-line-type="centered"] { text-align: center; }
`;

const BASE_CSS = `
body { font-family: serif; line-height: 1.6; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #888; padding: 4px 8px; }
img { max-width: 100%; }
blockquote { margin: 0 0 0 1em; padding-left: 1em; border-left: 3px solid #ccc; color: #555; }
pre { background: #f2f2f2; padding: 8px; overflow-x: auto; }
`;

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 手刻一份 EPUB3 zip（含 EPUB2 toc.ncx 相容），不需要額外套件——EPUB 本來就是一份有固定結構的
 * zip，jszip 已經是現有相依套件。單一文件＝單一章節，不做多章節彙整（見這次功能規劃的範圍說明） */
export async function buildEpubBlob(doc: ManuscriptDoc, t: TFn = fallbackT): Promise<Blob> {
  const images = makeImageCollector();
  const bodyHtml = doc.blocks.map((b) => blockToHtml(b, images)).join("\n");
  const scriptLineUsed = doc.blocks.some((b) => b.kind === "scriptLine");
  const title = xmlEscape(doc.title || t("manuscriptExportDialog.unnamedDocument"));
  const tocTitle = xmlEscape(t("exportEpub.tocTitle"));
  const author = doc.author ? xmlEscape(doc.author) : undefined;
  const uuid = crypto.randomUUID();
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const contentXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${title}</h1>
  ${author ? `<p style="color:#666">${author}</p>` : ""}
  ${bodyHtml}
</body>
</html>`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant">
<head><meta charset="utf-8"/><title>${tocTitle}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <ol><li><a href="content.xhtml">${title}</a></li></ol>
  </nav>
</body>
</html>`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>${title}</text></navLabel>
      <content src="content.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

  const manifestImages = images.files.map((f) => `<item id="${f.name}" href="images/${f.name}" media-type="image/${f.name.endsWith(".svg") ? "svg+xml" : f.name.split(".").pop()}"/>`).join("\n    ");

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>zh-Hant</dc:language>
    ${author ? `<dc:creator>${author}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${manifestImages}
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>
  </spine>
</package>`;

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")!.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  const oebps = zip.folder("OEBPS")!;
  oebps.file("content.opf", contentOpf);
  oebps.file("nav.xhtml", navXhtml);
  oebps.file("toc.ncx", tocNcx);
  oebps.file("content.xhtml", contentXhtml);
  oebps.file("styles.css", BASE_CSS + (scriptLineUsed ? SCRIPT_LINE_CSS : ""));
  if (images.files.length > 0) {
    const imagesFolder = oebps.folder("images")!;
    for (const f of images.files) imagesFolder.file(f.name, f.base64, { base64: true });
  }

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}
