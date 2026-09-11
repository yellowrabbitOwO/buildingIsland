import Modal from "../common/Modal";
import ResolvedColor from "../common/ResolvedColor";
import type { ManagerFolder } from "../../data/types";
import { useLanguage } from "../../i18n";

interface PickFolderDialogProps {
  title?: string;
  /** 已經依樹狀順序壓平、附上巢狀深度的資料夾清單（見 managerFolder.ts 的 flattenFolderTree），縮排會依 depth 呈現 */
  folders: { folder: ManagerFolder; depth: number }[];
  value?: string;
  rootLabel?: string;
  onClose: () => void;
  onPick: (folderId: string | undefined) => void;
}

/** 選擇要移至的資料夾（範本／模組／群組／資料夾本身皆可用），以彈窗列表取代直接內嵌的下拉選單；
 * 有子資料夾時用縮排＋「└」符號讓親子關係一眼可見 */
export default function PickFolderDialog({ title, folders, value, rootLabel, onClose, onPick }: PickFolderDialogProps) {
  const { t } = useLanguage();
  return (
    <Modal title={title ?? t("folderSelect.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          className="btn"
          style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={() => onPick(undefined)}
        >
          <span>{rootLabel ?? t("entryCard.unfiled")}</span>
          {!value && <span style={{ color: "var(--accent)" }}>●</span>}
        </button>
        {folders.map(({ folder: f, depth }) => (
          <button
            key={f.id}
            className="btn"
            style={{
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingLeft: 12 + depth * 20,
            }}
            onClick={() => onPick(f.id)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {depth > 0 && <span style={{ color: "var(--text-faint)" }}>└</span>}
              <ResolvedColor value={f.tagColor}>{(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}</ResolvedColor>
              {f.name}
            </span>
            {value === f.id && <span style={{ color: "var(--accent)" }}>●</span>}
          </button>
        ))}
        {folders.length === 0 && <p style={{ color: "var(--text-muted)" }}>{t("pickFolderDialog.noFolders")}</p>}
      </div>
    </Modal>
  );
}
