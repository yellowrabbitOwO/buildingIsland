import type { ReactNode } from "react";

/** 畫布類頁面（地圖／關係圖／分支敘事／時間線）共用的「工作軟體」外殼：標題列在最上面、下面
 * 是一個真正「釘住不隨頁面捲動」的工作區——功能分散貼在畫布四周（上：toolbar；左：leftPanel；
 * 右：sidePanel；下：bottomPanel，全部選用），畫布本身盡量佔滿中間剩下的空間，四周都不會被
 * 頁面捲動帶走，只有畫布內容本身（透過畫布自己的縮放平移）或各面板內容過長時各自局部捲動。
 * 比照側邊導覽欄（見 Sidebar.tsx）已經在用的 `height:"100vh"; position:"sticky"; top:0`
 * 這套「貼滿視窗高度、貼頂」的做法，這裡整個外殼（標題列＋toolbar＋下面那排）用一個直向 flex
 * 容器包住，卡在 `calc(100vh - WORKBENCH_OUTER_CHROME)` 這個固定高度，讓整個工作區剛好貼齊
 * 視窗底部、下方的 bottomPanel／sidePanel／leftPanel 這些卡片才會真正貼在畫面最下緣，而不是
 * 頁面另外多出一截可以捲動的空白。
 *
 * 這個 flex 容器內部（標題列／toolbar／下面那排 leftPanel-畫布-sidePanel）本身又是直向排列，
 * 畫布那排吃 `flex:1 1 auto`：標題列、toolbar 實際各佔多少高度，畫布那排就自動拿到「剩下的」
 * 高度，不用像早期版本那樣個別猜每一塊會用到視窗高度的固定比例——因為標題列／toolbar 的高度
 * 已經由外層 flex 容器自動分配掉了，WORKBENCH_OUTER_CHROME 完全不需要（也不能）再把它們的
 * 高度算進去，只需要算「這個 flex 容器本身以外」的東西：呼叫端的頁面容器（見 WorldWorkspace.tsx
 * 的 `<main style={{padding:"24px 32px"}}>`）上下 padding 各 24px，加起來 48px——容器本身的
 * 高度完全交給 flexbox 自動分配，不用再手動估標題列高度，才不會多扣一次，把工作區的可用空間
 * 平白縮小、底部留一大截用不到的空白。toolbar 自己仍留一個高度上限＋內部捲動當防呆，避免內容
 * 一多就把畫布擠到快要看不見 */
const WORKBENCH_OUTER_CHROME = 48;

