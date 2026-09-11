import { useEffect, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import {
  RELATION_GRAPH_COLOR_KEY,
  NARRATIVE_GRAPH_COLOR_KEY,
  WRITING_DOC_COLOR_KEY,
  STORYBOARD_COLOR_KEY,
  SCRIPT_DOC_COLOR_KEY,
  TIMELINE_COLOR_KEY,
  STORY_OUTLINE_COLOR_KEY,
  templateAppliesToCategory,
  type Asset,
  type Calendar,
  type Category,
  type ColorSwatch,
  type FieldGroup,
  type FieldModule,
  type LandmarkIconType,
  type ManagerFolder,
  type ManagerKind,
  type Scope,
  type Template,
  type StoryChapterTemplate,
  type World,
} from "../data/types";
import {
  createGroup,
  createModule,
  createTemplate,
  deleteGroup,
  deleteModule,
  deleteTemplate,
  duplicateGroup,
  duplicateModule,
  duplicateTemplate,
  updateGroup,
  updateModule,
  updateTemplate,
} from "../data/repositories/template";
import { createCategory, deleteCategory, reorderCategories, updateCategory } from "../data/repositories/category";
import {
  createLandmarkIconType,
  deleteLandmarkIconType,
  listLandmarkIconTypes,
  updateLandmarkIconType,
} from "../data/repositories/landmarkIconType";
import { DEFAULT_LANDMARK_ICON_COLOR, FloorPlanLandmarkIconGraphic } from "../components/map/FloorPlanLandmarkIcons";
import ImageUpload from "../components/common/ImageUpload";
import { addColorSwatch, deleteColorSwatch, duplicateColorSwatch, updateColorSwatch } from "../data/repositories/colorSwatch";
import { updateWorldCategoryColors, updateWorldDefaultCalendar } from "../data/repositories/world";
import {
  createCalendar,
  countEventsInvalidatedByMonths,
  deleteCalendar,
  duplicateCalendar,
  listTimelinesUsingCalendar,
  updateCalendar,
  updateCalendarWeekSettings,
} from "../data/repositories/calendar";
import {
  createStoryChapterTemplate,
  deleteStoryChapterTemplate,
  duplicateStoryChapterTemplate,
  updateStoryChapterTemplate,
} from "../data/repositories/storyChapterTemplate";
import ColorInput from "../components/common/ColorInput";
import CalendarEditorDialog from "../components/templates/CalendarEditorDialog";
import CreateStoryChapterTemplateDialog from "../components/story-outline/CreateStoryChapterTemplateDialog";
import {
  buildFolderTree,
  createManagerFolder,
  deleteManagerFolder,
  descendantFolderIds,
  flattenFolderTree,
  updateManagerFolder,
  type ManagerFolderNode,
} from "../data/repositories/managerFolder";
import { useConfirm } from "../components/common/ConfirmProvider";
import BulkActionBar from "../components/common/BulkActionBar";
import CreateGroupDialog from "../components/templates/CreateGroupDialog";
import CreateModuleDialog from "../components/templates/CreateModuleDialog";
import CreateTemplateDialog from "../components/templates/CreateTemplateDialog";
import CreateFolderDialog from "../components/templates/CreateFolderDialog";
import CreateColorSwatchDialog from "../components/templates/CreateColorSwatchDialog";
import FolderSection from "../components/templates/FolderSection";
import FolderSelect from "../components/templates/FolderSelect";
import PickFolderDialog from "../components/templates/PickFolderDialog";
import DropdownMenu from "../components/common/DropdownMenu";
import { useDragReorder } from "../data/reorder";
import { createAsset, deleteAsset, listAssets, updateAsset } from "../data/repositories/asset";
import { formatBytes } from "../data/storageUsage";
import AssetRow from "../components/templates/AssetRow";
import { useLanguage, categoryDisplayName, type TranslationKey } from "../i18n";

type Tab = "categories" | "calendars" | "templates" | "chapterTemplates" | "modules" | "groups" | "colors" | "landmarkIcons" | "resources";

/** 分類頁籤裡「內建色塊」那排卡片：每個非分類、但仍能標星號顯示在主世界的內容類型各一張，
 * 只有標籤文字跟對應的 categoryColors 偽分類 key 不同，收斂成設定陣列迴圈渲染，
 * 避免每加一種新的可標星號內容類型就要再複製貼上一份幾乎一樣的 JSX 區塊 */
const BUILTIN_COLOR_KEY_CARDS: { key: string; labelKey: TranslationKey }[] = [
  { key: RELATION_GRAPH_COLOR_KEY, labelKey: "templateManagerPage.colorCard.relationGraph" },
  { key: NARRATIVE_GRAPH_COLOR_KEY, labelKey: "templateManagerPage.colorCard.narrativeGraph" },
  { key: WRITING_DOC_COLOR_KEY, labelKey: "templateManagerPage.colorCard.writingDoc" },
  { key: STORYBOARD_COLOR_KEY, labelKey: "templateManagerPage.colorCard.storyboard" },
  { key: SCRIPT_DOC_COLOR_KEY, labelKey: "templateManagerPage.colorCard.scriptDoc" },
  { key: TIMELINE_COLOR_KEY, labelKey: "templateManagerPage.colorCard.timeline" },
  { key: STORY_OUTLINE_COLOR_KEY, labelKey: "templateManagerPage.colorCard.storyOutline" },
];

function BuiltInFolder({
  title,
  count,
  onDuplicateAll,
  children,
}: {
  title: string;
  count: number;
  onDuplicateAll: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { t } = useLanguage();
  if (count === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-hover)",
          cursor: "pointer",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 600 }}>📁 {title}</span>
        <span className="builtin-badge">{t("common.builtIn")}</span>
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("categoryPage.itemCount", { count })}</span>
        <button
          className="btn-ghost"
          style={{ marginLeft: "auto" }}
          onClick={(e) => {
            e.stopPropagation();
            onDuplicateAll();
          }}
        >
          {t("templateManagerPage.duplicateWholeFolder")}
        </button>
      </div>
      {open && <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}

function partitionByFolder<T extends { folderId?: string }>(items: T[], folders: ManagerFolder[]) {
  const byFolder = new Map<string, T[]>();
  folders.forEach((f) => byFolder.set(f.id, []));
  const unfiled: T[] = [];
  for (const item of items) {
    if (item.folderId && byFolder.has(item.folderId)) byFolder.get(item.folderId)!.push(item);
    else unfiled.push(item);
  }
  return { byFolder, unfiled };
}

/** 遞迴渲染資料夾樹（範本/模組/群組/標籤色彩/資源共用）：每個 FolderSection 裡先放子資料夾們，再放這層自己的項目 */
function renderFolderTree(
  nodes: ManagerFolderNode[],
  opts: {
    itemsFor: (folderId: string) => ReactNode[];
    onRename: (folder: ManagerFolder, name: string) => void;
    onScopeChange: (folder: ManagerFolder, scope: Scope) => void;
    onColorChange: (folder: ManagerFolder, tagColor: string) => void;
    onDelete: (folder: ManagerFolder) => void;
    onDuplicate?: (folder: ManagerFolder) => void;
    onAddSubfolder: (folder: ManagerFolder) => void;
    onMove: (folder: ManagerFolder) => void;
  }
): ReactNode {
  return nodes.map((node) => {
    const items = opts.itemsFor(node.folder.id);
    const hasSubfolders = node.children.length > 0;
    return (
      <FolderSection
        key={node.folder.id}
        folder={node.folder}
        itemCount={items.length}
        isEmpty={items.length === 0 && !hasSubfolders}
        onRename={(name) => opts.onRename(node.folder, name)}
        onScopeChange={(scope) => opts.onScopeChange(node.folder, scope)}
        onColorChange={(tagColor) => opts.onColorChange(node.folder, tagColor)}
        onDelete={() => opts.onDelete(node.folder)}
        onDuplicate={opts.onDuplicate ? () => opts.onDuplicate!(node.folder) : undefined}
        onAddSubfolder={() => opts.onAddSubfolder(node.folder)}
        onMove={() => opts.onMove(node.folder)}
      >
        {hasSubfolders && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: items.length ? 8 : 0 }}>
            {renderFolderTree(node.children, opts)}
          </div>
        )}
        {items}
      </FolderSection>
    );
  });
}

