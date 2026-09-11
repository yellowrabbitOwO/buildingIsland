import { useState } from "react";
import type { FieldDef, FieldGroup, FieldModule, ManagerFolder } from "../../data/types";
import { listGroups, listModules, expandGroup, expandModule } from "../../data/repositories/template";
import { listManagerFolders, partitionByFolder } from "../../data/repositories/managerFolder";
import DropdownMenu from "../common/DropdownMenu";
import FolderedPickMenu from "./FolderedPickMenu";
import { useLanguage } from "../../i18n";

interface AddFieldMenuProps {
  worldId: string;
  categoryId: string;
  onAddSingleField: () => void;
  onAddBlankGroup: () => void;
  onAddExpanded: (fields: FieldDef[]) => void;
}

/** 條目編輯「+新增」選單：單個欄位／空白群組為直接動作；群組／模組點擊後依資料夾分層列出可選項目 */
export default function AddFieldMenu({ worldId, categoryId, onAddSingleField, onAddBlankGroup, onAddExpanded }: AddFieldMenuProps) {
  const { t } = useLanguage();
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [modules, setModules] = useState<FieldModule[]>([]);
  const [groupFolders, setGroupFolders] = useState<ManagerFolder[]>([]);
  const [moduleFolders, setModuleFolders] = useState<ManagerFolder[]>([]);

  const visibleGroups = groups.filter((g) => !g.restrictedCategoryIds?.length || g.restrictedCategoryIds.includes(categoryId));
  const visibleModules = modules.filter((m) => !m.restrictedCategoryIds?.length || m.restrictedCategoryIds.includes(categoryId));
  const groupPartition = partitionByFolder(visibleGroups, groupFolders);
  const modulePartition = partitionByFolder(visibleModules, moduleFolders);

  return (
    <div style={{ marginTop: 14 }}>
      <DropdownMenu
        label={t("addFieldMenu.trigger")}
        buttonClassName="btn"
        align="left"
        minWidth={160}
        onOpen={() => {
          listGroups(worldId).then(setGroups);
          listModules(worldId).then(setModules);
          listManagerFolders("group", worldId).then(setGroupFolders);
          listManagerFolders("module", worldId).then(setModuleFolders);
        }}
      >
        {(close) => (
          <>
            <button
              className="btn-ghost"
              style={{ textAlign: "left" }}
              onClick={() => {
                close();
                onAddSingleField();
              }}
            >
              {t("addFieldMenu.singleField")}
            </button>
            <button
              className="btn-ghost"
              style={{ textAlign: "left" }}
              onClick={() => {
                close();
                onAddBlankGroup();
              }}
            >
              {t("addFieldMenu.blankGroup")}
            </button>
            <DropdownMenu
              renderTrigger={({ ref, onClick }) => (
                <button
                  ref={ref}
                  className="btn-ghost"
                  style={{ textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between", gap: 6 }}
                  onClick={onClick}
                >
                  {t("common.group")} <span>▸</span>
                </button>
              )}
              direction="right"
              minWidth={180}
              zIndex={9100}
            >
              {(closeSub) => (
                <FolderedPickMenu
                  folders={groupFolders}
                  itemsByFolder={groupPartition.byFolder}
                  unfiled={groupPartition.unfiled}
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
                    onAddExpanded(expandGroup(g));
                  }}
                  emptyLabel={t("groupPicker.noGroupsAvailable")}
                  zIndex={9100}
                  isBuiltIn={(g) => g.isBuiltIn}
                  builtInLabel={t("groupPicker.builtInGroupsLabel")}
                />
              )}
            </DropdownMenu>
            <DropdownMenu
              renderTrigger={({ ref, onClick }) => (
                <button
                  ref={ref}
                  className="btn-ghost"
                  style={{ textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between", gap: 6 }}
                  onClick={onClick}
                >
                  {t("addFieldMenu.moduleLabel")} <span>▸</span>
                </button>
              )}
              direction="right"
              minWidth={180}
              zIndex={9100}
            >
              {(closeSub) => (
                <FolderedPickMenu
                  folders={moduleFolders}
                  itemsByFolder={modulePartition.byFolder}
                  unfiled={modulePartition.unfiled}
                  itemKey={(m) => m.id}
                  itemLabel={(m) => (
                    <span>
                      {m.name}
                      {m.isBuiltIn && <span className="builtin-badge" style={{ marginLeft: 4 }}>{t("common.builtIn")}</span>}
                    </span>
                  )}
                  onPick={(m) => {
                    closeSub();
                    close();
                    expandModule(m).then(onAddExpanded);
                  }}
                  emptyLabel={t("groupPicker.noModulesAvailable")}
                  zIndex={9100}
                  isBuiltIn={(m) => m.isBuiltIn}
                  builtInLabel={t("groupPicker.builtInModulesLabel")}
                />
              )}
            </DropdownMenu>
          </>
        )}
      </DropdownMenu>
    </div>
  );
}