export function CanvasWorkbench({
  titleBar,
  toolbar,
  leftPanel,
  leftPanelWidth = 72,
  bottomPanel,
  sidePanel,
  sidePanelWidth = 280,
  extraBottomOffset = 0,
  embedded = false,
  children,
}: {
  titleBar: ReactNode;
  /** 貼在畫布區塊「頂端、橫跨整個中間欄」的功能列，比較適合放跟畫布＋左右面板都無關的全域選項
   * （例如關係圖／分支敘事圖的呈現模式、時間線的畫布／月曆切換）；地圖這種有明確「工具＋當前
   * 工具設定」兩層次的畫布改用下面的 leftPanel／bottomPanel 分開放，這裡通常不用 */
  toolbar?: ReactNode;
  /** 貼在畫布左側的直向面板，用於「選哪個工具」這種一次只選一個、彼此互斥的按鈕群組
   * （比照 Photoshop／Illustrator 左側的工具列） */
  leftPanel?: ReactNode;
  leftPanelWidth?: number;
  /** 貼在畫布下方（跟畫布同一欄，寬度隨畫布欄而非整個工作區）的功能列，用於「目前選中的工具
   * 有哪些細部設定」（比照 Photoshop 工具列下方的選項列）——會隨選的工具不同而整排換掉 */
  bottomPanel?: ReactNode;
  sidePanel?: ReactNode;
  sidePanelWidth?: number;
  /** 頁面下方另外有自己的 position:fixed／position:sticky 停靠面板時（例如分支敘事圖點段落節點
   * 彈出的段落編輯區），傳這個值讓工作區自己再扣一截高度，畫布欄位跟著往上縮，不會被那塊面板
   * 蓋住底部——那塊面板通常自己另外管理要不要顯示、多高，呼叫端量好目前實際佔用的高度傳進來即可 */
  extraBottomOffset?: number;
  /** 在側邊面板（SidePanel.tsx）裡渲染時傳 true：側欄本身已經是另一個 `height:100vh` 的
   * 獨立捲動容器（見 SidePanel.tsx 的 <aside>），裡面還套一層固定貼齊「這次視窗」高度的計算，
   * 兩層 100vh 沒對齊、側欄自己的標題列／padding 也沒算進去，工具列／畫布很容易被切掉一截或
   * 留一大塊空白。embedded 時退回單純的自然排版（跟著側欄本身的捲動走），不強制卡高度——
   * 側欄本來就會自己捲動，犧牲「固定不隨捲動」這個效果換取版面一定是對的 */
  embedded?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(embedded
          ? {}
          : {
              height: `calc(100vh - ${WORKBENCH_OUTER_CHROME}px - ${extraBottomOffset}px)`,
            }),
      }}
    >
      <div style={{ marginBottom: 8, flexShrink: 0 }}>{titleBar}</div>
      {toolbar && (
        // maxHeight+overflowY 是防呆：toolbar 用 flexShrink:0（自然高度），內容一多（例如地圖把
        // 整個屬性面板搬來這裡）理論上仍可能長到快要吃光整個工作區、把畫布擠到看不見——用高度
        // 上限＋內部捲動擋住。畫布那排是 flex:1（見下面），toolbar 實際佔多少高度就自動只留多少，
        // 不用像早期版本那樣預先假設 toolbar 一定用到視窗高度的固定比例去扣
        <div
          className="card"
          style={{
            padding: 10,
            marginBottom: 10,
            flexShrink: 0,
            maxHeight: embedded ? undefined : "40vh",
            overflowY: embedded ? undefined : "auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
          }}
        >
          {toolbar}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: embedded ? "wrap" : "nowrap",
          gap: 12,
          // alignItems 用預設的 stretch（不能寫 flex-start）：這個 row 要撐滿父層分給它的高度，
          // 子項目才會讓自己裡面的 minHeight:0/overflow:auto 生效；flex-start 只會讓子項目照
          // 自己內容的自然高度排，父層的高度限制就形同虛設，捲動又跑回頁面本身。
          // flex:1 讓這一排吃掉外層 flex 直向容器裡「扣掉標題列／toolbar 之後剩下的」所有高度——
          // toolbar 沒有內容或內容很少時，這排（也就是畫布）自動變大，不用手動猜 toolbar 高度。
          // embedded 時完全不設 flex/高度，讓這個 row 跟著內容自然長高，交給側欄自己的捲動處理。
          // minHeight:0（不是某個下限像素值）：這一排不能有自己的下限，否則視窗矮、標題列＋
          // toolbar 內容一多換行變高時，這排會被撐超過外層工作區剩下的空間，讓下方的 bottomPanel
          // （工具設定卡）被推出視窗底部、要捲動頁面才看得到——「下方的卡要貼齊畫面最下方」這個
          // 需求優先於「畫布不能縮太小」，畫布本身現在會照實際拿到的空間動態縮放（見 MapViewPage
          // 的 canvasHostRef／ResizeObserver），縮小了也不會被裁切看不到，只是變小，不需要靠這裡的
          // 下限硬撐
          ...(embedded ? {} : { flex: "1 1 auto", minHeight: 0 }),
        }}
      >
        {leftPanel && (
          <div
            className="card"
            style={{
              width: leftPanelWidth,
              flexShrink: 0,
              alignSelf: "stretch",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              overflowY: "auto",
            }}
          >
            {leftPanel}
          </div>
        )}
        {/* 這一欄裝畫布＋下方設定列：畫布區塊吃掉這一欄大部分高度、自己內部捲動
            （overflow:auto），下方設定列固定高度貼在這一欄底部——外層工作區的高度是釘死的，
            捲動永遠只發生在畫布內容自己裡面，不會把左右面板、下方設定列一起帶著捲走 */}
        <div style={{ flex: "1 1 auto", minWidth: 320, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
          {bottomPanel && (
            // maxHeight+overflowY 是防呆：設定列內容在窄版面下可能換成好幾排，理論上仍可能長到
            // 吃光整欄高度、把畫布擠到 0——用設定列自己的高度上限＋內部捲動擋住，保證畫布區塊
            // 永遠至少分得到一半高度
            <div
              className="card"
              style={{
                padding: 10,
                marginTop: 10,
                flexShrink: 0,
                maxHeight: "50%",
                overflowY: "auto",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: 16,
              }}
            >
              {bottomPanel}
            </div>
          )}
        </div>
        {sidePanel && (
          <div
            className="card"
            style={{
              width: sidePanelWidth,
              flexShrink: 0,
              alignSelf: "stretch",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflowY: "auto",
            }}
          >
            {sidePanel}
          </div>
        )}
      </div>
    </div>
  );
}
