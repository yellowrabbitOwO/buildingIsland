export interface StorageUsage {
  usageBytes: number;
  quotaBytes?: number;
}

/** 用 Storage API 估算目前來源（origin）用掉多少本地空間，大致涵蓋 IndexedDB／快取等本機儲存；
 * 部分瀏覽器（或隱私模式）不支援 navigator.storage.estimate，此時回傳 undefined 讓呼叫端顯示替代文字 */
export async function getLocalStorageUsage(): Promise<StorageUsage | undefined> {
  if (!navigator.storage?.estimate) return undefined;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage === undefined) return undefined;
  return { usageBytes: usage, quotaBytes: quota };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
