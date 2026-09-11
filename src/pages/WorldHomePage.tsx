import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { MAP_COLOR_KEY, NARRATIVE_GRAPH_COLOR_KEY, RELATION_GRAPH_COLOR_KEY, SCRIPT_DOC_COLOR_KEY, STORYBOARD_COLOR_KEY, STORY_OUTLINE_COLOR_KEY, TIMELINE_COLOR_KEY, WRITING_DOC_COLOR_KEY, type Entry, type MapView, type NarrativeGraph, type RelationGraphView, type ScriptDoc, type Storyboard, type StoryOutline, type Timeline, type World, type WritingDoc } from "../data/types";
import { useMemo, useState } from "react";
import WorldEditDialog from "../components/world/WorldEditDialog";
import { updateWorld } from "../data/repositories/world";
import { useDragReorder } from "../data/reorder";
import { reorderStarredItems, type StarredRef } from "../data/repositories/starred";
import FieldsList from "../components/entry-editor/FieldsList";
import ResolvedColor from "../components/common/ResolvedColor";
import RelationGraphPreview from "../components/relations/RelationGraphPreview";
import MapPreview from "../components/map/MapPreview";
import NarrativeGraphPreview from "../components/narrative/NarrativeGraphPreview";
import { listStarredRelationGraphs } from "../data/repositories/relationGraph";
import { listStarredMaps } from "../data/repositories/map";
import { listStarredNarrativeGraphs } from "../data/repositories/narrativeGraph";
import { listStarredWritingDocs } from "../data/repositories/writingDoc";
import { listStarredStoryboards } from "../data/repositories/storyboard";
import { listStarredScriptDocs } from "../data/repositories/scriptDoc";
import { listStarredTimelines } from "../data/repositories/timeline";
import { listStarredStoryOutlines } from "../data/repositories/storyOutline";
import { extractPlainText } from "../data/richTextText";
import { useSidePanel } from "../components/common/SidePanelProvider";
import { useLanguage, categoryDisplayName } from "../i18n";
import StoryboardPreview from "../components/storyboard/StoryboardPreview";
import TimelinePreview from "../components/timeline/TimelinePreview";
import StoryOutlinePreview from "../components/story-outline/StoryOutlinePreview";

type StarredItem =
  | { kind: "entry"; data: Entry }
  | { kind: "graph"; data: RelationGraphView }
  | { kind: "map"; data: MapView }
  | { kind: "narrative"; data: NarrativeGraph }
  | { kind: "writing"; data: WritingDoc }
  | { kind: "storyboard"; data: Storyboard }
  | { kind: "script"; data: ScriptDoc }
  | { kind: "timeline"; data: Timeline }
  | { kind: "storyOutline"; data: StoryOutline };

interface WorldHomePageProps {
  /** 提供時取代 Outlet context，供側邊面板用指定的世界渲染這個元件（面板不在 <Outlet> 底下，拿不到 context） */
  worldOverride?: World;
  /** 在側邊面板裡渲染時為 true：內部連結改為在面板本身切換內容，不導覽主畫面的網址 */
  embedded?: boolean;
}

