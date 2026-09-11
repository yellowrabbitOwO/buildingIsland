import type { ReactNode } from "react";
import LocalUserAvatar from "./LocalUserAvatar";
import DropdownMenu from "../common/DropdownMenu";

interface AccountPopoverShellProps {
  avatar?: string;
  name: string;
  /** 彈窗內容（依需要的動作按鈕），呼叫端各自決定要放什麼；close 供按鈕點擊後自行收合彈窗 */
  children: (close: () => void) => ReactNode;
}

/** 帳號按鈕共用骨架：trigger（頭貼＋名稱）＋彈窗上半部（大頭貼＋粗體名稱），
 * LocalUserAccountButton（世界列表頁「目前使用者」）與 LastLocalUserButton（登入頁「最近使用」）
 * 只有底下的動作按鈕不同，其餘排版完全一致，抽出來避免兩份幾乎相同的 JSX */
export default function AccountPopoverShell({ avatar, name, children }: AccountPopoverShellProps) {
  return (
    <DropdownMenu
      minWidth={220}
      renderTrigger={({ ref, onClick }) => (
        <button
          ref={ref}
          className="btn"
          onClick={onClick}
          style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 180, whiteSpace: "nowrap" }}
        >
          <LocalUserAvatar avatar={avatar} size={24} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        </button>
      )}
    >
      {(close) => (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 8px" }}>
          <LocalUserAvatar avatar={avatar} size={56} />
          <strong>{name}</strong>
          {children(close)}
        </div>
      )}
    </DropdownMenu>
  );
}
