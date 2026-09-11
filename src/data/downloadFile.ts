/** 觸發瀏覽器下載一個 Blob——沿用 MapViewPage.tsx PNG 匯出用的同一套
 * createObjectURL → 暫時 <a download> → revokeObjectURL 寫法，抽成共用函式供其他匯出功能呼叫 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
