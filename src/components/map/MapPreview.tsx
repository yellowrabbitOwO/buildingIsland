import type { MapView } from "../../data/types";
import HeightMapImage from "./HeightMapImage";

/** 已儲存地圖的唯讀縮圖：直接顯示套色後的高度圖靜態圖片，不需要即時互動 */
export default function MapPreview({ map }: { map: MapView }) {
  const width = 760;
  const height = 420;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${map.width} ${map.height}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ maxWidth: "100%", display: "block", borderRadius: 6 }}
    >
      <HeightMapImage dataUrl={map.heightMap} width={map.width} height={map.height} seaColor={map.seaColor} />
    </svg>
  );
}
