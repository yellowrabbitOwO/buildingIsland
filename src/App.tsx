import { Navigate, createBrowserRouter, RouterProvider, useParams } from "react-router-dom";
import { ThemeProvider } from "./theme";
import { LanguageProvider } from "./i18n";
import { LocalUserProvider, useLocalUser } from "./localUser";
import { ConfirmProvider } from "./components/common/ConfirmProvider";
import WorldListPage from "./pages/WorldListPage";
import MainPage from "./pages/MainPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import WorldWorkspace from "./pages/WorldWorkspace";
import WorldHomePage from "./pages/WorldHomePage";
import CategoryPage from "./pages/CategoryPage";
import EntryPage from "./pages/EntryPage";
import TemplateManagerPage from "./pages/TemplateManagerPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import SearchPage from "./pages/SearchPage";
import RelationGraphPage from "./pages/RelationGraphPage";
import RelationGraphViewPage from "./pages/RelationGraphViewPage";
import MapPage from "./pages/MapPage";
import MapViewPage from "./pages/MapViewPage";
import NarrativeGraphPage from "./pages/NarrativeGraphPage";
import NarrativeGraphViewPage from "./pages/NarrativeGraphViewPage";
import WritingDocPage from "./pages/WritingDocPage";
import WritingDocViewPage from "./pages/WritingDocViewPage";
import StoryboardPage from "./pages/StoryboardPage";
import StoryboardViewPage from "./pages/StoryboardViewPage";
import ScriptDocPage from "./pages/ScriptDocPage";
import ScriptDocViewPage from "./pages/ScriptDocViewPage";
import TimelinePage from "./pages/TimelinePage";
import TimelineViewPage from "./pages/TimelineViewPage";
import StoryOutlinePage from "./pages/StoryOutlinePage";
import StoryOutlineViewPage from "./pages/StoryOutlineViewPage";

// react-router 對同一路由只換參數不會重新掛載元件；分類/條目切換時強制以 id 作為
// key 重新掛載，避免頁面內部的本地 UI 狀態（如批量選取）殘留跨到別的分類/條目。
function KeyedCategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  return <CategoryPage key={categoryId} />;
}

function KeyedEntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  return <EntryPage key={entryId} />;
}

function KeyedRelationGraphViewPage() {
  const { graphId } = useParams<{ graphId: string }>();
  return <RelationGraphViewPage key={graphId} />;
}

function KeyedMapViewPage() {
  const { mapId } = useParams<{ mapId: string }>();
  return <MapViewPage key={mapId} />;
}

function KeyedNarrativeGraphViewPage() {
  const { graphId } = useParams<{ graphId: string }>();
  return <NarrativeGraphViewPage key={graphId} />;
}

function KeyedWritingDocViewPage() {
  const { docId } = useParams<{ docId: string }>();
  return <WritingDocViewPage key={docId} />;
}

function KeyedStoryboardViewPage() {
  const { storyboardId } = useParams<{ storyboardId: string }>();
  return <StoryboardViewPage key={storyboardId} />;
}

function KeyedScriptDocViewPage() {
  const { docId } = useParams<{ docId: string }>();
  return <ScriptDocViewPage key={docId} />;
}

function KeyedTimelineViewPage() {
  const { timelineId } = useParams<{ timelineId: string }>();
  return <TimelineViewPage key={timelineId} />;
}

function KeyedStoryOutlineViewPage() {
  const { outlineId } = useParams<{ outlineId: string }>();
  return <StoryOutlineViewPage key={outlineId} />;
}

// 進 app 先看到主畫面（選登入方式），選完本地使用者（currentUserId 有值）才放行看到世界列表
// ——見規格文件「帳號與世界系統」的主畫面流程
function HomeGate() {
  const { currentUserId } = useLocalUser();
  return currentUserId ? <WorldListPage /> : <MainPage />;
}

// /settings（帳號層級的使用者設定，見 AccountSettingsPage）跟世界列表一樣，只有選好本地使用者
// 才放行，避免直接用網址列跳過 HomeGate 的登入流程
function SettingsGate() {
  const { currentUserId } = useLocalUser();
  return currentUserId ? <AccountSettingsPage /> : <Navigate to="/" replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <HomeGate /> },
  { path: "/settings", element: <SettingsGate /> },
  {
    path: "/world/:worldId",
    element: <WorldWorkspace />,
    children: [
      { index: true, element: <WorldHomePage /> },
      { path: "category/:categoryId", element: <KeyedCategoryPage /> },
      { path: "entry/:entryId", element: <KeyedEntryPage /> },
      { path: "templates", element: <TemplateManagerPage /> },
      { path: "settings", element: <UserSettingsPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "relations", element: <RelationGraphPage /> },
      { path: "relations/:graphId", element: <KeyedRelationGraphViewPage /> },
      { path: "map", element: <MapPage /> },
      { path: "map/:mapId", element: <KeyedMapViewPage /> },
      { path: "narrative", element: <NarrativeGraphPage /> },
      { path: "narrative/:graphId", element: <KeyedNarrativeGraphViewPage /> },
      { path: "writing", element: <WritingDocPage /> },
      { path: "writing/:docId", element: <KeyedWritingDocViewPage /> },
      { path: "storyboard", element: <StoryboardPage /> },
      { path: "storyboard/:storyboardId", element: <KeyedStoryboardViewPage /> },
      { path: "script", element: <ScriptDocPage /> },
      { path: "script/:docId", element: <KeyedScriptDocViewPage /> },
      { path: "timeline", element: <TimelinePage /> },
      { path: "timeline/:timelineId", element: <KeyedTimelineViewPage /> },
      { path: "outline", element: <StoryOutlinePage /> },
      { path: "outline/:outlineId", element: <KeyedStoryOutlineViewPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <LocalUserProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </LocalUserProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
