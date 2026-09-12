import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 的專案頁面（見 .github/workflows/deploy.yml）跑在 /<repo>/ 子路徑底下，
  // 資源路徑要跟著加上這個前綴才載得到；BASE_PATH 只有那個 workflow 會設，本機開發／
  // 一般 build 不受影響，維持預設的 '/'
  base: process.env.BASE_PATH ?? '/',
  // nodePolyfills：pdfmake（成稿匯出 PDF 用）底層的 pdfkit 是 Node stream-based 套件，瀏覽器端
  // bundle 內部仍會用到 process/Buffer/global 等 Node 全域物件；Vite（跟 Webpack 4 不同）預設不會
  // polyfill 這些，實測發現若缺這些全域物件，pdfMake.createPdf(...).getBlob() 會整個卡住、
  // 不丟錯誤也不觸發 callback（見成稿匯出 PDF phase 的字型 spike 診斷過程）
  plugins: [react(), nodePolyfills()],
})
