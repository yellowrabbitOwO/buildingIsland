import type { World } from "../../data/types";
import type { PanelView } from "../common/SidePanelProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import EntryPage from "../../pages/EntryPage";
import WorldHomePage from "../../pages/WorldHomePage";
import CategoryPage from "../../pages/CategoryPage";
import NarrativeGraphViewPage from "../../pages/NarrativeGraphViewPage";
import RelationGraphViewPage from "../../pages/RelationGraphViewPage";
import MapViewPage from "../../pages/MapViewPage";
import WritingDocViewPage from "../../pages/WritingDocViewPage";
import StoryboardViewPage from "../../pages/StoryboardViewPage";
import ScriptDocViewPage from "../../pages/ScriptDocViewPage";
import TimelineViewPage from "../../pages/TimelineViewPage";
import StoryOutlineViewPage from "../../pages/StoryOutlineViewPage";

/** 側邊面板內容分派：依 panelView 渲染條目、主世界、分類目錄、分支敘事圖、關係圖、或一般寫作文件編輯畫面 */
export default function SidePanelContent({ view, world }: { view: PanelView; world: World }) {
  const { setPanelDirty } = useSidePanel();
  if (view.kind === "entry") {
    return (
      <EntryPage
        key={view.entryId}
        entryIdOverride={view.entryId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "narrativeGraph") {
    return (
      <NarrativeGraphViewPage
        key={view.graphId}
        graphIdOverride={view.graphId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "relationGraph") {
    return (
      <RelationGraphViewPage
        key={view.graphId}
        graphIdOverride={view.graphId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "map") {
    return (
      <MapViewPage key={view.mapId} mapIdOverride={view.mapId} worldIdOverride={world.id} embedded onDirtyChange={setPanelDirty} />
    );
  }
  if (view.kind === "writingDoc") {
    return (
      <WritingDocViewPage
        key={view.docId}
        docIdOverride={view.docId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "storyboard") {
    return (
      <StoryboardViewPage
        key={view.storyboardId}
        storyboardIdOverride={view.storyboardId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "scriptDoc") {
    return (
      <ScriptDocViewPage
        key={view.docId}
        docIdOverride={view.docId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "timeline") {
    return (
      <TimelineViewPage
        key={view.timelineId}
        timelineIdOverride={view.timelineId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "storyOutline") {
    return (
      <StoryOutlineViewPage
        key={view.outlineId}
        outlineIdOverride={view.outlineId}
        worldIdOverride={world.id}
        embedded
        onDirtyChange={setPanelDirty}
      />
    );
  }
  if (view.kind === "category") {
    return <CategoryPage key={view.categoryId} categoryIdOverride={view.categoryId} worldIdOverride={world.id} embedded />;
  }
  return <WorldHomePage worldOverride={world} embedded />;
}
