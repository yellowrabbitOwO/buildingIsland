import { useLiveQuery } from "dexie-react-hooks";
import type { StoryOutline } from "../../data/types";
import { listChapters } from "../../data/repositories/storyChapter";
import { useLanguage } from "../../i18n";

/** 主世界首頁「★ 重點內容」用的唯讀縮圖：只列出頂層篇章名稱（最多幾筆）＋篇章總數，
 * 不畫整棵樹（比照 StoryboardPreview.tsx 只列 lane 名稱不畫整塊板的既有做法） */
export default function StoryOutlinePreview({ outline }: { outline: StoryOutline }) {
  const { t } = useLanguage();
  const chapters = useLiveQuery(() => listChapters(outline.id), [outline.id]);
  if (!chapters) return null;

  const topLevel = chapters.filter((c) => !c.parentChapterId).sort((a, b) => a.order - b.order);

  if (chapters.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("storyOutlinePreview.noChapters")}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{t("storyOutlinePreview.chapterCount", { count: chapters.length })}</p>
      <p
        style={{
          margin: 0,
          color: "var(--text-muted)",
          fontSize: 12,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {topLevel
          .slice(0, 5)
          .map((c) => c.name)
          .join("、")}
      </p>
    </div>
  );
}
