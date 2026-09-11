import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Entry, World } from "../data/types";
import { searchEntries } from "../data/repositories/entry";
import EntryCard from "../components/entries/EntryCard";
import { useLanguage, categoryDisplayName } from "../i18n";

export default function SearchPage() {
  const { world } = useOutletContext<{ world: World }>();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const { t } = useLanguage();

  const categories = useLiveQuery(() => db.categories.where({ worldId: world.id }).toArray(), [world.id]);
  const allFolders = useLiveQuery(() => db.folders.where({ worldId: world.id }).toArray(), [world.id]);

  useEffect(() => {
    let ignore = false;
    searchEntries(world.id, query, categoryId || undefined).then((r) => {
      if (!ignore) setResults(r);
    });
    return () => {
      ignore = true;
    };
  }, [world.id, query, categoryId]);

  const categoryName = (id: string) => {
    const cat = categories?.find((c) => c.id === id);
    return cat ? categoryDisplayName(cat, t) : "";
  };

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t("searchPage.heading")}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          style={{ flex: 1 }}
          placeholder={t("searchPage.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t("searchPage.allCategories")}</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryDisplayName(c, t)}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((entry) => (
          <div key={entry.id}>
            <div style={{ color: "var(--text-faint)", fontSize: 12, marginBottom: 2 }}>{categoryName(entry.categoryId)}</div>
            <EntryCard
              entry={entry}
              worldId={world.id}
              folders={(allFolders ?? []).filter((f) => f.categoryId === entry.categoryId)}
            />
          </div>
        ))}
        {results.length === 0 && <p style={{ color: "var(--text-muted)" }}>{query ? t("searchPage.noResults") : t("searchPage.promptToSearch")}</p>}
      </div>
    </div>
  );
}