export default function WorldHomePage({ worldOverride, embedded = false }: WorldHomePageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const world = worldOverride ?? outletContext?.world;
  const navigate = useNavigate();
  const { openPanel, panelWidth } = useSidePanel();
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();

  const starredEntriesRaw = useLiveQuery(
    () =>
      world
        ? db.entries
            .where({ worldId: world.id })
            .filter((e) => e.starred || e.starredFieldIds.length > 0)
            .toArray()
        : [],
    [world?.id]
  );
  const starredGraphsRaw = useLiveQuery(() => (world ? listStarredRelationGraphs(world.id) : []), [world?.id]);
  const starredMapsRaw = useLiveQuery(() => (world ? listStarredMaps(world.id) : []), [world?.id]);
  const starredNarrativesRaw = useLiveQuery(() => (world ? listStarredNarrativeGraphs(world.id) : []), [world?.id]);
  const starredWritingRaw = useLiveQuery(() => (world ? listStarredWritingDocs(world.id) : []), [world?.id]);
  const starredStoryboardsRaw = useLiveQuery(() => (world ? listStarredStoryboards(world.id) : []), [world?.id]);
  const starredScriptsRaw = useLiveQuery(() => (world ? listStarredScriptDocs(world.id) : []), [world?.id]);
  const starredTimelinesRaw = useLiveQuery(() => (world ? listStarredTimelines(world.id) : []), [world?.id]);
  const starredStoryOutlinesRaw = useLiveQuery(() => (world ? listStarredStoryOutlines(world.id) : []), [world?.id]);

  // 條目／關係圖／分支敘事圖／一般寫作文件／故事板／劇本文件／時間線／章節大綱合併成同一個清單，
  // 依 starOrder 排序（未設定的排最後，維持原查詢順序）
  const combinedStarred = useMemo<StarredItem[] | undefined>(() => {
    if (
      !starredEntriesRaw ||
      !starredGraphsRaw ||
      !starredMapsRaw ||
      !starredNarrativesRaw ||
      !starredWritingRaw ||
      !starredStoryboardsRaw ||
      !starredScriptsRaw ||
      !starredTimelinesRaw ||
      !starredStoryOutlinesRaw
    )
      return undefined;
    const items: StarredItem[] = [
      ...starredEntriesRaw.map((e): StarredItem => ({ kind: "entry", data: e })),
      ...starredGraphsRaw.map((g): StarredItem => ({ kind: "graph", data: g })),
      ...starredMapsRaw.map((m): StarredItem => ({ kind: "map", data: m })),
      ...starredNarrativesRaw.map((n): StarredItem => ({ kind: "narrative", data: n })),
      ...starredWritingRaw.map((w): StarredItem => ({ kind: "writing", data: w })),
      ...starredStoryboardsRaw.map((s): StarredItem => ({ kind: "storyboard", data: s })),
      ...starredScriptsRaw.map((s): StarredItem => ({ kind: "script", data: s })),
      ...starredTimelinesRaw.map((t): StarredItem => ({ kind: "timeline", data: t })),
      ...starredStoryOutlinesRaw.map((o): StarredItem => ({ kind: "storyOutline", data: o })),
    ];
    return items.sort((a, b) => (a.data.starOrder ?? Infinity) - (b.data.starOrder ?? Infinity));
  }, [
    starredEntriesRaw,
    starredGraphsRaw,
    starredMapsRaw,
    starredNarrativesRaw,
    starredWritingRaw,
    starredStoryboardsRaw,
    starredScriptsRaw,
    starredTimelinesRaw,
    starredStoryOutlinesRaw,
  ]);

  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(
    combinedStarred ?? [],
    (next) => reorderStarredItems(next.map((item): StarredRef => ({ kind: item.kind, id: item.data.id }))),
    !!combinedStarred && combinedStarred.length > 1
  );

  const categories = useLiveQuery(() => (world ? db.categories.where({ worldId: world.id }).toArray() : []), [world?.id]);
  const categoryName = (id: string) => {
    const cat = categories?.find((c) => c.id === id);
    return cat ? categoryDisplayName(cat, t) : "";
  };

  if (!world) return null;

  const colorForItem = (item: StarredItem): string | undefined => {
    if (item.kind === "entry") return world.categoryColors?.[item.data.categoryId];
    if (item.kind === "graph") return world.categoryColors?.[RELATION_GRAPH_COLOR_KEY];
    if (item.kind === "map") return world.categoryColors?.[MAP_COLOR_KEY];
    if (item.kind === "narrative") return world.categoryColors?.[NARRATIVE_GRAPH_COLOR_KEY];
    if (item.kind === "writing") return world.categoryColors?.[WRITING_DOC_COLOR_KEY];
    if (item.kind === "storyboard") return world.categoryColors?.[STORYBOARD_COLOR_KEY];
    if (item.kind === "script") return world.categoryColors?.[SCRIPT_DOC_COLOR_KEY];
    if (item.kind === "timeline") return world.categoryColors?.[TIMELINE_COLOR_KEY];
    return world.categoryColors?.[STORY_OUTLINE_COLOR_KEY];
  };

  return (
    <div>
      <div className="card" style={{ padding: 20, display: "flex", gap: 16, marginBottom: 24 }}>
        <ResolvedColor value={world.coverColor}>
          {(hex) => (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 10,
                background: hex ?? "var(--bg-hover)",
                flexShrink: 0,
              }}
            />
          )}
        </ResolvedColor>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ResolvedColor value={world.tagColor}>
                  {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
                </ResolvedColor>
                <h2>{world.name}</h2>
                {world.isSample && <span className="builtin-badge">{t("worldHome.sampleBadge")}</span>}
              </div>
              <p style={{ color: "var(--text-muted)", marginTop: 6 }}>{world.description || t("worldHome.noDescription")}</p>
            </div>
            {!world.isSample && (
              <button className="btn" onClick={() => setEditing(true)}>
                {t("worldHome.editSettings")}
              </button>
            )}
          </div>
        </div>
      </div>

      <h3 style={{ marginBottom: 12 }}>{t("worldHome.starredHeading")}</h3>
      {combinedStarred && combinedStarred.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          {t("worldHome.starredEmpty")}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {combinedStarred?.map((item, i) => {
          const color = colorForItem(item);
          return (
            <div
              key={`${item.kind}-${item.data.id}`}
              className="card"
              style={{ overflow: "hidden", opacity: dragIndex === i ? 0.5 : 1, ...dropIndicatorStyle(i) }}
              {...rowProps(i)}
            >
              {color && <div style={{ height: 5, background: color }} />}
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {combinedStarred.length > 1 && (
                      <span {...handleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("worldHome.dragToReorder")}>
                        ⠿
                      </span>
                    )}
                    <strong>{item.data.name}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                      {item.kind === "entry"
                        ? categoryName(item.data.categoryId)
                        : item.kind === "graph"
                          ? t("worldHome.kind.graph")
                          : item.kind === "map"
                            ? t("worldHome.kind.map")
                            : item.kind === "narrative"
                            ? t("worldHome.kind.narrative")
                            : item.kind === "writing"
                              ? t("worldHome.kind.writing")
                              : item.kind === "storyboard"
                                ? t("worldHome.kind.storyboard")
                                : item.kind === "script"
                                  ? t("worldHome.kind.script")
                                  : item.kind === "timeline"
                                    ? t("worldHome.kind.timeline")
                                    : t("worldHome.kind.storyOutline")}
                    </span>
                    <button
                      className="btn-ghost"
                      title={t("common.edit")}
                      onClick={() => {
                        if (item.kind === "entry") {
                          // 面板裡沒有分頁可跳轉，改成在面板本身切換到該條目（不會自動進入編輯模式）
                          if (embedded) openPanel({ kind: "entry", entryId: item.data.id });
                          else navigate(`/world/${world.id}/entry/${item.data.id}?edit=1`);
                        } else if (item.kind === "graph") {
                          if (embedded) openPanel({ kind: "relationGraph", graphId: item.data.id });
                          else navigate(`/world/${world.id}/relations/${item.data.id}`);
                        } else if (item.kind === "map") {
                          if (embedded) openPanel({ kind: "map", mapId: item.data.id });
                          else navigate(`/world/${world.id}/map/${item.data.id}`);
                        } else if (item.kind === "narrative") {
                          if (embedded) openPanel({ kind: "narrativeGraph", graphId: item.data.id });
                          else navigate(`/world/${world.id}/narrative/${item.data.id}`);
                        } else if (item.kind === "writing") {
                          if (embedded) openPanel({ kind: "writingDoc", docId: item.data.id });
                          else navigate(`/world/${world.id}/writing/${item.data.id}`);
                        } else if (item.kind === "storyboard") {
                          if (embedded) openPanel({ kind: "storyboard", storyboardId: item.data.id });
                          else navigate(`/world/${world.id}/storyboard/${item.data.id}`);
                        } else if (item.kind === "script") {
                          if (embedded) openPanel({ kind: "scriptDoc", docId: item.data.id });
                          else navigate(`/world/${world.id}/script/${item.data.id}`);
                        } else if (item.kind === "timeline") {
                          if (embedded) openPanel({ kind: "timeline", timelineId: item.data.id });
                          else navigate(`/world/${world.id}/timeline/${item.data.id}`);
                        } else {
                          if (embedded) openPanel({ kind: "storyOutline", outlineId: item.data.id });
                          else navigate(`/world/${world.id}/outline/${item.data.id}`);
                        }
                      }}
                    >
                      ✎
                    </button>
                  </div>
                </div>
                {item.kind === "entry" ? (
                  <>
                    {item.data.summary && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.summary}</p>
                    )}
                    <FieldsList
                      fields={item.data.fields}
                      values={item.data.values}
                      editing={false}
                      worldId={world.id}
                      currentEntryId={item.data.id}
                      onlyFieldIds={item.data.starred ? item.data.fields.map((f) => f.id) : item.data.starredFieldIds}
                    />
                  </>
                ) : item.kind === "graph" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <RelationGraphPreview view={item.data} worldId={world.id} />
                  </>
                ) : item.kind === "map" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <MapPreview map={item.data} />
                  </>
                ) : item.kind === "narrative" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <NarrativeGraphPreview graph={item.data} embedded={embedded} panelWidth={panelWidth} />
                  </>
                ) : item.kind === "writing" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <p
                      style={{
                        margin: 0,
                        color: "var(--text-muted)",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        maxHeight: 160,
                        overflowY: "auto",
                      }}
                    >
                      {extractPlainText(item.data.content) || t("worldHome.noContent")}
                    </p>
                  </>
                ) : item.kind === "storyboard" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <StoryboardPreview storyboard={item.data} />
                  </>
                ) : item.kind === "script" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <p
                      style={{
                        margin: 0,
                        color: "var(--text-muted)",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        maxHeight: 160,
                        overflowY: "auto",
                      }}
                    >
                      {extractPlainText(item.data.content) || t("worldHome.noContent")}
                    </p>
                  </>
                ) : item.kind === "timeline" ? (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <TimelinePreview timeline={item.data} />
                  </>
                ) : (
                  <>
                    {item.data.description && (
                      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>{item.data.description}</p>
                    )}
                    <StoryOutlinePreview outline={item.data} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <WorldEditDialog
          world={world}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await updateWorld(world.id, input);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
