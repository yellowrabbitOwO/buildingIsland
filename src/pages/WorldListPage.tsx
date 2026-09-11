import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../data/db";
import { createWorld, deleteWorld, updateWorld } from "../data/repositories/world";
import WorldEditDialog from "../components/world/WorldEditDialog";
import ResolvedColor from "../components/common/ResolvedColor";
import { useTheme } from "../theme";
import { useLanguage } from "../i18n";
import { useLocalUser } from "../localUser";
import { useConfirm } from "../components/common/ConfirmProvider";
import LocalUserAccountButton from "../components/localUser/LocalUserAccountButton";
import type { World } from "../data/types";

export default function WorldListPage() {
  const { currentUserId, setCurrentUserId } = useLocalUser();
  const worldsForUser = useLiveQuery(
    () => (currentUserId ? db.worlds.where({ localUserId: currentUserId }).toArray() : Promise.resolve<World[]>([])),
    [currentUserId]
  );
  // sortBy 不保證跟 reverse() 疊加後仍是我們要的「最近更新排最前面」，直接手動排序比較不會猜錯
  const worlds = useMemo(() => [...(worldsForUser ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [worldsForUser]);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<World | null>(null);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();

  const filtered = useMemo(() => {
    if (!worlds) return [];
    const q = query.trim().toLowerCase();
    if (!q) return worlds;
    return worlds.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.description ?? "").toLowerCase().includes(q)
    );
  }, [worlds, query]);

  const handleDelete = async (world: World) => {
    const ok = await confirm({
      title: t("worldList.deleteConfirm.title"),
      message: t("worldList.deleteConfirm.message", { name: world.name }),
    });
    if (!ok) return;
    await deleteWorld(world.id);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* 純粹返回主畫面（登入頁）——跟「登出／切換帳號」不同，不設定 forcePicker，
                MainPage 會照它自己的正常邏輯顯示登入畫面，不會被強制跳去使用者選擇畫面 */}
            <button className="btn-ghost" onClick={() => setCurrentUserId(null)}>
              {t("worldList.backToMain")}
            </button>
            <h1 style={{ whiteSpace: "nowrap" }}>Building Island</h1>
          </div>
          <LocalUserAccountButton />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12 }}>
          <input
            placeholder={t("worldList.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 180 }}
          />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            {t("common.createWorld")}
          </button>
          <button className="btn" onClick={toggleTheme} title={t("common.toggleDisplayMode")}>
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
          <button className="btn" onClick={() => navigate("/settings")}>
            {t("worldList.accountSettings")}
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("worldList.empty")}</p>
        )}
        {filtered.map((world) => (
          <div
            key={world.id}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, cursor: "pointer" }}
            onClick={() => navigate(`/world/${world.id}`)}
          >
            <ResolvedColor value={world.coverColor}>
              {(hex) => (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: hex ?? "var(--bg-hover)",
                    flexShrink: 0,
                  }}
                />
              )}
            </ResolvedColor>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ResolvedColor value={world.tagColor}>
                  {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
                </ResolvedColor>
                <strong>{world.name}</strong>
                {world.isSample && <span className="builtin-badge">{t("worldList.sampleBadge")}</span>}
              </div>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {world.description || t("worldList.noDescription")}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
              {!world.isSample && (
                <button className="btn" onClick={() => setEditing(world)}>
                  {t("worldList.modify")}
                </button>
              )}
              <button className="btn btn-danger" onClick={() => handleDelete(world)}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && currentUserId && (
        <WorldEditDialog
          onClose={() => setShowCreate(false)}
          onSubmit={async (input) => {
            const world = await createWorld({ ...input, localUserId: currentUserId });
            setShowCreate(false);
            navigate(`/world/${world.id}`);
          }}
        />
      )}
      {editing && (
        <WorldEditDialog
          world={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateWorld(editing.id, input);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
