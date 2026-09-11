/** pdfmake 的瀏覽器 bundle（build/pdfmake.js）沒有隨附型別定義，DefinitelyTyped 的
 * @types/pdfmake 對應的是舊版 callback 風格 API，跟這次實際安裝版本（0.3.11，getBlob 改成
 * async/Promise，見 exportPdf.ts 的字型 spike 診斷過程）對不上，這裡就不裝、直接宣告成 any，
 * exportPdf.ts 內部自己用執行期特徵判斷（typeof addVirtualFileSystem === "function"）*/
declare module "pdfmake/build/pdfmake" {
  const pdfMake: any;
  export default pdfMake;
}
