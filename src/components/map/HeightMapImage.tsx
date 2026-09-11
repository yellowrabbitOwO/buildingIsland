import { useId, useMemo } from "react";
import { DEFAULT_SEA_COLOR, heightRampTableValues } from "../../data/heightColorRamp";

/** 依高度圖 dataURL 套用等高線地形圖風格的濾鏡顯示；沒有 dataURL（新地圖，尚未繪製過）時直接畫一片海洋色。
 * 濾鏡定義只需要算一次色階表，畫布圖層跟世界首頁縮圖共用這個元件，之後要調色只改 heightColorRamp.ts */
export default function HeightMapImage({
  dataUrl,
  width,
  height,
  seaColor = DEFAULT_SEA_COLOR,
}: {
  dataUrl?: string;
  width: number;
  height: number;
  seaColor?: string;
}) {
  const filterId = useId();
  const { r, g, b } = useMemo(() => heightRampTableValues(seaColor), [seaColor]);

  if (!dataUrl) {
    return <rect x={0} y={0} width={width} height={height} fill={seaColor} />;
  }

  return (
    <>
      <defs>
        <filter id={filterId} x="0" y="0" width="100%" height="100%">
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues={r} />
            <feFuncG type="discrete" tableValues={g} />
            <feFuncB type="discrete" tableValues={b} />
          </feComponentTransfer>
        </filter>
      </defs>
      <image href={dataUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" filter={`url(#${filterId})`} />
    </>
  );
}
