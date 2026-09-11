import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import { db } from "../../data/db";
import { createCategory } from "../../data/repositories/category";
import { useSidePanel } from "../common/SidePanelProvider";
import { useLanguage, categoryDisplayName } from "../../i18n";

interface SidebarProps {
  worldId: string;
  worldName: string;
}

const SIDEBAR_COLLAPSED_KEY = "building-island-sidebar-collapsed";

/** 側邊欄縮成一排圖示時，主要導覽項目扁平列出（不分「創作」子選單，窄欄裡巢狀選單沒有意義），
 * 供收合／展開兩種模式共用同一份資料，避免各刻一次 */
interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export default function Sidebar({ worldId, worldName }: SidebarProps) {
  const categories = useLiveQuery(
    () => db.categories.where({ worldId }).sortBy("order"),
    [worldId]
  );
  const navigate = useNavigate();
  const { openPanel } = useSidePanel();
  const { t } = useLanguage();
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creationCollapsed, setCreationCollapsed] = useState(false);
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  const setCollapsedPersisted = (value: boolean) => {
    setCollapsed(value);
    if (value) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    else localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  };

  const entryMatch = useMatch("/world/:worldId/entry/:entryId");
  const currentEntry = useLiveQuery(
    () => (entryMatch ? db.entries.get(entryMatch.params.entryId!) : undefined),
    [entryMatch?.params.entryId]
  );
  const currentEntryCategory = useLiveQuery(
    () => (currentEntry ? db.categories.get(currentEntry.categoryId) : undefined),
    [currentEntry?.categoryId]
  );
  const relationGraphMatch = useMatch("/world/:worldId/relations/:graphId");
  const mapMatch = useMatch("/world/:worldId/map/:mapId");
  const narrativeGraphMatch = useMatch("/world/:worldId/narrative/:graphId");
  const writingDocMatch = useMatch("/world/:worldId/writing/:docId");
  const storyboardMatch = useMatch("/world/:worldId/storyboard/:storyboardId");
  const scriptDocMatch = useMatch("/world/:worldId/script/:docId");
  const timelineMatch = useMatch("/world/:worldId/timeline/:timelineId");
  const storyOutlineMatch = useMatch("/world/:worldId/outline/:outlineId");

  const backLabel =
    currentEntry && currentEntryCategory
      ? t("sidebar.backTo.entry", { category: categoryDisplayName(currentEntryCategory, t) })
      : relationGraphMatch
        ? t("sidebar.backTo.relations")
        : mapMatch
          ? t("sidebar.backTo.map")
          : narrativeGraphMatch
            ? t("sidebar.backTo.narrative")
            : writingDocMatch
              ? t("sidebar.backTo.writing")
              : storyboardMatch
                ? t("sidebar.backTo.storyboard")
                : scriptDocMatch
                  ? t("sidebar.backTo.script")
                  : timelineMatch
                    ? t("sidebar.backTo.timeline")
                    : storyOutlineMatch
                      ? t("sidebar.backTo.outline")
                      : t("sidebar.backTo.worldList");
  const backTo = currentEntry
    ? `/world/${worldId}/category/${currentEntry.categoryId}`
    : relationGraphMatch
      ? `/world/${worldId}/relations`
      : mapMatch
        ? `/world/${worldId}/map`
        : narrativeGraphMatch
          ? `/world/${worldId}/narrative`
          : writingDocMatch
            ? `/world/${worldId}/writing`
            : storyboardMatch
              ? `/world/${worldId}/storyboard`
              : scriptDocMatch
                ? `/world/${worldId}/script`
                : timelineMatch
                  ? `/world/${worldId}/timeline`
                  : storyOutlineMatch
                    ? `/world/${worldId}/outline`
                    : "/";

  const submitNewCategory = async () => {
    const name = newCategoryName.trim();
    if (name) {
      const cat = await createCategory(worldId, name);
      navigate(`/world/${worldId}/category/${cat.id}`);
    }
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const navItems: NavItem[] = [
    { to: `/world/${worldId}/search`, label: t("sidebar.nav.search"), icon: "🔍" },
    { to: `/world/${worldId}`, label: t("sidebar.nav.worldHome"), icon: "🏠", end: true },
    { to: `/world/${worldId}/map`, label: t("sidebar.nav.map"), icon: "🗺" },
    { to: `/world/${worldId}/timeline`, label: t("sidebar.nav.timeline"), icon: "⏳" },
    { to: `/world/${worldId}/relations`, label: t("sidebar.nav.relations"), icon: "🔗" },
    { to: `/world/${worldId}/storyboard`, label: t("sidebar.nav.storyboard"), icon: "🎬" },
    { to: `/world/${worldId}/outline`, label: t("sidebar.nav.outline"), icon: "📖" },
    { to: `/world/${worldId}/writing`, label: t("sidebar.nav.writing"), icon: "✍" },
    { to: `/world/${worldId}/script`, label: t("sidebar.nav.script"), icon: "🎭" },
    { to: `/world/${worldId}/narrative`, label: t("sidebar.nav.narrative"), icon: "🌿" },
  ];
  const bottomNavItems: NavItem[] = [
    { to: `/world/${worldId}/templates`, label: t("sidebar.nav.templates"), icon: "⚙" },
    { to: `/world/${worldId}/settings`, label: t("sidebar.nav.settings"), icon: "👤" },
  ];

  if (collapsed) {
    return (
      <aside
        style={{
          width: 56,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100vh",
          position: "sticky",
          top: 0,
          padding: "10px 0",
        }}
      >
        <button className="btn-ghost" title={t("sidebar.expand")} onClick={() => setCollapsedPersisted(false)} style={{ marginBottom: 8 }}>
          »
        </button>
        <button className="btn-ghost" title={backLabel} onClick={() => navigate(backTo)} style={{ marginBottom: 8 }}>
          ←
        </button>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", alignItems: "center" }}>
          {navItems.map((item) => (
            <CollapsedNavLink key={item.to} {...item} />
          ))}
        </nav>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2, width: "100%", alignItems: "center" }}>
          {bottomNavItems.map((item) => (
            <CollapsedNavLink key={item.to} {...item} />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button className="btn-ghost" style={{ padding: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => navigate(backTo)}>
            ← {backLabel}
          </button>
          <button className="btn-ghost" title={t("sidebar.collapse")} onClick={() => setCollapsedPersisted(true)} style={{ flexShrink: 0 }}>
            «
          </button>
        </div>
        <h3 style={{ marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {worldName}
        </h3>
      </div>

      <nav style={{ padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>
        <SidebarLink to={`/world/${worldId}/search`} label={t("sidebar.nav.search")} />
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SidebarLink to={`/world/${worldId}`} end label={t("sidebar.nav.worldHome")} />
          </div>
          <button
            className="btn-ghost panel-trigger"
            title={t("sidebar.openBeside")}
            onClick={() => openPanel({ kind: "worldHome" })}
            style={{ flexShrink: 0, fontSize: 13 }}
          >
            ⇲
          </button>
        </div>
        <SidebarLink to={`/world/${worldId}/map`} label={t("sidebar.nav.map")} />
        <SidebarLink to={`/world/${worldId}/timeline`} label={t("sidebar.nav.timeline")} />
        <SidebarLink to={`/world/${worldId}/relations`} label={t("sidebar.nav.relations")} />
        <SidebarLink to={`/world/${worldId}/storyboard`} label={t("sidebar.nav.storyboard")} />
        <SidebarLink to={`/world/${worldId}/outline`} label={t("sidebar.nav.outline")} />
        <div style={{ marginTop: 6 }}>
          <button
            className="btn-ghost"
            // 同下面「條目分類」收合按鈕的理由——避免搶走新增分類輸入框的焦點，意外觸發送出
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCreationCollapsed((c) => !c)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "6px 10px",
              fontSize: 14,
              color: "var(--text-muted)",
              justifyContent: "flex-start",
            }}
          >
            <span>{creationCollapsed ? "▸" : "▾"}</span>
            <span>{t("sidebar.creation")}</span>
          </button>
          {!creationCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 20 }}>
              <SidebarLink to={`/world/${worldId}/writing`} label={t("sidebar.nav.writing")} />
              <SidebarLink to={`/world/${worldId}/script`} label={t("sidebar.nav.script")} />
              <SidebarLink to={`/world/${worldId}/narrative`} label={t("sidebar.nav.narrative")} />
            </div>
          )}
        </div>
      </nav>

      <div style={{ padding: "0 10px", marginTop: 10, flex: 1, overflowY: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          <button
            className="btn-ghost"
            // 新增分類的輸入框用 onBlur 觸發送出——按鈕本身沒攔住 mousedown 的話，滑鼠一按下就會先把
            // 輸入框的焦點搶走，於是輸入到一半的分類名稱被無聲送出、還連帶 navigate 過去，使用者只是
            // 想收合這個區塊而已；preventDefault 讓瀏覽器不要搬動焦點，輸入框才會留著等使用者自己決定
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCategoriesCollapsed((c) => !c)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: 0,
              fontSize: 14,
              color: "var(--text-muted)",
            }}
          >
            <span>{categoriesCollapsed ? "▸" : "▾"}</span>
            <span>{t("sidebar.categories")}</span>
          </button>
          <button
            className="btn-ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setAddingCategory(true);
              setCategoriesCollapsed(false);
            }}
            title={t("sidebar.addCategory")}
          >
            ＋
          </button>
        </div>
        {!categoriesCollapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 20 }}>
            {categories?.map((cat) => (
              <SidebarLink
                key={cat.id}
                to={`/world/${worldId}/category/${cat.id}`}
                label={categoryDisplayName(cat, t)}
              />
            ))}
          </div>
        )}
        {!categoriesCollapsed && addingCategory && (
          <div style={{ padding: "4px 10px 4px 20px" }}>
            <input
              autoFocus
              style={{ width: "100%" }}
              placeholder={t("sidebar.categoryNamePlaceholder")}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={submitNewCategory}
            />
          </div>
        )}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 4 }}>
        <SidebarLink to={`/world/${worldId}/templates`} label={t("sidebar.nav.templates")} />
        <SidebarLink to={`/world/${worldId}/settings`} label={t("sidebar.nav.settings")} />
      </div>
    </aside>
  );
}

function SidebarLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: "block",
        padding: "6px 10px",
        borderRadius: 6,
        textDecoration: "none",
        color: isActive ? "var(--text)" : "var(--text-muted)",
        background: isActive ? "var(--bg-hover)" : "transparent",
        fontWeight: isActive ? 600 : 400,
      })}
    >
      {label}
    </NavLink>
  );
}

/** 側邊欄收合成一排時的單一導覽項目：只顯示圖示，用 title 提供完整名稱（滑鼠停留可見） */
function CollapsedNavLink({ to, label, icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 6,
        textDecoration: "none",
        fontSize: 16,
        color: isActive ? "var(--text)" : "var(--text-muted)",
        background: isActive ? "var(--bg-hover)" : "transparent",
      })}
    >
      {icon}
    </NavLink>
  );
}
