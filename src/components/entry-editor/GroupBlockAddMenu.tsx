import { useState } from "react";
import type { FieldDef, FieldGroup, ManagerFolder } from "../../data/types";
import { listGroups, expandGroup } from "../../data/repositories/template";
import { listManagerFolders, partitionByFolder } from "../../data/repositories/managerFolder";
import DropdownMenu from "../common/DropdownMenu";
import FolderedPickMenu from "./FolderedPickMenu";
import { useLanguage } from "../../i18n";

interface GroupBlockAddMenuProps {
  worldId: string;
  categoryId?: string;
  onAddField?: () => void;
  onAddBlankGroup?: () => void;
  /** 合併選取的群組欄位進現有區塊；同時附上該群組名稱，供呼叫端合併標題（如「外觀+人際關係」） */
  onInsertGroup?: (fields: FieldDef[], groupName: string) => void;
}

/** 群組／模組區塊標題右側的「＋」選單：可新增欄位到此群組、新增一個空白群組，也可將另一個群組合併進此區塊 */
export default function GroupBlockAddMenu({ worldId, categoryId, onAddField, onAddBlankGroup, onInsertGroup }: GroupBlockAddMenuProps) {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [folders, setFolders] = useState<ManagerFolder[]>([]);

  if (!onAddField && !onAddBlankGroup && !onInsertGroup) return null;

  // 分類未知時（理論上不會發生，條目一定屬於某個分類；防呆保守處理）比照範本/模組挑選對話框，只顯示不限分類的群組
  const visibleGroups = groups.filter((g) =>
    categoryId ? !g.restrictedCategoryIds?.length || g.restrictedCategoryIds.includes(categoryId) : !g.restrictedCategoryIds?.length
  );
  const { byFolder, unfiled } = partitionByFolder(visibleGroups, folders);

  return (
    <DropdownMenu
      label="＋"
      title={t("groupBlockAddMenu.triggerTitle")}
      buttonClassName="btn-ghost"
      align="right"
      minWidth={160}
      onOpen={() => {
        listGroups(worldId).then(setGroups);
        listManagerFolders("group", worldId).then(setFolders);
      }}
    >
      {(close) => (
        <>
          {onAddField && (
            <button
              className="btn-ghost"
              style={{ textAlign: "left" }}
              onClick={() => {
                close();
                onAddField();
              }}
            >
              {t("groupBlockAddMenu.addFieldToGroup")}
            </button>
          )}
          {onAddBlankGroup && (
            <button
              className="btn-ghost"
              style={{ textAlign: "left" }}
              onClick={() => {
                close();
                onAddBlankGroup();
              }}
            >
              {t("groupBlockAddMenu.addBlankGroup")}
            </button>
          )}
          {onInsertGroup && (
            <DropdownMenu
              renderTrigger={({ ref, onClick }) => (
                <button
                  ref={ref}
                  className="btn-ghost"
                  style={{ textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between", gap: 6 }}
                  onClick={onClick}
                >
                  {t("groupBlockAddMenu.mergeGroupTrigger")} <span>▸</span>
                </button>
              )}
              direction="right"
              minWidth={180}
              zIndex={9100}
            >
              {(closeSub) => (
                <FolderedPickMenu
                  folders={folders}
                  itemsByFolder={byFolder}
                  unfiled={unfiled}
                  itemKey={(g) => g.id}
                  itemLabel={(g) => (
                    <span>
                      {g.name}
                      {g.isBuiltIn && <span className="builtin-badge" style={{ marginLeft: 4 }}>{t("common.builtIn")}</span>}
                    </span>
                  )}
                  onPick={(g) => {
                    closeSub();
                    close();
                    onInsertGroup(expandGroup(g), g.name);
                  }}
                  emptyLabel={t("groupPicker.noGroupsAvailable")}
                  zIndex={9100}
                  isBuiltIn={(g) => g.isBuiltIn}
                  builtInLabel={t("groupPicker.builtInGroupsLabel")}
                />
              )}
            </DropdownMenu>
          )}
        </>
      )}
    </DropdownMenu>
  );
}
