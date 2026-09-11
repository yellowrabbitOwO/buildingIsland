import type { ReactNode } from "react";
import type { ManagerFolder } from "../../data/types";
import DropdownMenu from "../common/DropdownMenu";

interface FolderedPickMenuProps<T> {
  folders: ManagerFolder[];
  itemsByFolder: Map<string, T[]>;
  unfiled: T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => ReactNode;
  onPick: (item: T) => void;
  emptyLabel: string;
  /** 巢狀選單的 z-index 起點；資料夾子選單會再往上疊一層，需比外層選單高 */
  zIndex: number;
  /** 若有值，unfiled 中符合此條件的項目會額外收進一個「內建」子選單（比照管理頁的內建資料夾呈現方式），而非與其他未分類項目混在一起 */
  isBuiltIn?: (item: T) => boolean;
  builtInLabel?: string;
}

interface FolderSubmenuProps<T> {
  label: ReactNode;
  items: T[];
  itemKey: (item: T) => string;
  itemLabel: (item: T) => ReactNode;
  onPick: (item: T) => void;
  zIndex: number;
}

/** 一個資料夾（含內建這種虛擬資料夾）收合成的子選單：點擊後才展開列出其中的項目 */
function FolderSubmenu<T>({ label, items, itemKey, itemLabel, onPick, zIndex }: FolderSubmenuProps<T>) {
  return (
    <DropdownMenu
      renderTrigger={({ ref, onClick }) => (
        <button
          ref={ref}
          className="btn-ghost"
          style={{ textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between", gap: 6 }}
          onClick={onClick}
        >
          <span>{label}</span>
          <span>▸</span>
        </button>
      )}
      direction="right"
      minWidth={180}
      zIndex={zIndex + 100}
    >
      {(closeFolder) => (
        <>
          {items.map((item) => (
            <button
              key={itemKey(item)}
              className="btn-ghost"
              style={{ textAlign: "left" }}
              onClick={() => {
                closeFolder();
                onPick(item);
              }}
            >
              {itemLabel(item)}
            </button>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}

/** 群組／模組挑選選單的共用內容：內建項目收成一個「內建」子選單、其餘依資料夾分組（各自再收成一層子選單），
 * 完全沒有資料夾的自訂項目直接列在最下方 */
export default function FolderedPickMenu<T>({
  folders,
  itemsByFolder,
  unfiled,
  itemKey,
  itemLabel,
  onPick,
  emptyLabel,
  zIndex,
  isBuiltIn,
  builtInLabel = "內建",
}: FolderedPickMenuProps<T>) {
  const nonEmptyFolders = folders.filter((f) => (itemsByFolder.get(f.id) ?? []).length > 0);
  const builtInItems = isBuiltIn ? unfiled.filter(isBuiltIn) : [];
  const restUnfiled = isBuiltIn ? unfiled.filter((item) => !isBuiltIn(item)) : unfiled;

  if (nonEmptyFolders.length === 0 && builtInItems.length === 0 && restUnfiled.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: 12, margin: "4px 8px" }}>{emptyLabel}</p>;
  }

  return (
    <>
      {builtInItems.length > 0 && (
        <FolderSubmenu
          label={`📁 ${builtInLabel}`}
          items={builtInItems}
          itemKey={itemKey}
          itemLabel={itemLabel}
          onPick={onPick}
          zIndex={zIndex}
        />
      )}
      {nonEmptyFolders.map((folder) => (
        <FolderSubmenu
          key={folder.id}
          label={`📁 ${folder.name}`}
          items={itemsByFolder.get(folder.id) ?? []}
          itemKey={itemKey}
          itemLabel={itemLabel}
          onPick={onPick}
          zIndex={zIndex}
        />
      ))}
      {restUnfiled.map((item) => (
        <button key={itemKey(item)} className="btn-ghost" style={{ textAlign: "left" }} onClick={() => onPick(item)}>
          {itemLabel(item)}
        </button>
      ))}
    </>
  );
}
