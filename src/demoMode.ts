/** 公開展示版旗標：只有部署到 GitHub Pages 的建置（見 .github/workflows/deploy.yml 設定的
 * VITE_READONLY_DEMO=true）才會是 true，本機開發／一般使用完全不受影響。開啟時：
 * - db.ts 在所有資料表掛上寫入防護，任何新增／修改／刪除都會直接擋下（見該檔案）
 * - App.tsx 的路由只放行世界首頁／分類／條目／搜尋，其餘工具頁面（地圖、時間線、範本管理…）
 *   一律導回世界首頁
 * - 各頁面自己額外隱藏新增／編輯／刪除／複製／搬移等操作按鈕，避免顯示點了卻沒反應的死按鈕 */
export const isReadOnlyDemo = import.meta.env.VITE_READONLY_DEMO === "true";