export default function TemplateManagerPage() {
  const { world } = useOutletContext<{ world: World }>();
  const [tab, setTab] = useState<Tab>("templates");
  const confirm = useConfirm();
  const { t } = useLanguage();

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showCreateChapterTemplate, setShowCreateChapterTemplate] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState<{ kind: ManagerKind; parentFolderId?: string } | null>(null);
  const [showCreateColorSwatch, setShowCreateColorSwatch] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FieldGroup | null>(null);
  const [editingModule, setEditingModule] = useState<FieldModule | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editingChapterTemplate, setEditingChapterTemplate] = useState<StoryChapterTemplate | null>(null);
  const [viewingGroup, setViewingGroup] = useState<FieldGroup | null>(null);
  const [viewingModule, setViewingModule] = useState<FieldModule | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const [viewingChapterTemplate, setViewingChapterTemplate] = useState<StoryChapterTemplate | null>(null);
  const [viewingCalendar, setViewingCalendar] = useState<Calendar | null>(null);
  const [pickingFolder, setPickingFolder] = useState<
    | { kind: "template"; item: Template }
    | { kind: "chapterTemplate"; item: StoryChapterTemplate }
    | { kind: "module"; item: FieldModule }
    | { kind: "group"; item: FieldGroup }
    | { kind: "calendar"; item: Calendar }
    | { kind: "resource"; item: Asset }
    | null
  >(null);
  const [movingFolder, setMovingFolder] = useState<ManagerFolder | null>(null);
  const [showCreateCalendar, setShowCreateCalendar] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const [showCreateLandmarkIcon, setShowCreateLandmarkIcon] = useState(false);
  const [newLandmarkIconLabel, setNewLandmarkIconLabel] = useState("");
  const [newLandmarkIconImage, setNewLandmarkIconImage] = useState<string | undefined>(undefined);
  // 名稱草稿用 id→草稿字串的表，不是單一 editingId/editingName——這個分頁的每一列名稱都能直接
  // 編輯（內建、自訂皆可），不像分類頁籤只有自訂項目才能改名、需要先按「改名」才切換成輸入框
  const [landmarkIconLabelDrafts, setLandmarkIconLabelDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categories = useLiveQuery(() => db.categories.where({ worldId: world.id }).toArray(), [world.id]);
  const sortedCategories = [...(categories ?? [])].sort((a, b) => a.order - b.order);

  const landmarkIconTypesList = useLiveQuery(() => listLandmarkIconTypes(world.id), [world.id]);
  const sortedLandmarkIconTypes = [...(landmarkIconTypesList ?? [])].sort((a, b) => a.order - b.order);
  const {
    handleProps: categoryHandleProps,
    rowProps: categoryRowProps,
    dragIndex: categoryDragIndex,
    dropIndicatorStyle: categoryDropIndicatorStyle,
  } = useDragReorder(
    sortedCategories,
    (next) => reorderCategories(next.map((c) => c.id)),
    tab === "categories"
  );
  const templates = useLiveQuery(
    () => db.templates.filter((t) => t.scope === "global" || t.worldId === world.id).toArray(),
    [world.id]
  );
  const chapterTemplates = useLiveQuery(
    () => db.storyChapterTemplates.filter((t) => t.scope === "global" || t.worldId === world.id).toArray(),
    [world.id]
  );
  const groups = useLiveQuery(
    () => db.groups.filter((g) => g.scope === "global" || g.worldId === world.id).toArray(),
    [world.id]
  );
  const modules = useLiveQuery(
    () => db.modules.filter((m) => m.scope === "global" || m.worldId === world.id).toArray(),
    [world.id]
  );
  const swatches = useLiveQuery(
    () => db.colorSwatches.filter((s) => !s.scope || s.scope === "global" || s.worldId === world.id).sortBy("order"),
    [world.id]
  );
  const calendars = useLiveQuery(
    () => db.calendars.filter((c) => c.scope === "global" || c.worldId === world.id).toArray(),
    [world.id]
  );
  const assets = useLiveQuery(() => listAssets(world.id), [world.id]);
  const allFolders = useLiveQuery(() => db.managerFolders.toArray(), []) ?? [];

  const foldersFor = (kind: ManagerKind): ManagerFolder[] =>
    allFolders
      .filter((f) => f.kind === kind && (f.scope === "global" || f.worldId === world.id))
      .sort((a, b) => a.order - b.order);

  const categoryLabel = (tpl: { allCategories?: boolean; categoryId?: string; builtInCategoryKey?: string }) => {
    if (tpl.allCategories) return t("templateManagerPage.allCategoriesLabel");
    if (tpl.categoryId) {
      const cat = categories?.find((c) => c.id === tpl.categoryId);
      return cat ? categoryDisplayName(cat, t) : t("templateManagerPage.deletedCategoryLabel");
    }
    if (tpl.builtInCategoryKey) {
      const cat = categories?.find((c) => c.builtInKey === tpl.builtInCategoryKey);
      return cat ? categoryDisplayName(cat, t) : tpl.builtInCategoryKey;
    }
    return "";
  };

  const restrictionLabel = (item: { restrictedCategoryIds?: string[] }) => {
    if (!item.restrictedCategoryIds?.length) return null;
    const names = item.restrictedCategoryIds
      .map((id) => categories?.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => categoryDisplayName(c, t));
    return t("templateManagerPage.restrictedLabel", { names: names.join(t("entryLinkPicker.separator")) });
  };

  const builtInTemplates = templates?.filter((t) => t.isBuiltIn) ?? [];
  const customTemplates = templates?.filter((t) => !t.isBuiltIn) ?? [];
  const builtInChapterTemplates = chapterTemplates?.filter((t) => t.isBuiltIn) ?? [];
  const customChapterTemplates = chapterTemplates?.filter((t) => !t.isBuiltIn) ?? [];
  const builtInModules = modules?.filter((m) => m.isBuiltIn) ?? [];
  const customModules = modules?.filter((m) => !m.isBuiltIn) ?? [];
  const builtInGroups = groups?.filter((g) => g.isBuiltIn) ?? [];
  const customGroups = groups?.filter((g) => !g.isBuiltIn) ?? [];
  const builtInCalendars = calendars?.filter((c) => c.isBuiltIn) ?? [];
  const customCalendars = calendars?.filter((c) => !c.isBuiltIn) ?? [];

  const templateFolders = foldersFor("template");
  const chapterTemplateFolders = foldersFor("storyChapterTemplate");
  const moduleFolders = foldersFor("module");
  const groupFolders = foldersFor("group");
  const colorFolders = foldersFor("color");
  const resourceFolders = foldersFor("resource");
  const calendarFolders = foldersFor("calendar");

  const { byFolder: templatesByFolder, unfiled: unfiledTemplates } = partitionByFolder(customTemplates, templateFolders);
  const { byFolder: chapterTemplatesByFolder, unfiled: unfiledChapterTemplates } = partitionByFolder(
    customChapterTemplates,
    chapterTemplateFolders
  );
  const { byFolder: modulesByFolder, unfiled: unfiledModules } = partitionByFolder(customModules, moduleFolders);
  const { byFolder: groupsByFolder, unfiled: unfiledGroups } = partitionByFolder(customGroups, groupFolders);
  const { byFolder: colorsByFolder, unfiled: unfiledColors } = partitionByFolder(swatches ?? [], colorFolders);
  const { byFolder: calendarsByFolder, unfiled: unfiledCalendars } = partitionByFolder(customCalendars, calendarFolders);
  const { byFolder: assetsByFolder, unfiled: unfiledAssets } = partitionByFolder(assets ?? [], resourceFolders);

  const handleDeleteTemplate = async (tpl: Template) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteTemplateConfirm.title"),
      message: t("templateManagerPage.deleteTemplateConfirm.message", { name: tpl.name }),
    });
    if (ok) await deleteTemplate(tpl.id);
  };
  const handleDeleteChapterTemplate = async (tpl: StoryChapterTemplate) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteChapterTemplateConfirm.title"),
      message: t("templateManagerPage.deleteChapterTemplateConfirm.message", { name: tpl.name }),
    });
    if (ok) await deleteStoryChapterTemplate(tpl.id);
  };
  const handleDeleteModule = async (m: FieldModule) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteModuleConfirm.title"),
      message: t("templateManagerPage.deleteModuleConfirm.message", { name: m.name }),
    });
    if (ok) await deleteModule(m.id);
  };
  const handleDeleteGroup = async (g: FieldGroup) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteGroupConfirm.title"),
      message: t("templateManagerPage.deleteGroupConfirm.message", { name: g.name }),
    });
    if (ok) await deleteGroup(g.id);
  };
  const handleDeleteSwatch = async (label: string, id: string) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteSwatchConfirm.title"),
      message: t("templateManagerPage.deleteSwatchConfirm.message", { label }),
    });
    if (ok) await deleteColorSwatch(id);
  };
  const handleDeleteCalendar = async (c: Calendar) => {
    const usedBy = await listTimelinesUsingCalendar(c.id);
    if (usedBy.length > 0) {
      await confirm({
        title: t("templateManagerPage.cannotDeleteCalendarConfirm.title"),
        message: t("templateManagerPage.cannotDeleteCalendarConfirm.message", {
          name: c.name,
          list: usedBy.map((tl) => tl.name).join(t("entryLinkPicker.separator")),
        }),
        confirmLabel: t("templateManagerPage.gotIt"),
      });
      return;
    }
    const ok = await confirm({
      title: t("templateManagerPage.deleteCalendarConfirm.title"),
      message: t("templateManagerPage.deleteCalendarConfirm.message", { name: c.name }),
    });
    if (ok) await deleteCalendar(c.id);
  };
  const handleUploadAssets = async (files: FileList | null, folderId?: string) => {
    if (!files) return;
    for (const file of Array.from(files)) await createAsset(file, "world", world.id, folderId);
  };
  const handleDeleteAsset = async (a: Asset) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteAssetConfirm.title"),
      message: t("templateManagerPage.deleteAssetConfirm.message", { name: a.name }),
    });
    if (ok) await deleteAsset(a.id);
  };
  const handleDeleteFolder = async (folder: ManagerFolder) => {
    const sameKindFolders = allFolders.filter((f) => f.kind === folder.kind);
    const subtreeIds = descendantFolderIds(folder.id, sameKindFolders);

    // 曆法資料夾比較特殊：裡面的曆法若正被時間線使用中，刪除資料夾會讓該時間線的 calendarId
    // 變成懸空參照（不像範本/群組/模組/標籤色彩刪除只是「不再套用」，可以安全連坐刪除），
    // 所以要先掃過這個資料夾（含子資料夾）裡的所有曆法，擋住使用中的
    if (folder.kind === "calendar") {
      const calendarsInSubtree = (calendars ?? []).filter((c) => c.folderId && subtreeIds.has(c.folderId));
      const usedCalendars: { calendar: Calendar; usedBy: { id: string; name: string }[] }[] = [];
      for (const c of calendarsInSubtree) {
        const usedBy = await listTimelinesUsingCalendar(c.id);
        if (usedBy.length > 0) usedCalendars.push({ calendar: c, usedBy });
      }
      if (usedCalendars.length > 0) {
        const detail = usedCalendars
          .map(({ calendar, usedBy }) =>
            t("templateManagerPage.calendarUsedDetail", { name: calendar.name, usedBy: usedBy.map((tl) => tl.name).join(t("entryLinkPicker.separator")) })
          )
          .join(t("entryLinkPicker.separator"));
        await confirm({
          title: t("templateManagerPage.cannotDeleteFolderConfirm.title"),
          message: t("templateManagerPage.cannotDeleteFolderConfirm.message", { detail }),
          confirmLabel: t("templateManagerPage.gotIt"),
        });
        return;
      }
    }

    const itemNames =
      folder.kind === "template"
        ? (templatesByFolder.get(folder.id) ?? []).map((t) => t.name)
        : folder.kind === "storyChapterTemplate"
          ? (chapterTemplatesByFolder.get(folder.id) ?? []).map((t) => t.name)
          : folder.kind === "module"
            ? (modulesByFolder.get(folder.id) ?? []).map((m) => m.name)
            : folder.kind === "group"
              ? (groupsByFolder.get(folder.id) ?? []).map((g) => g.name)
              : folder.kind === "color"
                ? (colorsByFolder.get(folder.id) ?? []).map((c) => c.label || c.color)
                : folder.kind === "calendar"
                  ? (calendarsByFolder.get(folder.id) ?? []).map((c) => c.name)
                  : folder.kind === "resource"
                    ? (assetsByFolder.get(folder.id) ?? []).map((a) => a.name)
                    : [];
    const itemsNote =
      itemNames.length > 0 ? t("templateManagerPage.deleteFolderConfirm.itemsNote", { items: itemNames.join(t("entryLinkPicker.separator")) }) : "";
    const subCount = subtreeIds.size - 1;
    const subNote = subCount > 0 ? t("templateManagerPage.deleteFolderConfirm.subNote", { count: subCount }) : "";
    const ok = await confirm({
      title: t("templateManagerPage.deleteFolderConfirm.title"),
      message: t("templateManagerPage.deleteFolderConfirm.message", { name: folder.name, itemsNote, subNote }),
    });
    if (ok) await deleteManagerFolder(folder.id);
  };

  const submitNewCategory = async () => {
    const name = newCategoryName.trim();
    if (name) await createCategory(world.id, name);
    setNewCategoryName("");
    setShowCreateCategory(false);
  };

  const startRenameCategory = (c: Category) => {
    setEditingCategoryId(c.id);
    setEditingCategoryName(c.name);
  };

  const commitRenameCategory = async () => {
    const name = editingCategoryName.trim();
    if (editingCategoryId && name) await updateCategory(editingCategoryId, { name });
    setEditingCategoryId(null);
  };

  const setCategoryColor = async (key: string, color: string | undefined) => {
    const next = { ...(world.categoryColors ?? {}) };
    if (color) next[key] = color;
    else delete next[key];
    await updateWorldCategoryColors(world.id, next);
  };

  const handleDeleteCategory = async (c: Category) => {
    const entries = await db.entries.where({ categoryId: c.id }).toArray();
    const itemsNote = entries.length > 0 ? t("templateManagerPage.deleteCategoryConfirm.itemsNote", { count: entries.length }) : "";
    const ok = await confirm({
      title: t("templateManagerPage.deleteCategoryConfirm.title"),
      message: t("templateManagerPage.deleteCategoryConfirm.message", { name: c.name, itemsNote }),
    });
    if (ok) await deleteCategory(c.id);
  };

  const commitLandmarkIconLabel = async (id: string) => {
    const draft = landmarkIconLabelDrafts[id];
    if (draft !== undefined && draft.trim()) await updateLandmarkIconType(id, { label: draft.trim() });
    setLandmarkIconLabelDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  const submitNewLandmarkIcon = async () => {
    const label = newLandmarkIconLabel.trim();
    if (label) await createLandmarkIconType(world.id, { label, customImage: newLandmarkIconImage });
    setNewLandmarkIconLabel("");
    setNewLandmarkIconImage(undefined);
    setShowCreateLandmarkIcon(false);
  };

  const handleDeleteLandmarkIcon = async (icon: LandmarkIconType) => {
    const ok = await confirm({
      title: t("templateManagerPage.deleteLandmarkIconConfirm.title"),
      message: t("templateManagerPage.deleteLandmarkIconConfirm.message", { name: icon.label }),
    });
    if (ok) await deleteLandmarkIconType(icon.id);
  };

  const duplicateBuiltInFolder = async (kind: ManagerKind, title: string) => {
    const newFolder = await createManagerFolder(kind, `${title}${t("templateManagerPage.copySuffix")}`, "world", world.id);
    if (kind === "template") for (const tpl of builtInTemplates) await duplicateTemplate(tpl.id, world.id, newFolder.id, t);
    else if (kind === "storyChapterTemplate")
      for (const tpl of builtInChapterTemplates) await duplicateStoryChapterTemplate(tpl.id, world.id, newFolder.id, t);
    else if (kind === "module") for (const m of builtInModules) await duplicateModule(m.id, world.id, newFolder.id, t);
    else if (kind === "group") for (const g of builtInGroups) await duplicateGroup(g.id, world.id, newFolder.id, t);
    else if (kind === "calendar") for (const c of builtInCalendars) await duplicateCalendar(c.id, world.id, newFolder.id, t);
  };

  const duplicateCustomFolder = async (kind: ManagerKind, folder: ManagerFolder) => {
    const newFolder = await createManagerFolder(kind, `${folder.name}${t("templateManagerPage.copySuffix")}`, folder.scope, world.id, folder.tagColor);
    if (kind === "template") for (const tpl of templatesByFolder.get(folder.id) ?? []) await duplicateTemplate(tpl.id, world.id, newFolder.id, t);
    else if (kind === "storyChapterTemplate")
      for (const tpl of chapterTemplatesByFolder.get(folder.id) ?? []) await duplicateStoryChapterTemplate(tpl.id, world.id, newFolder.id, t);
    else if (kind === "module") for (const m of modulesByFolder.get(folder.id) ?? []) await duplicateModule(m.id, world.id, newFolder.id, t);
    else if (kind === "group") for (const g of groupsByFolder.get(folder.id) ?? []) await duplicateGroup(g.id, world.id, newFolder.id, t);
    else if (kind === "color") for (const c of colorsByFolder.get(folder.id) ?? []) await duplicateColorSwatch(c.id, newFolder.id, t);
    else if (kind === "calendar") for (const c of calendarsByFolder.get(folder.id) ?? []) await duplicateCalendar(c.id, world.id, newFolder.id, t);
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: t("templateManagerPage.bulkDeleteConfirm.title"),
      message: t("templateManagerPage.bulkDeleteConfirm.message", { count: selectedIds.size }),
    });
    if (!ok) return;
    if (tab === "templates") for (const id of selectedIds) await deleteTemplate(id);
    else if (tab === "chapterTemplates") for (const id of selectedIds) await deleteStoryChapterTemplate(id);
    else if (tab === "modules") for (const id of selectedIds) await deleteModule(id);
    else if (tab === "groups") for (const id of selectedIds) await deleteGroup(id);
    else if (tab === "colors") for (const id of selectedIds) await deleteColorSwatch(id);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async (folderId: string | undefined) => {
    if (tab === "templates") for (const id of selectedIds) await updateTemplate(id, { folderId });
    else if (tab === "chapterTemplates") for (const id of selectedIds) await updateStoryChapterTemplate(id, { folderId });
    else if (tab === "modules") for (const id of selectedIds) await updateModule(id, { folderId });
    else if (tab === "groups") for (const id of selectedIds) await updateGroup(id, { folderId });
    else if (tab === "colors") for (const id of selectedIds) await updateColorSwatch(id, { folderId });
    setSelectedIds(new Set());
  };

  const handleBulkDuplicate = async () => {
    if (tab === "templates") for (const id of selectedIds) await duplicateTemplate(id, world.id, undefined, t);
    else if (tab === "chapterTemplates") for (const id of selectedIds) await duplicateStoryChapterTemplate(id, world.id, undefined, t);
    else if (tab === "modules") for (const id of selectedIds) await duplicateModule(id, world.id, undefined, t);
    else if (tab === "groups") for (const id of selectedIds) await duplicateGroup(id, world.id, undefined, t);
    else if (tab === "colors") for (const id of selectedIds) await duplicateColorSwatch(id, undefined, t);
    setSelectedIds(new Set());
  };

  const currentFolderOptions =
    tab === "templates" ? templateFolders
    : tab === "chapterTemplates" ? chapterTemplateFolders
    : tab === "modules" ? moduleFolders
    : tab === "groups" ? groupFolders
    : tab === "colors" ? colorFolders
    : resourceFolders;

  // 內建項目在批量模式下完全不會渲染 checkbox（見 BuiltInFolder 於 bulkMode 時隱藏），
  // 因此這裡的可選清單只會包含自訂項目，內建內容不會受批量操作影響
  const currentSelectableIds =
    tab === "templates" ? customTemplates.map((t) => t.id)
    : tab === "chapterTemplates" ? customChapterTemplates.map((t) => t.id)
    : tab === "modules" ? customModules.map((m) => m.id)
    : tab === "groups" ? customGroups.map((g) => g.id)
    : tab === "colors" ? (swatches ?? []).map((s) => s.id)
    : [];

  const checkbox = (id: string) =>
    bulkMode ? (
      <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleSelect(id)} style={{ marginRight: 4 }} />
    ) : null;

  const templateRow = (tpl: Template) => (
    <div key={tpl.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checkbox(tpl.id)}
        <div>
          <strong>{tpl.name}</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("templateManagerPage.templateSubtitle", {
              category: categoryLabel(tpl),
              scope: tpl.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeWorld"),
              count: tpl.blocks.length,
            })}
          </div>
        </div>
      </div>
      {!bulkMode && (
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={180}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setPickingFolder({ kind: "template", item: tpl });
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: templateFolders.find((f) => f.id === tpl.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              {!tpl.allCategories &&
                categories?.find((c) => templateAppliesToCategory(tpl, c))?.defaultTemplateId !== tpl.id && (
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    onClick={async () => {
                      const cat = categories?.find((c) => templateAppliesToCategory(tpl, c));
                      if (cat) await updateCategory(cat.id, { defaultTemplateId: tpl.id });
                      close();
                    }}
                  >
                    {t("templateManagerPage.setAsDefault")}
                  </button>
                )}
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setEditingTemplate(tpl);
                  close();
                }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  duplicateTemplate(tpl.id, world.id, undefined, t);
                  close();
                }}
              >
                {t("common.duplicate")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  handleDeleteTemplate(tpl);
                  close();
                }}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </DropdownMenu>
      )}
    </div>
  );

  const chapterTemplateRow = (tpl: StoryChapterTemplate) => (
    <div key={tpl.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checkbox(tpl.id)}
        <div>
          <strong>{tpl.name}</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("templateManagerPage.scopeAndBlockCount", {
              scope: tpl.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeWorld"),
              count: tpl.blocks.length,
            })}
          </div>
        </div>
      </div>
      {!bulkMode && (
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={180}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setPickingFolder({ kind: "chapterTemplate", item: tpl });
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: chapterTemplateFolders.find((f) => f.id === tpl.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setEditingChapterTemplate(tpl);
                  close();
                }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  duplicateStoryChapterTemplate(tpl.id, world.id, undefined, t);
                  close();
                }}
              >
                {t("common.duplicate")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  handleDeleteChapterTemplate(tpl);
                  close();
                }}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </DropdownMenu>
      )}
    </div>
  );

  const moduleRow = (m: FieldModule) => (
    <div key={m.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checkbox(m.id)}
        <div>
          <strong>{m.name}</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("templateManagerPage.scopeAndBlockCount", {
              scope: m.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeWorld"),
              count: m.blocks.length,
            })}
            {restrictionLabel(m) && <> · {restrictionLabel(m)}</>}
          </div>
        </div>
      </div>
      {!bulkMode && (
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={180}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setPickingFolder({ kind: "module", item: m });
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: moduleFolders.find((f) => f.id === m.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setEditingModule(m);
                  close();
                }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  duplicateModule(m.id, world.id, undefined, t);
                  close();
                }}
              >
                {t("common.duplicate")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  handleDeleteModule(m);
                  close();
                }}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </DropdownMenu>
      )}
    </div>
  );

  const groupRow = (g: FieldGroup) => (
    <div key={g.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checkbox(g.id)}
        <div>
          <strong>{g.name}</strong>
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("templateManagerPage.scopeAndFieldCount", {
              scope: g.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeWorld"),
              count: g.fields.length,
            })}
            {restrictionLabel(g) && <> · {restrictionLabel(g)}</>}
          </div>
        </div>
      </div>
      {!bulkMode && (
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={180}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setPickingFolder({ kind: "group", item: g });
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: groupFolders.find((f) => f.id === g.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setEditingGroup(g);
                  close();
                }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  duplicateGroup(g.id, world.id, undefined, t);
                  close();
                }}
              >
                {t("common.duplicate")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  handleDeleteGroup(g);
                  close();
                }}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </DropdownMenu>
      )}
    </div>
  );

  const colorRow = (s: ColorSwatch, index: number) => (
    <div key={s.id} className="card" style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
      {checkbox(s.id)}
      <span style={{ color: "var(--text-faint)", fontSize: 12, width: 22 }}>#{index + 1}</span>
      <input
        type="color"
        value={s.color}
        onChange={(e) => updateColorSwatch(s.id, { color: e.target.value })}
        style={{ width: 32, height: 28, padding: 2, cursor: "pointer" }}
        disabled={bulkMode}
      />
      <input
        value={s.label ?? ""}
        placeholder={t("common.unnamed")}
        onChange={(e) => updateColorSwatch(s.id, { label: e.target.value })}
        style={{ flex: 1 }}
        disabled={bulkMode}
      />
      {!bulkMode && (
        <>
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{s.color}</span>
          <button
            className="btn-ghost"
            style={{ fontSize: 12 }}
            title={t("templateManagerPage.toggleScopeTitle")}
            onClick={() =>
              updateColorSwatch(s.id, {
                scope: s.scope === "world" ? "global" : "world",
                worldId: s.scope === "world" ? undefined : world.id,
              })
            }
          >
            {!s.scope || s.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeSingleWorld")}
          </button>
          <FolderSelect folders={colorFolders} value={s.folderId} onChange={(folderId) => updateColorSwatch(s.id, { folderId })} />
          <button className="btn-ghost" onClick={() => handleDeleteSwatch(s.label || s.color, s.id)}>
            {t("common.delete")}
          </button>
        </>
      )}
    </div>
  );

  const calendarRow = (c: Calendar) => (
    <div key={c.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {checkbox(c.id)}
        <div>
          <strong>{c.name}</strong>
          {world.defaultCalendarId === c.id && (
            <span className="builtin-badge" style={{ marginLeft: 8 }} title={t("templateManagerPage.defaultCalendarHint")}>
              {t("templateManagerPage.defaultCalendarBadge")}
            </span>
          )}
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("templateManagerPage.scopeAndMonthCount", {
              scope: c.scope === "global" ? t("templateManagerPage.scopeGlobal") : t("templateManagerPage.scopeWorld"),
              count: c.months.length,
            })}
          </div>
        </div>
      </div>
      {!bulkMode && (
        <DropdownMenu label="⚙️" title={t("fieldActionsMenu.moreActionsTitle")} align="right" minWidth={180}>
          {(close) => (
            <>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  updateWorldDefaultCalendar(world.id, world.defaultCalendarId === c.id ? undefined : c.id);
                  close();
                }}
              >
                {world.defaultCalendarId === c.id ? t("templateManagerPage.unsetDefaultCalendar") : t("templateManagerPage.setDefaultCalendar")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setPickingFolder({ kind: "calendar", item: c });
                  close();
                }}
              >
                {t("templateManagerPage.moveToFolderLabel", { folder: calendarFolders.find((f) => f.id === c.folderId)?.name ?? t("entryCard.unfiled") })}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  setEditingCalendar(c);
                  close();
                }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  duplicateCalendar(c.id, world.id, undefined, t);
                  close();
                }}
              >
                {t("common.duplicate")}
              </button>
              <button
                className="btn-ghost"
                style={{ textAlign: "left" }}
                onClick={() => {
                  handleDeleteCalendar(c);
                  close();
                }}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </DropdownMenu>
      )}
    </div>
  );

  const assetRow = (a: Asset) => (
    <AssetRow
      key={a.id}
      asset={a}
      folders={resourceFolders}
      onRename={(name) => updateAsset(a.id, { name })}
      onToggleScope={() =>
        updateAsset(a.id, {
          scope: a.scope === "world" ? "global" : "world",
          worldId: a.scope === "world" ? undefined : world.id,
        })
      }
      onMove={() => setPickingFolder({ kind: "resource", item: a })}
      onDelete={() => handleDeleteAsset(a)}
    />
  );

  const kindForTab: Partial<Record<Tab, ManagerKind>> = {
    templates: "template",
    chapterTemplates: "storyChapterTemplate",
    modules: "module",
    groups: "group",
    colors: "color",
    resources: "resource",
    calendars: "calendar",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("templateManagerPage.title")}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {tab !== "categories" && tab !== "landmarkIcons" && (
            <>
              {tab !== "resources" && tab !== "calendars" && (
                <button className={bulkMode ? "btn btn-primary" : "btn"} onClick={() => setBulkMode((v) => !v)}>
                  {t("categoryPage.bulkMode")}
                </button>
              )}
              <button className="btn" onClick={() => setShowCreateFolder({ kind: kindForTab[tab]! })}>
                {t("templateManagerPage.addFolder")}
              </button>
            </>
          )}
          {tab === "templates" && (
            <button className="btn btn-primary" onClick={() => setShowCreateTemplate(true)}>
              {t("templateManagerPage.createTemplate")}
            </button>
          )}
          {tab === "chapterTemplates" && (
            <button className="btn btn-primary" onClick={() => setShowCreateChapterTemplate(true)}>
              {t("templateManagerPage.createChapterTemplate")}
            </button>
          )}
          {tab === "modules" && (
            <button className="btn btn-primary" onClick={() => setShowCreateModule(true)}>
              {t("templateManagerPage.createModule")}
            </button>
          )}
          {tab === "groups" && (
            <button className="btn btn-primary" onClick={() => setShowCreateGroup(true)}>
              {t("templateManagerPage.createGroup")}
            </button>
          )}
          {tab === "colors" && (
            <button className="btn btn-primary" onClick={() => setShowCreateColorSwatch(true)}>
              {t("templateManagerPage.createColorSwatch")}
            </button>
          )}
          {tab === "categories" && (
            <button className="btn btn-primary" onClick={() => setShowCreateCategory(true)}>
              {t("templateManagerPage.createCategory")}
            </button>
          )}
          {tab === "calendars" && (
            <button className="btn btn-primary" onClick={() => setShowCreateCalendar(true)}>
              {t("templateManagerPage.createCalendar")}
            </button>
          )}
          {tab === "landmarkIcons" && (
            <button className="btn btn-primary" onClick={() => setShowCreateLandmarkIcon(true)}>
              {t("templateManagerPage.createLandmarkIcon")}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button className={tab === "categories" ? "btn btn-primary" : "btn"} onClick={() => setTab("categories")}>
          {t("templateManagerPage.tab.categories")}
        </button>
        <button className={tab === "calendars" ? "btn btn-primary" : "btn"} onClick={() => setTab("calendars")}>
          {t("templateManagerPage.tab.calendars")}
        </button>
        <button className={tab === "templates" ? "btn btn-primary" : "btn"} onClick={() => setTab("templates")}>
          {t("templateManagerPage.tab.templates")}
        </button>
        <button className={tab === "chapterTemplates" ? "btn btn-primary" : "btn"} onClick={() => setTab("chapterTemplates")}>
          {t("templateManagerPage.tab.chapterTemplates")}
        </button>
        <button className={tab === "modules" ? "btn btn-primary" : "btn"} onClick={() => setTab("modules")}>
          {t("templateManagerPage.tab.modules")}
        </button>
        <button className={tab === "groups" ? "btn btn-primary" : "btn"} onClick={() => setTab("groups")}>
          {t("templateManagerPage.tab.groups")}
        </button>
        <button className={tab === "colors" ? "btn btn-primary" : "btn"} onClick={() => setTab("colors")}>
          {t("templateManagerPage.tab.colors")}
        </button>
        <button className={tab === "landmarkIcons" ? "btn btn-primary" : "btn"} onClick={() => setTab("landmarkIcons")}>
          {t("templateManagerPage.tab.landmarkIcons")}
        </button>
        <button className={tab === "resources" ? "btn btn-primary" : "btn"} onClick={() => setTab("resources")}>
          {t("templateManagerPage.tab.resources")}
        </button>
      </div>

      {bulkMode && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={currentSelectableIds.length}
          folderOptions={currentFolderOptions.map((f) => ({ id: f.id, name: f.name }))}
          onMoveToFolder={handleBulkMove}
          onDuplicate={handleBulkDuplicate}
          onDelete={handleBulkDelete}
          onToggleSelectAll={() =>
            setSelectedIds((prev) => (prev.size === currentSelectableIds.length ? new Set() : new Set(currentSelectableIds)))
          }
          onCancel={() => {
            setBulkMode(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {tab === "templates" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>{t("templateManagerPage.templatesIntro")}</p>

          {!bulkMode && (
            <BuiltInFolder
              title={t("templateManagerPage.builtInTemplates")}
              count={builtInTemplates.length}
              onDuplicateAll={() => duplicateBuiltInFolder("template", t("templateManagerPage.builtInTemplates"))}
            >
              {builtInTemplates.map((tpl) => (
                <div key={tpl.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{tpl.name}</strong>
                    <span className="builtin-badge" style={{ marginLeft: 8 }}>{t("common.builtIn")}</span>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("templateManagerPage.templateSubtitle", {
                        category: categoryLabel(tpl),
                        scope: t("templateManagerPage.scopeGlobal"),
                        count: tpl.blocks.length,
                      })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setViewingTemplate(tpl)}>
                      {t("common.view")}
                    </button>
                    <button className="btn-ghost" onClick={() => duplicateTemplate(tpl.id, world.id, undefined, t)}>
                      {t("common.duplicate")}
                    </button>
                  </div>
                </div>
              ))}
            </BuiltInFolder>
          )}

          {renderFolderTree(buildFolderTree(templateFolders), {
            itemsFor: (fid) => (templatesByFolder.get(fid) ?? []).map(templateRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("template", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "template", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledTemplates.map(templateRow)}
            {unfiledTemplates.length === 0 && templateFolders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCustomTemplates")}</p>}
          </div>
        </section>
      )}

      {tab === "chapterTemplates" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
            {t("templateManagerPage.chapterTemplatesIntro")}
          </p>

          {!bulkMode && (
            <BuiltInFolder
              title={t("templateManagerPage.builtInChapterTemplates")}
              count={builtInChapterTemplates.length}
              onDuplicateAll={() => duplicateBuiltInFolder("storyChapterTemplate", t("templateManagerPage.builtInChapterTemplates"))}
            >
              {builtInChapterTemplates.map((tpl) => (
                <div key={tpl.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{tpl.name}</strong>
                    <span className="builtin-badge" style={{ marginLeft: 8 }}>{t("common.builtIn")}</span>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("templateManagerPage.scopeAndBlockCount", { scope: t("templateManagerPage.scopeGlobal"), count: tpl.blocks.length })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setViewingChapterTemplate(tpl)}>
                      {t("common.view")}
                    </button>
                    <button className="btn-ghost" onClick={() => duplicateStoryChapterTemplate(tpl.id, world.id, undefined, t)}>
                      {t("common.duplicate")}
                    </button>
                  </div>
                </div>
              ))}
            </BuiltInFolder>
          )}

          {renderFolderTree(buildFolderTree(chapterTemplateFolders), {
            itemsFor: (fid) => (chapterTemplatesByFolder.get(fid) ?? []).map(chapterTemplateRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("storyChapterTemplate", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "storyChapterTemplate", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledChapterTemplates.map(chapterTemplateRow)}
            {unfiledChapterTemplates.length === 0 && chapterTemplateFolders.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCustomChapterTemplates")}</p>
            )}
          </div>
        </section>
      )}

      {tab === "modules" && (
        <section>
          {!bulkMode && (
            <BuiltInFolder
              title={t("templateManagerPage.builtInModules")}
              count={builtInModules.length}
              onDuplicateAll={() => duplicateBuiltInFolder("module", t("templateManagerPage.builtInModules"))}
            >
              {builtInModules.map((m) => (
                <div key={m.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{m.name}</strong>
                    <span className="builtin-badge" style={{ marginLeft: 8 }}>{t("common.builtIn")}</span>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("templateManagerPage.scopeAndBlockCount", { scope: t("templateManagerPage.scopeGlobal"), count: m.blocks.length })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setViewingModule(m)}>
                      {t("common.view")}
                    </button>
                    <button className="btn-ghost" onClick={() => duplicateModule(m.id, world.id, undefined, t)}>
                      {t("common.duplicate")}
                    </button>
                  </div>
                </div>
              ))}
            </BuiltInFolder>
          )}

          {renderFolderTree(buildFolderTree(moduleFolders), {
            itemsFor: (fid) => (modulesByFolder.get(fid) ?? []).map(moduleRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("module", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "module", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledModules.map(moduleRow)}
            {unfiledModules.length === 0 && moduleFolders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCustomModules")}</p>}
          </div>
        </section>
      )}

      {tab === "groups" && (
        <section>
          {!bulkMode && (
            <BuiltInFolder
              title={t("templateManagerPage.builtInGroups")}
              count={builtInGroups.length}
              onDuplicateAll={() => duplicateBuiltInFolder("group", t("templateManagerPage.builtInGroups"))}
            >
              {builtInGroups.map((g) => (
                <div key={g.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{g.name}</strong>
                    <span className="builtin-badge" style={{ marginLeft: 8 }}>{t("common.builtIn")}</span>
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("templateManagerPage.scopeAndFieldCount", { scope: t("templateManagerPage.scopeGlobal"), count: g.fields.length })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setViewingGroup(g)}>
                      {t("common.view")}
                    </button>
                    <button className="btn-ghost" onClick={() => duplicateGroup(g.id, world.id, undefined, t)}>
                      {t("common.duplicate")}
                    </button>
                  </div>
                </div>
              ))}
            </BuiltInFolder>
          )}

          {renderFolderTree(buildFolderTree(groupFolders), {
            itemsFor: (fid) => (groupsByFolder.get(fid) ?? []).map(groupRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("group", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "group", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledGroups.map(groupRow)}
            {unfiledGroups.length === 0 && groupFolders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCustomGroups")}</p>}
          </div>
        </section>
      )}

      {tab === "colors" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
            {t("templateManagerPage.colorsIntro")}
          </p>

          {renderFolderTree(buildFolderTree(colorFolders), {
            itemsFor: (fid) => (colorsByFolder.get(fid) ?? []).map((s, i) => colorRow(s, i)),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("color", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "color", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledColors.map((s, i) => colorRow(s, i))}
            {unfiledColors.length === 0 && colorFolders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noSavedSwatches")}</p>}
          </div>
        </section>
      )}

      {tab === "resources" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 12 }}>
            {t("templateManagerPage.resourcesIntro", {
              count: (assets ?? []).length,
              size: formatBytes((assets ?? []).reduce((sum, a) => sum + a.size, 0)),
            })}
          </p>
          <label className="btn" style={{ cursor: "pointer", display: "inline-block", marginBottom: 16 }}>
            {t("templateManagerPage.uploadFile")}
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                handleUploadAssets(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {renderFolderTree(buildFolderTree(resourceFolders), {
            itemsFor: (fid) => (assetsByFolder.get(fid) ?? []).map(assetRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "resource", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledAssets.map(assetRow)}
            {unfiledAssets.length === 0 && resourceFolders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noResources")}</p>}
          </div>
        </section>
      )}

      {tab === "calendars" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
            {t("templateManagerPage.calendarsIntro")}
          </p>

          {!bulkMode && (
            <BuiltInFolder
              title={t("templateManagerPage.builtInCalendars")}
              count={builtInCalendars.length}
              onDuplicateAll={() => duplicateBuiltInFolder("calendar", t("templateManagerPage.builtInCalendars"))}
            >
              {builtInCalendars.map((c) => (
                <div key={c.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{c.name}</strong>
                    <span className="builtin-badge" style={{ marginLeft: 8 }}>{t("common.builtIn")}</span>
                    {world.defaultCalendarId === c.id && (
                      <span className="builtin-badge" style={{ marginLeft: 8 }} title={t("templateManagerPage.defaultCalendarHint")}>
                        {t("templateManagerPage.defaultCalendarBadge")}
                      </span>
                    )}
                    <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {t("templateManagerPage.scopeAndMonthCount", { scope: t("templateManagerPage.scopeGlobal"), count: c.months.length })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn-ghost"
                      onClick={() => updateWorldDefaultCalendar(world.id, world.defaultCalendarId === c.id ? undefined : c.id)}
                    >
                      {world.defaultCalendarId === c.id ? t("templateManagerPage.unsetDefaultShort") : t("templateManagerPage.setDefaultShort")}
                    </button>
                    <button className="btn-ghost" onClick={() => setViewingCalendar(c)}>
                      {t("common.view")}
                    </button>
                    <button className="btn-ghost" onClick={() => duplicateCalendar(c.id, world.id, undefined, t)}>
                      {t("common.duplicate")}
                    </button>
                  </div>
                </div>
              ))}
            </BuiltInFolder>
          )}

          {renderFolderTree(buildFolderTree(calendarFolders), {
            itemsFor: (fid) => (calendarsByFolder.get(fid) ?? []).map(calendarRow),
            onRename: (folder, name) => updateManagerFolder(folder.id, { name }),
            onScopeChange: (folder, scope) => updateManagerFolder(folder.id, { scope, worldId: scope === "world" ? world.id : undefined }),
            onColorChange: (folder, tagColor) => updateManagerFolder(folder.id, { tagColor }),
            onDelete: (folder) => handleDeleteFolder(folder),
            onDuplicate: (folder) => duplicateCustomFolder("calendar", folder),
            onAddSubfolder: (folder) => setShowCreateFolder({ kind: "calendar", parentFolderId: folder.id }),
            onMove: (folder) => setMovingFolder(folder),
          })}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unfiledCalendars.map(calendarRow)}
            {unfiledCalendars.length === 0 && calendarFolders.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCustomCalendars")}</p>
            )}
          </div>
        </section>
      )}

      {tab === "categories" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
            {t("templateManagerPage.categoriesIntro")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {BUILTIN_COLOR_KEY_CARDS.map(({ key, labelKey }) => (
              <div key={key} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 14, display: "inline-block" }} />
                  <strong>{t(labelKey)}</strong>
                  <span className="builtin-badge">{t("common.builtIn")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("templateManagerPage.categoryColorLabel")}</span>
                  <ColorInput
                    value={world.categoryColors?.[key]}
                    onChange={(v) => setCategoryColor(key, v)}
                    allowClear
                    worldId={world.id}
                  />
                </div>
              </div>
            ))}
            {sortedCategories.map((c, i) => (
              <div
                key={c.id}
                className="card"
                style={{
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  opacity: categoryDragIndex === i ? 0.5 : 1,
                  ...categoryDropIndicatorStyle(i),
                }}
                {...categoryRowProps(i)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span {...categoryHandleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("common.dragToReorder")}>
                    ⠿
                  </span>
                  {editingCategoryId === c.id ? (
                    <input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onBlur={commitRenameCategory}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                  ) : (
                    <strong>{categoryDisplayName(c, t)}</strong>
                  )}
                  {c.isBuiltIn && <span className="builtin-badge">{t("common.builtIn")}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("templateManagerPage.categoryColorLabel")}</span>
                    <ColorInput value={world.categoryColors?.[c.id]} onChange={(v) => setCategoryColor(c.id, v)} allowClear worldId={world.id} />
                  </div>
                  {!c.isBuiltIn && (
                    <>
                      <button className="btn-ghost" onClick={() => startRenameCategory(c)}>
                        {t("templateManagerPage.renameButton")}
                      </button>
                      <button className="btn-ghost" onClick={() => handleDeleteCategory(c)}>
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {sortedCategories.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noCategories")}</p>}
          </div>
          {showCreateCategory && (
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <input
                autoFocus
                style={{ flex: 1 }}
                placeholder={t("templateManagerPage.categoryNamePlaceholder")}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNewCategory()}
              />
              <button className="btn btn-primary" onClick={submitNewCategory}>
                {t("addFieldDialog.submitAdd")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowCreateCategory(false);
                  setNewCategoryName("");
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === "landmarkIcons" && (
        <section>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>
            {t("templateManagerPage.landmarkIconsIntro")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedLandmarkIconTypes.map((icon) => (
              <div key={icon.id} className="card" style={{ padding: 12, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg viewBox="0 0 22 22" width={28} height={28} style={{ flexShrink: 0 }}>
                    <g transform="translate(11 11) scale(0.34)">
                      <FloorPlanLandmarkIconGraphic
                        builtInKey={icon.builtInKey}
                        customImage={icon.customImage}
                        color={icon.defaultColor}
                        textColor={icon.textColor}
                        fillColor={icon.fillColor}
                      />
                    </g>
                  </svg>
                  <input
                    value={landmarkIconLabelDrafts[icon.id] ?? icon.label}
                    onChange={(e) => setLandmarkIconLabelDrafts((d) => ({ ...d, [icon.id]: e.target.value }))}
                    onBlur={() => commitLandmarkIconLabel(icon.id)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    style={{ width: 160 }}
                  />
                  {icon.isBuiltIn && <span className="builtin-badge">{t("common.builtIn")}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("templateManagerPage.lineColorLabel")}</span>
                    <ColorInput
                      value={icon.defaultColor}
                      onChange={(v) => updateLandmarkIconType(icon.id, { defaultColor: v || undefined })}
                      allowClear
                      worldId={world.id}
                      fallbackColor={DEFAULT_LANDMARK_ICON_COLOR}
                      fallbackLabel={t("templateManagerPage.defaultFallbackLabel")}
                    />
                  </div>
                  {/* 文字顏色／填滿顏色只對「沒有 builtInKey」的類型有意義——內建的 9 種手繪圖示
                      固定用形狀本身、沒有文字也沒有可填滿的封閉區域，這裡就算填了也不會生效，
                      所以乾脆不顯示這兩個欄位，避免使用者誤會 */}
                  {!icon.builtInKey && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("templateManagerPage.textColorLabel")}</span>
                        <ColorInput
                          value={icon.textColor}
                          onChange={(v) => updateLandmarkIconType(icon.id, { textColor: v || undefined })}
                          allowClear
                          worldId={world.id}
                          fallbackColor={icon.defaultColor || DEFAULT_LANDMARK_ICON_COLOR}
                          fallbackLabel={t("templateManagerPage.lineColorFallbackLabel")}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("templateManagerPage.fillColorLabel")}</span>
                        <ColorInput
                          value={icon.fillColor}
                          onChange={(v) => updateLandmarkIconType(icon.id, { fillColor: v || undefined })}
                          allowClear
                          worldId={world.id}
                        />
                      </div>
                    </>
                  )}
                  {!icon.isBuiltIn && (
                    <>
                      <ImageUpload
                        value={icon.customImage}
                        onChange={(v) => updateLandmarkIconType(icon.id, { customImage: v })}
                        label={t("templateManagerPage.customImageLabel")}
                      />
                      <button className="btn-ghost" onClick={() => handleDeleteLandmarkIcon(icon)}>
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {sortedLandmarkIconTypes.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("templateManagerPage.noLandmarkIcons")}</p>}
          </div>
          {showCreateLandmarkIcon && (
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <input
                autoFocus
                style={{ flex: 1, minWidth: 160 }}
                placeholder={t("templateManagerPage.landmarkIconNamePlaceholder")}
                value={newLandmarkIconLabel}
                onChange={(e) => setNewLandmarkIconLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitNewLandmarkIcon()}
              />
              <ImageUpload value={newLandmarkIconImage} onChange={setNewLandmarkIconImage} label={t("templateManagerPage.landmarkImageLabel")} />
              <button className="btn btn-primary" onClick={submitNewLandmarkIcon}>
                {t("addFieldDialog.submitAdd")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowCreateLandmarkIcon(false);
                  setNewLandmarkIconLabel("");
                  setNewLandmarkIconImage(undefined);
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </section>
      )}

      {showCreateColorSwatch && (
        <CreateColorSwatchDialog
          onClose={() => setShowCreateColorSwatch(false)}
          onSubmit={async (input) => {
            await addColorSwatch(input.color, input.label, input.scope, world.id);
            setShowCreateColorSwatch(false);
          }}
        />
      )}

      {showCreateCalendar && (
        <CalendarEditorDialog
          onClose={() => setShowCreateCalendar(false)}
          onSubmit={async (input) => {
            await createCalendar(input.name, input.scope, world.id, input.months, {
              weekLength: input.weekLength,
              weekdayNames: input.weekdayNames,
              weekendDayIndices: input.weekendDayIndices,
              weekAnchor: input.weekAnchor,
            });
            setShowCreateCalendar(false);
          }}
        />
      )}
      {editingCalendar && (
        <CalendarEditorDialog
          calendar={editingCalendar}
          onClose={() => setEditingCalendar(null)}
          onSubmit={async (input) => {
            const invalidCount = await countEventsInvalidatedByMonths(editingCalendar.id, input.months);
            if (invalidCount > 0) {
              const ok = await confirm({
                title: t("templateManagerPage.calendarMonthChangeConfirm.title"),
                message: t("templateManagerPage.calendarMonthChangeConfirm.message", { count: invalidCount }),
                confirmLabel: t("templateManagerPage.calendarMonthChangeConfirm.confirmLabel"),
              });
              if (!ok) return;
            }
            await updateCalendar(editingCalendar.id, {
              name: input.name,
              scope: input.scope,
              worldId: input.scope === "world" ? world.id : undefined,
              months: input.months,
            });
            await updateCalendarWeekSettings(editingCalendar.id, {
              weekLength: input.weekLength,
              weekdayNames: input.weekdayNames,
              weekendDayIndices: input.weekendDayIndices,
              weekAnchor: input.weekAnchor,
            });
            setEditingCalendar(null);
          }}
        />
      )}
      {viewingCalendar && (
        <CalendarEditorDialog
          calendar={viewingCalendar}
          readOnly
          onClose={() => setViewingCalendar(null)}
          onSubmit={() => {}}
          onSubmitWeekSettings={async (weekInput) => {
            await updateCalendarWeekSettings(viewingCalendar.id, weekInput);
            setViewingCalendar(null);
          }}
        />
      )}

      {pickingFolder && (
        <PickFolderDialog
          folders={flattenFolderTree(
            buildFolderTree(
              pickingFolder.kind === "template"
                ? templateFolders
                : pickingFolder.kind === "chapterTemplate"
                  ? chapterTemplateFolders
                  : pickingFolder.kind === "module"
                    ? moduleFolders
                    : pickingFolder.kind === "group"
                      ? groupFolders
                      : pickingFolder.kind === "resource"
                        ? resourceFolders
                        : calendarFolders
            )
          )}
          value={pickingFolder.item.folderId}
          onClose={() => setPickingFolder(null)}
          onPick={async (folderId) => {
            if (pickingFolder.kind === "template") await updateTemplate(pickingFolder.item.id, { folderId });
            else if (pickingFolder.kind === "chapterTemplate") await updateStoryChapterTemplate(pickingFolder.item.id, { folderId });
            else if (pickingFolder.kind === "module") await updateModule(pickingFolder.item.id, { folderId });
            else if (pickingFolder.kind === "group") await updateGroup(pickingFolder.item.id, { folderId });
            else if (pickingFolder.kind === "resource") await updateAsset(pickingFolder.item.id, { folderId });
            else await updateCalendar(pickingFolder.item.id, { folderId });
            setPickingFolder(null);
          }}
        />
      )}

      {movingFolder && (
        <PickFolderDialog
          title={t("templateManagerPage.moveFolderTitle", { name: movingFolder.name })}
          rootLabel={t("templateManagerPage.rootFolderLabel")}
          folders={flattenFolderTree(buildFolderTree(foldersFor(movingFolder.kind))).filter(
            ({ folder }) => !descendantFolderIds(movingFolder.id, foldersFor(movingFolder.kind)).has(folder.id)
          )}
          value={movingFolder.parentFolderId}
          onClose={() => setMovingFolder(null)}
          onPick={async (parentFolderId) => {
            await updateManagerFolder(movingFolder.id, { parentFolderId });
            setMovingFolder(null);
          }}
        />
      )}

      {showCreateFolder && (
        <CreateFolderDialog
          worldId={world.id}
          onClose={() => setShowCreateFolder(null)}
          onSubmit={async (input) => {
            await createManagerFolder(
              showCreateFolder.kind,
              input.name,
              input.scope,
              world.id,
              input.tagColor,
              showCreateFolder.parentFolderId
            );
            setShowCreateFolder(null);
          }}
        />
      )}

      {showCreateGroup && (
        <CreateGroupDialog
          worldId={world.id}
          onClose={() => setShowCreateGroup(false)}
          onSubmit={async (input) => {
            await createGroup(input.name, input.scope, world.id, input.fields, input.restrictedCategoryIds);
            setShowCreateGroup(false);
          }}
        />
      )}
      {editingGroup && (
        <CreateGroupDialog
          worldId={world.id}
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSubmit={async (input) => {
            await updateGroup(editingGroup.id, {
              name: input.name,
              scope: input.scope,
              fields: input.fields,
              worldId: input.scope === "world" ? world.id : undefined,
              restrictedCategoryIds: input.restrictedCategoryIds.length ? input.restrictedCategoryIds : undefined,
            });
            setEditingGroup(null);
          }}
        />
      )}
      {viewingGroup && (
        <CreateGroupDialog worldId={world.id} group={viewingGroup} readOnly onClose={() => setViewingGroup(null)} onSubmit={() => {}} />
      )}

      {showCreateModule && (
        <CreateModuleDialog
          worldId={world.id}
          onClose={() => setShowCreateModule(false)}
          onSubmit={async (input) => {
            await createModule(input.name, input.scope, world.id, input.blocks, input.restrictedCategoryIds);
            setShowCreateModule(false);
          }}
        />
      )}
      {editingModule && (
        <CreateModuleDialog
          worldId={world.id}
          mod={editingModule}
          onClose={() => setEditingModule(null)}
          onSubmit={async (input) => {
            await updateModule(editingModule.id, {
              name: input.name,
              scope: input.scope,
              blocks: input.blocks,
              worldId: input.scope === "world" ? world.id : undefined,
              restrictedCategoryIds: input.restrictedCategoryIds.length ? input.restrictedCategoryIds : undefined,
            });
            setEditingModule(null);
          }}
        />
      )}
      {viewingModule && (
        <CreateModuleDialog worldId={world.id} mod={viewingModule} readOnly onClose={() => setViewingModule(null)} onSubmit={() => {}} />
      )}

      {showCreateTemplate && (
        <CreateTemplateDialog
          worldId={world.id}
          onClose={() => setShowCreateTemplate(false)}
          onSubmit={async (input) => {
            await createTemplate(input.name, input.scope, world.id, input.category, input.blocks);
            setShowCreateTemplate(false);
          }}
        />
      )}
      {editingTemplate && (
        <CreateTemplateDialog
          worldId={world.id}
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSubmit={async (input) => {
            await updateTemplate(editingTemplate.id, {
              name: input.name,
              scope: input.scope,
              blocks: input.blocks,
              worldId: input.scope === "world" ? world.id : undefined,
              allCategories: input.category === "all" ? true : undefined,
              categoryId: input.category !== "all" && !input.category.isBuiltIn ? input.category.id : undefined,
              builtInCategoryKey: input.category !== "all" && input.category.isBuiltIn ? input.category.builtInKey : undefined,
            });
            setEditingTemplate(null);
          }}
        />
      )}
      {viewingTemplate && (
        <CreateTemplateDialog worldId={world.id} template={viewingTemplate} readOnly onClose={() => setViewingTemplate(null)} onSubmit={() => {}} />
      )}

      {showCreateChapterTemplate && (
        <CreateStoryChapterTemplateDialog
          worldId={world.id}
          onClose={() => setShowCreateChapterTemplate(false)}
          onSubmit={async (input) => {
            await createStoryChapterTemplate(input.name, input.scope, world.id, input.blocks);
            setShowCreateChapterTemplate(false);
          }}
        />
      )}
      {editingChapterTemplate && (
        <CreateStoryChapterTemplateDialog
          worldId={world.id}
          template={editingChapterTemplate}
          onClose={() => setEditingChapterTemplate(null)}
          onSubmit={async (input) => {
            await updateStoryChapterTemplate(editingChapterTemplate.id, {
              name: input.name,
              scope: input.scope,
              blocks: input.blocks,
              worldId: input.scope === "world" ? world.id : undefined,
            });
            setEditingChapterTemplate(null);
          }}
        />
      )}
      {viewingChapterTemplate && (
        <CreateStoryChapterTemplateDialog
          worldId={world.id}
          template={viewingChapterTemplate}
          readOnly
          onClose={() => setViewingChapterTemplate(null)}
          onSubmit={() => {}}
        />
      )}
    </div>
  );
}
