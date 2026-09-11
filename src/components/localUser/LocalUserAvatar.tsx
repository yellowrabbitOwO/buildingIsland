import { isColorValue } from "../../data/colorResolve";
import ResolvedColor from "../common/ResolvedColor";

/** 本地使用者頭像的三態渲染（RGB 純色／圖片／空白預設圓），CurrentUserSection 與
 * LocalUserAccountButton 共用同一段邏輯，避免兩處各刻一次 */
export default function LocalUserAvatar({ avatar, size }: { avatar?: string; size: number }) {
  if (isColorValue(avatar)) {
    return (
      <ResolvedColor value={avatar}>
        {(hex) => <div style={{ width: size, height: size, borderRadius: "50%", background: hex ?? "var(--bg-hover)", flexShrink: 0 }} />}
      </ResolvedColor>
    );
  }
  if (avatar) {
    return <img src={avatar} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--bg-hover)", flexShrink: 0 }} />;
}
