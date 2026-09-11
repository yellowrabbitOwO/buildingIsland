import { useEffect, useState } from "react";

/** 把 Asset 的 Blob 轉成可以塞進 <img>/<video>/<a href> 的 object URL，元件卸載或 blob 換掉時
 * 自動釋放，避免 object URL 累積洩漏。資源分頁縮圖與影片欄位共用同一份邏輯 */
export function useAssetUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
