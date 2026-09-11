// 核心資料型別定義 —— 對應規格文件「四、條目／資訊卡系統」

export type Scope = "world" | "global";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "color"
  | "image"
  | "video"
  | "entryLink"
  | "chart"
  | "nested"
  | "choice"
  | "scale"
  | "date";

export interface NumberFieldConfig {
  mode: "free" | "range" | "integer";
  min?: number;
  max?: number;
}

export type ChartType = "bar" | "line" | "pie" | "radar" | "tree" | "mindmap" | "fishbone" | "numberline";

/** 數線圖模式：x＝僅單一數線（如問卷 1~10 分）；xy＝雙軸座標點 (x, y) */
export type NumberLineMode = "x" | "xy";

/** 樹狀圖／心智圖節點形狀 */
export type ChartNodeShape = "circle" | "rect" | "roundedRect" | "diamond";

export interface ChartDataPoint {
  id: string;
  label: string;
  value: number;
  /** 分支型圖表（樹狀圖／心智圖／魚骨圖）專用：上層節點 id，留空代表頂層節點 */
  parentId?: string;
  /** 自訂此資料點/節點的顏色；留空則依調色盤自動指定 */
  color?: string;
  /** 折線圖／雷達圖多線模式：所屬線（ChartSeries.id）；留空代表單線模式 */
  seriesId?: string;
  /** 數線圖 xy 模式專用：Y 軸數值；value 欄位此時作為 X 軸數值使用 */
  y?: number;
  /** 樹狀圖／心智圖節點形狀；留空則使用圖表預設形狀 */
  shape?: ChartNodeShape;
  /** 此節點與其上層節點之間連接線的樣式覆寫；留空則沿用圖表整體的 branchStyle */
  edgeStyle?: ChartBranchStyle;
  /** 是否在連接線上加上箭頭（指向此節點） */
  edgeArrow?: boolean;
  /** 沿連接線方向標註的文字 */
  edgeLabel?: string;
}

/** 折線圖／雷達圖多線模式下的一條線；各線共用同一組資料點的 label（項目/軸） */
export interface ChartSeries {
  id: string;
  label: string;
  /** 留空則依調色盤自動指定 */
  color?: string;
}

export type ChartBranchStyle = "straight" | "curved" | "elbow";

export interface ChartFieldConfig {
  /** 目前使用中的圖表類型 */
  chartType: ChartType;
  /** 若長度大於 1，代表此欄位可於填寫時切換使用中的圖表類型；chartType 為目前使用中的類型 */
  allowedChartTypes?: ChartType[];
  /** 雷達圖最高刻度；留空則依資料自動調整 */
  maxValue?: number;
  /** 長條圖／折線圖／數線圖 X 軸數值最小/最大值；留空則依資料自動調整 */
  axisMin?: number;
  axisMax?: number;
  /** 數線圖 xy 模式 Y 軸數值最小/最大值；留空則依資料自動調整 */
  yAxisMin?: number;
  yAxisMax?: number;
  /** 數線圖模式：僅 X 軸／X+Y 雙軸；留空預設為僅 X 軸 */
  numberLineMode?: NumberLineMode;
  /** 所有圖表類型皆可設定底色；留空則透明 */
  backgroundColor?: string;
  /** 分支形狀，樹狀圖／心智圖使用 */
  branchStyle?: ChartBranchStyle;
  /** 圖表顯示寬高；留空則使用預設值 */
  width?: number;
  height?: number;
  /** 分支型圖表（樹狀圖／心智圖／魚骨圖）節點手動位置覆寫，key = ChartDataPoint.id */
  manualPositions?: Record<string, { x: number; y: number }>;
  /** 折線圖／雷達圖多線模式；有值代表啟用多線，資料點需透過 seriesId 對應到各線 */
  series?: ChartSeries[];
}

/** 巢狀欄位型態的一個選項節點；children 為空代表葉節點（可被選取） */
export interface NestedOptionNode {
  id: string;
  label: string;
  children: NestedOptionNode[];
}

export interface NestedFieldConfig {
  /** manual：自行編輯多層選項；category：從世界內某分類的資料夾／條目結構自動產生選項樹 */
  mode: "manual" | "category";
  options?: NestedOptionNode[];
  sourceCategoryId?: string;
}

export interface EntryLinkFieldConfig {
  allowedCategoryIds: string[]; // 世界內特定分類 id
  allowedBuiltInCategoryKeys: BuiltInCategoryKey[]; // 內建分類 key（供通用群組/模組跨世界使用）
  multiple: boolean;
}
// allowedCategoryIds 與 allowedBuiltInCategoryKeys 皆空 = 不限分類（全選）

export type DateFieldMode = "single" | "recurring" | "range";
/** 只有語意上代表「出生日期」的時間欄位（role==="birth"）才會觸發角色時間線的自動生成/同步
 * （見 characterTimeline.ts）；death／pregnancyStart 這兩個角色目前只保留型別空間，尚未有
 * 自動化行為——真正的死亡紀錄是掛在 role==="birth" 欄位自己的 DateValueSingle.death 裡
 * （見下方），不是獨立欄位；受孕則完全用 DateFieldConfig.gestationDays 從出生日期推算，
 * 不再是使用者填的一個值。pregnancyStart 這個 role 值本身指的是「這個角色自己在母體內、
 * 出生前的起點」，不是這個角色本身懷孕 */
export type DateFieldRole = "birth" | "death" | "pregnancyStart";
/** 週期性重複的頻率：每年（月+日固定）或每月（僅日固定）；不支援「每週」——曆法系統目前
 * 沒有「週」的概念，只有年/月/日，週期規則只能建立在既有的月/日結構上 */
export type RecurrenceFrequency = "yearly" | "monthly";

/** 日期最小顯示/輸入到哪一層：year＝只到年；month 多顯示月；day 再多顯示日；hour/minute/second
 * 依序再多顯示時/分/秒輸入框。影響 UI 顯示與輸入，不影響底層儲存格式——PlainDateTime 的
 * monthIndex/day/hour/minute/second 缺省一律視為 0（day 為 1），precision 只決定「要不要讓使用者填」 */
export type DateTimePrecision = "year" | "month" | "day" | "hour" | "minute" | "second";

/** 日期＋（可選）時間的最小共用單位，供單一時間／固定性／持續型三種模式的日期端點共用；
 * hour/minute/second 缺省視為 0，是否顯示這些欄位由 DateFieldConfig.precision／
 * Timeline.timePrecision 決定 */
export interface PlainDateTime {
  year: number;
  monthIndex: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface DateFieldConfig {
  /** 這個欄位的日期要用哪一套曆法解讀；新增欄位時必選，選好前顯示「請先選擇曆法」 */
  calendarId: string;
  mode: DateFieldMode;
  role?: DateFieldRole;
  /** 日期最小顯示到哪一層（時/分/秒）；未設定視為 "day"（跟今天的行為一致） */
  precision?: DateTimePrecision;
  /** 以下三個設定只有 mode==="single" 且 role==="birth" 時才有意義 */
  showBeforeBirth?: boolean; // 開啟後，早於出生日期的時間點顯示「出生前 X 年」，而非略過不顯示
  /** 設定孕期長度（天）後，系統直接用出生日期往前推算受孕起點（不用使用者手動填一個日期）；
   * 落在推算出的受孕起點～出生之間顯示「胎兒期」。未設定或 0 ＝不追蹤 */
  gestationDays?: number;
  trackDeath?: boolean; // 開啟後，這個欄位額外能填「死亡日期」，晚於死亡的時間點顯示「死後 X 年」
}

/** 時間欄位 FieldValue.current 的實際形狀（依 mode 而定，用 as 轉型讀取，跟其他型別的既有慣例一致） */
export interface DateValueSingle extends PlainDateTime {
  mode: "single";
  /** trackDeath 開啟才可能有值 */
  death?: PlainDateTime;
}
export interface DateValueRecurring {
  mode: "recurring";
  frequency: RecurrenceFrequency;
  /** frequency==="yearly" 才有意義 */
  monthIndex?: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}
export interface DateValueRange {
  mode: "range";
  start: PlainDateTime;
  /** 不填＝仍在進行中 */
  end?: PlainDateTime;
}
export type DateFieldValue = DateValueSingle | DateValueRecurring | DateValueRange;

/** 選擇題欄位的一個選項 */
export interface ChoiceOption {
  id: string;
  label: string;
  /** 選填的標籤色彩，供顯示時區辨用 */
  color?: string;
}

export interface ChoiceFieldConfig {
  options?: ChoiceOption[];
}

/** 刻度欄位：linear＝線性刻度（拉滑桿決定偏向左端或右端）；rating＝評分（星等）；range＝範圍（條目的值本身是一組區間［最小值，最大值］，兩者皆須落在可接受範圍「之內」） */
export type ScaleMode = "linear" | "rating" | "range";

/** 數值精度：smooth＝連續值（可為小數）；fixed＝限定為整數 */
export type ScalePrecision = "smooth" | "fixed";

/** 線性刻度端點的內容型態 */
export type ScaleEndKind = "text" | "number" | "color" | "image" | "entryLink";

/** 線性刻度模式的一個端點（左端或右端）；依 kind 決定使用哪個欄位 */
export interface ScaleEnd {
  kind: ScaleEndKind;
  /** text／number 模式使用（number 模式存數字的文字表示） */
  text?: string;
  /** color 模式使用；可為色票參照 */
  color?: string;
  /** image 模式使用；dataURL */
  image?: string;
  /** entryLink 模式使用；代表此端點的條目 id */
  entryId?: string;
}

export interface ScaleFieldConfig {
  /** 目前使用中的模式 */
  mode: ScaleMode;
  /** 若長度大於 1，代表此欄位可於填寫時切換使用中的模式；mode 為目前使用中的模式 */
  allowedModes?: ScaleMode[];
  precision: ScalePrecision;
  /** 線性刻度／範圍模式共用：可接受的數值範圍；留空預設 0~100。線性刻度＝可選數值須落在此區間內；範圍＝條目填寫的區間值（兩個數字）皆須落在此區間內 */
  min?: number;
  max?: number;
  /** 線性刻度模式：左端／右端定義 */
  left?: ScaleEnd;
  right?: ScaleEnd;
  /** 星級模式：滿分星數；留空預設 5 */
  maxStars?: number;
}

/** 複合欄位的額外子值格：如「職業」欄位除了主要值之外，可再加「年份」等獨立型態的子值。
 * 與 FieldDef 的型態/設定屬性同構，各子值格可各自獨立設定（型態、範圍、選項……） */
export interface FieldSlotDef {
  id: string;
  /** 子值標籤，如「年份」；留空則不特別標示 */
  label?: string;
  type: FieldType;
  hint?: string;
  allowedTypes?: FieldType[];
  numberConfig?: NumberFieldConfig;
  entryLinkConfig?: EntryLinkFieldConfig;
  chartConfig?: ChartFieldConfig;
  nestedConfig?: NestedFieldConfig;
  choiceConfig?: ChoiceFieldConfig;
  scaleConfig?: ScaleFieldConfig;
  dateConfig?: DateFieldConfig;
}

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  numberConfig?: NumberFieldConfig;
  entryLinkConfig?: EntryLinkFieldConfig;
  chartConfig?: ChartFieldConfig;
  nestedConfig?: NestedFieldConfig;
  choiceConfig?: ChoiceFieldConfig;
  scaleConfig?: ScaleFieldConfig;
  dateConfig?: DateFieldConfig;
  /** 提示詞：僅編輯階段顯示，用來提示應輸入的內容 */
  hint?: string;
  /** 若長度大於 1，代表此欄位可於填寫時切換使用中的型態；type 為目前使用中的型態 */
  allowedTypes?: FieldType[];
  /** 額外子值格；留空＝單一值欄位（今天的行為）。有值時，此欄位的每個實例（含「新增第二個」出來的
   * 每一份）同時持有主值＋這些子值，各自獨立輸入，例如「職業」＝主值(職業名稱) + 子值(年份) */
  extraSlots?: FieldSlotDef[];
  /** 若此欄位是從群組／模組展開而來，標記所屬實例與名稱，供顯示時聚合成一個框（訊息集中） */
  groupInstanceId?: string;
  groupLabel?: string;
  /** 展開來源的群組／模組 id，供編輯群組／模組時同步既有條目使用 */
  sourceGroupId?: string;
  sourceModuleId?: string;
}

/** 群組：多個相關欄位綁在一起新增，例如「人際關係」= 關係人 + 關係類型 */
export interface FieldGroup {
  id: string;
  worldId?: string; // scope === "world" 時才有值
  scope: Scope;
  name: string;
  isBuiltIn: boolean;
  folderId?: string;
  /** 限定可用的分類 id；空或未設定＝通用，所有分類皆可使用 */
  restrictedCategoryIds?: string[];
  fields: FieldDef[];
}

export type ModuleBlock =
  | { kind: "field"; field: FieldDef }
  /** fieldOrder：此模組內對該群組欄位順序的覆寫（僅影響此模組展開時的順序，不影響群組本身定義） */
  | { kind: "group"; groupId: string; fieldOrder?: string[] };

/** 模組：預先做好、較龐大完整的一整包資訊，例如「角色外觀」 */
export interface FieldModule {
  id: string;
  worldId?: string;
  scope: Scope;
  name: string;
  isBuiltIn: boolean;
  folderId?: string;
  /** 限定可用的分類 id；空或未設定＝通用，所有分類皆可使用 */
  restrictedCategoryIds?: string[];
  blocks: ModuleBlock[];
}

export type TemplateBlock =
  | { kind: "field"; field: FieldDef }
  /** fieldOrder：此範本內對該群組欄位順序的覆寫（僅影響此範本展開時的順序，不影響群組本身定義） */
  | { kind: "group"; groupId: string; fieldOrder?: string[] }
  /** fieldOrder：此範本內對該模組展開後欄位順序的覆寫（依 key 排序，僅影響此範本，不影響模組本身定義） */
  | { kind: "module"; moduleId: string; fieldOrder?: string[] };

/** 範本：套用在整個類別的資訊卡上
 * allCategories：套用於所有分類（通用範本，不限類型）
 * categoryId：套用於世界內特定分類（含自訂分類）
 * builtInCategoryKey：通用(global)範本套用於內建分類類型，跨世界以 key 比對
 * allCategories／categoryId／builtInCategoryKey 三者擇一設定
 */
export interface Template {
  id: string;
  worldId?: string;
  scope: Scope;
  allCategories?: boolean;
  categoryId?: string;
  builtInCategoryKey?: BuiltInCategoryKey;
  name: string;
  isBuiltIn: boolean;
  folderId?: string;
  blocks: TemplateBlock[];
}

export function templateAppliesToCategory(
  template: Template,
  category: Category
): boolean {
  if (template.allCategories) return true;
  if (template.categoryId && template.categoryId === category.id) return true;
  if (
    template.builtInCategoryKey &&
    template.builtInCategoryKey === category.builtInKey
  )
    return true;
  return false;
}

/** 條目類型（分類）：角色/地點/事件/組織/物品/筆記，可自訂新增 */
export interface Category {
  id: string;
  worldId: string;
  name: string;
  icon?: string;
  isBuiltIn: boolean;
  builtInKey?: BuiltInCategoryKey; // 內建分類的穩定識別鍵，供通用範本跨世界比對
  order: number;
  defaultTemplateId?: string;
}

export interface EntryFolder {
  id: string;
  worldId: string;
  categoryId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

export interface FieldValue {
  current: unknown;
  /** 額外子值格的值，key = FieldSlotDef.id；僅欄位設定了 extraSlots 時使用 */
  extraSlotValues?: Record<string, unknown>;
}

/** 條目（資訊卡） */
export interface Entry {
  id: string;
  worldId: string;
  categoryId: string;
  folderId?: string;
  name: string;
  thumbnail?: string; // dataURL 或 color:#xxxxxx
  summary?: string;
  titleColor?: string;
  starred: boolean;
  starredFieldIds: string[];
  /** 決定在主世界首頁「★ 重點內容彙整」的顯示順序；數字小排前面，未設定的排最後 */
  starOrder?: number;
  templateId?: string;
  fields: FieldDef[]; // 套用範本時展開複製，之後可自由增刪
  values: Record<string, FieldValue>; // key = FieldDef.id
  createdAt: string;
  updatedAt: string;
}

/** 跨條目關聯，用於自動雙向反向連結 */
export interface Relation {
  id: string;
  fromEntryId: string;
  fromFieldId: string;
  /** 若此關聯來自欄位的額外子值格（而非主值），記錄是哪一格；未設定＝指向主值 */
  fromSlotId?: string;
  toEntryId: string;
}

export interface World {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  coverColor?: string;
  tagColor?: string;
  /** 主世界「★ 重點內容」清單卡片頂部色條：key 是分類 id，關係圖用固定的 RELATION_GRAPH_COLOR_KEY，
   * 分支敘事圖用固定的 NARRATIVE_GRAPH_COLOR_KEY，一般寫作文件用固定的 WRITING_DOC_COLOR_KEY */
  categoryColors?: Record<string, string>;
  /** 這個世界新增時間欄位時預設代入的曆法；未設定則沿用舊行為（新欄位曆法留空，使用者自行選擇）。
   * 見 TemplateManagerPage.tsx 曆法頁籤的「設為預設」、FieldSlotEditor.tsx、resolveTemplateFields */
  defaultCalendarId?: string;
  /** 這個世界屬於哪個本地使用者（見 LocalUser）；舊資料／全新安裝尚未建立使用者前可能沒有值，
   * ensureDefaultLocalUserForExistingWorlds()（seed.ts）會在開機時把沒有值的世界歸到自動建立
   * 的預設使用者名下，不會讓世界永久缺少這個欄位 */
  localUserId?: string;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 本地使用者（見規格文件「帳號與世界系統」）：本質上是「這台裝置上的一份本機資料容器」，
 * 不是跟雲端帳號平起平坐的另一種登入身份——它存在的真正目的是雲端帳號還沒做時的過渡方案，
 * 以及未來雲端帳號上線後，讓同一台裝置可以區分不同雲端帳號各自的本機資料，避免互相覆蓋。
 * 刻意做得很單薄——只管「這是誰的世界」跟基本顯示用資訊，不像 World 有一堆內容欄位。
 *
 * 目前完全沒有雲端帳號功能，`linkedCloudAccountId` 永遠是 undefined；以下記錄未來雲端帳號
 * 上線時，這個欄位應該怎麼運作（現在還不用實作，先把設計記下來避免屆時要重新推導）：
 * - 沒登入雲端，或雲端帳號都還沒登入過：裝置上直接建立/使用一個沒有連結任何雲端帳號的本地使用者
 *   （現在的行為就是這樣——MainPage「略過登入，使用本機」）。
 * - 第一次用某個雲端帳號登入：如果裝置上剛好只有一個本地使用者、而且他還沒連結任何雲端帳號，
 *   直接把這個雲端帳號記到他的 `linkedCloudAccountId` 上（沿用既有的本機資料，不用另外新建一份，
 *   也不用使用者自己選）；如果裝置上完全沒有本地使用者，新建一個並連結。
 * - 用同一個雲端帳號再次登入（`linkedCloudAccountId` 已經等於這個雲端帳號 id）：單純視為「切換
 *   回這個已存在的本地使用者」，不會新建，也不用跳出任何選擇/警告畫面。
 * - 用另一個不同的雲端帳號登入（裝置上已經有本地使用者連結了別的雲端帳號）：跳出「選擇要用哪個
 *   本地使用者」的畫面，可以選一個既有的（但沒有連結任何雲端帳號的）本地使用者來連結，或新建一個。
 * - 在上一步選到一個「已經連結了『別的』雲端帳號」的本地使用者：跳出警告——這代表兩個不同雲端帳號
 *   即將共用同一份本機資料，很可能造成資料互相覆蓋，要讓使用者確認清楚才能繼續。 */
export interface LocalUser {
  id: string;
  name: string;
  /** 跟 Entry.thumbnail 同一套慣例：可能是圖片 dataURL，也可能是純色色碼／色票參照，
   * 用 isColorValue()（colorResolve.ts）分辨是哪一種 */
  avatar?: string;
  /** 這個本地使用者目前連結的雲端帳號 id；未設定＝還沒連結任何雲端帳號。目前雲端帳號功能
   * 還沒做，這個欄位目前永遠是 undefined，只是先把資料結構準備好（見上方類別註解的完整設計） */
  linkedCloudAccountId?: string;
  createdAt: string;
}

/** categoryColors 裡代表「關係圖」這個偽分類的固定 key */
export const RELATION_GRAPH_COLOR_KEY = "__relationGraph__";

/** categoryColors 裡代表「分支敘事圖」這個偽分類的固定 key */
export const NARRATIVE_GRAPH_COLOR_KEY = "__narrativeGraph__";

/** categoryColors 裡代表「一般寫作文件」這個偽分類的固定 key */
export const WRITING_DOC_COLOR_KEY = "__writingDoc__";

/** 關係圖目錄用的資料夾，僅依世界分類（不像 EntryFolder 需要 categoryId） */
export interface RelationGraphFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 已儲存的關係圖「檢視」：節點/連線永遠即時從世界的條目與關聯資料算出，
 * 這裡只存個人化設定（隱藏的節點/分類、手動調整過的位置、網格設定） */
export interface RelationGraphView {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  /** 決定在主世界首頁「★ 關係圖」的顯示順序；數字小排前面，未設定的排最後 */
  starOrder?: number;
  hiddenNodeIds: string[];
  hiddenCategoryIds: string[];
  positions: Record<string, { x: number; y: number }>;
  /** 是否顯示背景網格（純視覺，與對齊方式各自獨立） */
  gridVisible: boolean;
  /** 拖曳節點時的對齊方式：無／貼齊格點／貼齊格線（僅較近的一軸）／貼齊格子中心。
   * 顯示網格時也會依此決定背景圖案樣式（無則沿用線狀網格當作視覺提示） */
  alignMode: "none" | "dot" | "line" | "square";
  gridSize: number;
  /** 呈現模式：force＝自動排列的節點圖（彈性連線，適合非階層關係）；tree＝樹狀階層圖（適合血緣／從屬關係） */
  layoutMode: "force" | "tree";
  groups: RelationGraphGroup[];
  /** 使用者按「儲存視角」時記錄的縮放平移狀態；未設定則開圖時自動縮放置中顯示全部內容 */
  viewport?: { x: number; y: number; scale: number };
  createdAt: string;
  updatedAt: string;
}

/** 關係圖上的群組框：畫在節點/連線底下的大形狀，純粹用來視覺分組，不影響節點資料本身 */
export interface RelationGraphGroup {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  title: string;
}

/** categoryColors 裡代表「地圖」這個偽分類的固定 key */
export const MAP_COLOR_KEY = "__map__";

/** 地圖目錄用的資料夾，僅依世界分類（比照 RelationGraphFolder） */
export interface MapFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 圖層：平面圖裡的牆／房間各自屬於一個圖層，圖層可以個別關閉顯示（不會被刪除，只是暫時不畫出來） */
export interface FloorPlanLayer {
  id: string;
  name: string;
  visible: boolean;
  /** true＝這是每張地圖固定存在、供地標點／地標區域使用的系統圖層：名稱鎖定「地標」、不能被
   * 重新命名或刪除，也不會出現在「設為作用中圖層」的選項裡——地標物件一律直接指定歸屬這個圖層
   * 的 id，不透過 activeLayerId 決定歸屬。舊資料沒有這個欄位，視為一般圖層（undefined/false） */
  isLandmarkLayer?: boolean;
}

/** 填滿方式：整面純色／點狀／45° 斜線陣列；僅封閉形狀（房間／多邊形）使用，牆／標註是線段沒有
 * 填滿的概念 */
export type FloorPlanFillPattern = "solid" | "dot" | "diagonal";

/** 選取牆／房間／標註／多邊形後可個別覆寫的樣式；全部選填，未設定的欄位維持原本的預設外觀
 * （見 data/floorPlanStyle.ts 的 resolveStroke／resolveFill 如何套用預設值），舊資料不用轉檔
 * 即可相容。符號（FloorPlanSymbol）本身是固定圖示，不套用這組樣式 */
export interface FloorPlanStyle {
  strokeColor?: string;
  dashed?: boolean;
  fillColor?: string;
  fillPattern?: FloorPlanFillPattern;
}

/** 一段牆：兩個端點的內容座標，屬於某個圖層；style 是選填的線條樣式覆寫 */
export interface FloorPlanWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layerId: string;
  style?: FloorPlanStyle;
}

/** 房間的幾何形狀：未設定視為 "rect"（相容舊資料，舊房間本來就都是矩形）。所有形狀共用同一個
 * x/y/width/height 外框（見 FloorPlanRoom），形狀本身是內接在這個外框裡的圖形——換句話說縮放／
 * 旋轉操作對所有形狀都是同一套邏輯，差別只在依外框畫出來的實際圖形（見 data/roomShapes.ts 的
 * getRoomShapePoints） */
export type RoomShape = "rect" | "circle" | "triangle" | "pentagon" | "hexagon" | "star";

/** 一個房間：外框範圍（x,y 為左上角，未旋轉時的座標；shape 決定實際畫出來的幾何形狀，見上），
 * 屬於某個圖層，label 是選填的房間名稱；rotation 是繞外框中心順時針旋轉的角度（度），未設定
 * 視為 0——旋轉後縮放手柄先停用（見 MapViewPage.tsx 說明），避免旋轉＋縮放同時做時角點運算出錯。
 * style 是選填的線條／填滿樣式覆寫（見 FloorPlanStyle），未設定則維持原本的預設外觀 */
export interface FloorPlanRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layerId: string;
  label?: string;
  rotation?: number;
  shape?: RoomShape;
  style?: FloorPlanStyle;
}

/** 一條尺寸標註：兩個端點的內容座標＋屬於某個圖層，是「量距離」工具的永久版——量出來的距離
 * 不只是臨時顯示，而是存起來永遠畫在圖上（CAD 的標註線），換算實際距離的方式跟量距離工具共用
 * 同一個 formatRealDistance／formatDimensionLabel（見 MapDecorations.tsx） */
export interface FloorPlanDimension {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layerId: string;
  style?: FloorPlanStyle;
}

/** 平面圖符號類型：常見傢俱／門窗圖示，圖示畫法定義在 FloorPlanSymbols.tsx，這裡只存「是哪一種」 */
export type FloorPlanSymbolType = "door" | "window" | "bed" | "sofa" | "table" | "chair" | "stairs" | "sink";

/** 一個傢俱／門窗符號：中心點內容座標＋旋轉角度（度，順時針，跟房間旋轉同一套慣例，未設定視為 0），
 * 屬於某個圖層；圖示本身固定內容座標尺寸（見 FloorPlanSymbols.tsx 的 SYMBOL_SIZE），scale 是統一
 * 變形外框新增的縮放倍率（未設定視為 1，即維持原本固定尺寸），flipX 是水平鏡射（未設定視為
 * false）——因為門/窗這類圖示本身左右不對稱（例如門的開啟方向），翻轉會有實際視覺差異，需要獨立
 * 欄位記住狀態，不能像房間那樣單純用「旋轉角度取負」代替 */
export interface FloorPlanSymbol {
  id: string;
  type: FloorPlanSymbolType;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  flipX?: boolean;
  layerId: string;
}

/** 一個自由多邊形房間：至少 3 個頂點的內容座標，依序連接形成封閉形狀，屬於某個圖層；label 是
 * 選填的房間名稱。跟矩形房間（FloorPlanRoom）是兩種平行的物件類型而非同一種東西的變形——矩形
 * 房間有寬高／旋轉這些矩形專屬的操作，多邊形房間只支援搬移整個形狀＋個別拖曳頂點調整形狀，
 * 兩者操作方式差異夠大，分開存比較清楚（見 MapViewPage.tsx 的多邊形工具說明） */
export interface FloorPlanPolygonRoom {
  id: string;
  points: { x: number; y: number }[];
  layerId: string;
  label?: string;
  style?: FloorPlanStyle;
}

/** 一個文字標籤：自由文字內容＋位置＋圖層，可自訂字級／顏色，用來在圖上加註說明（房間/牆本身
 * 已經有 label 可用，這個是給不屬於任何物件、單獨放在畫布上的文字，例如區域名稱、備註）。
 * rotation（度，順時針，未設定視為 0）跟 flipX（水平鏡射，未設定視為 false）是統一變形外框新增的
 * 欄位——大小沿用既有 fontSize，不另外設 scale 欄位（文字只有一個尺寸自由度） */
export interface FloorPlanText {
  id: string;
  x: number;
  y: number;
  text: string;
  layerId: string;
  fontSize?: number;
  color?: string;
  rotation?: number;
  flipX?: boolean;
}

/** 地標點的圖示種類：聚落（城鎮/村莊）、建築地標（地標建築/紀念碑、城堡/要塞、神殿/廟宇）、
 * 自然地貌（山脈、森林、水域）、遺跡/特殊（洞穴、遺跡）——跟 FloorPlanSymbolType（傢俱/門窗）
 * 是完全獨立的型別，即使未來有名稱相近的種類也不合併，因為兩者的渲染/驗證路徑各自獨立 */
export type FloorPlanLandmarkIcon =
  | "town"
  | "landmark"
  | "castle"
  | "temple"
  | "mountain"
  | "forest"
  | "water"
  | "cave"
  | "ruins";

/** 一個地標圖示類型：內建 9 種手繪圖示（builtInKey 固定等於原本 FloorPlanLandmarkIcon 的字面值，
 * 圖示形狀不能改，但名稱可以）＋1 種內建「通用」水滴圖釘（isBuiltIn: true 但沒有 builtInKey，
 * 一樣不能刪除）＋使用者自己新增的自訂類型（isBuiltIn: false，沒有 builtInKey，用 customImage
 * 上傳圖片當圖示，沒上傳圖片時退回「通用圖釘」的畫法）。id 用亂數產生（見
 * ensureBuiltInLandmarkIconTypes 的說明：內建類型的 id 不能用固定字面值，每個世界的資料庫主鍵會
 * 互撞），語意上「這是哪一種內建圖示」交給 builtInKey 負責。每個世界各自一份，跟 Category 的
 * isBuiltIn／builtInKey 是同一種設計，但內建項目的名稱這裡刻意允許修改（跟 Category／Calendar
 * 的內建鎖定慣例不同，是這個功能本身的設計選擇）。
 *
 * 釘頭上疊的文字（customText）刻意不放在這裡、而是放在 FloorPlanLandmarkPoint——同一個「通用」
 * 類型可能被放到地圖上很多個地標點，每個點想標的字通常不一樣（例如同樣用「通用」類型的三個礦坑，
 * 各自想顯示「金」「銀」「銅」），類型層級只適合放「這一整類共用的預設外觀」（線條／文字／填滿
 * 顏色），不適合放這種每個點各不相同的內容 */
export interface LandmarkIconType {
  id: string;
  worldId: string;
  label: string;
  isBuiltIn: boolean;
  builtInKey?: FloorPlanLandmarkIcon;
  customImage?: string;
  /** 圖示線條顏色（9 種手繪內建圖示、通用圖釘的外框都吃這個），地標點自己的 color 可以再覆蓋 */
  defaultColor?: string;
  /** 通用圖釘（沒有 builtInKey、沒有 customImage 時）釘頭裡自訂文字的顏色，未設定時退回線條顏色
   * （跟線條同色，維持舊版沒有這個欄位之前的外觀）。對 9 種手繪內建圖示沒有意義（它們沒有文字），
   * UI 只在通用／自訂類型那一列顯示；地標點自己的 textColor 可以再覆蓋 */
  textColor?: string;
  /** 通用圖釘（沒有 builtInKey、沒有 customImage 時）釘頭的填滿顏色，未設定時維持鏤空（跟舊版
   * 沒有這個欄位之前的外觀一致）。同樣對 9 種手繪內建圖示沒有意義；地標點自己的 fillColor 可以
   * 再覆蓋 */
  fillColor?: string;
  order: number;
}

/** 一個地標點：帶圖示的定點標記，固定歸屬「地標」系統圖層（見 FloorPlanLayer.isLandmarkLayer），
 * 可選填連結到「地點」分類的一張資訊卡（linkedEntryId，單向、不同步——資訊卡被刪除時視同未連結，
 * 不會報錯），地圖上顯示的標籤文字優先順序：自訂 label → 連結地點的名稱（即時查詢）→ 圖示的
 * 預設中文名稱。icon 是 LandmarkIconType.id（不是封閉聯集——使用者可以自訂新的類型），舊資料
 * 存的內建字面值（如 "town"）因為內建類型的 id 延續使用同一個字串，不需要轉檔 */
export interface FloorPlanLandmarkPoint {
  id: string;
  x: number;
  y: number;
  icon: string;
  layerId: string;
  label?: string;
  linkedEntryId?: string;
  /** 圖示線條顏色；未設定時退回 icon 對應類型的 defaultColor，再沒有就退回 DEFAULT_LANDMARK_ICON_COLOR */
  color?: string;
  /** 通用圖釘（icon 對應的類型沒有 builtInKey、沒有 customImage 時）釘頭裡疊的文字，只能是單一
   * 字元（UI 層限制輸入），留空就不顯示任何文字（不會退回名稱首字之類的預設值——這是每個地標點
   * 自己選擇要不要標文字，不是類型的預設外觀） */
  customText?: string;
  /** 通用圖釘釘頭裡 customText 的顏色；未設定時退回 icon 對應類型的 textColor，再沒有就退回
   * 目前生效的線條顏色（color 欄位那一套） */
  textColor?: string;
  /** 通用圖釘的填滿顏色；未設定時退回 icon 對應類型的 fillColor，再沒有就維持鏤空 */
  fillColor?: string;
  /** 統一變形外框新增：縮放倍率（未設定視為 1）、旋轉角度（度，順時針，未設定視為 0）、水平鏡射
   * （未設定視為 false，例如自訂上傳圖片可能左右不對稱） */
  scale?: number;
  rotation?: number;
  flipX?: boolean;
}

/** 一個地標區域：跟 FloorPlanPolygonRoom 一樣是依序點頂點的自由多邊形、可套用同一套
 * FloorPlanStyle（線條/填滿），差別在於固定歸屬「地標」系統圖層，且多了跟地標點一樣的
 * label／linkedEntryId 連結欄位——語意上是「圈一塊地點的範圍」而不是「畫一個房間」 */
export interface FloorPlanLandmarkArea {
  id: string;
  points: { x: number; y: number }[];
  layerId: string;
  label?: string;
  linkedEntryId?: string;
  style?: FloorPlanStyle;
}

/** 平面圖物件的種類（8 種）——獨立匯出成型別，讓 data 層的共用邊界框/變形計算（見 floorPlan.ts
 * 的 getFpItemBounds／getFpItemLocalBox）跟 MapViewPage.tsx 的選取狀態都能引用同一份定義 */
export type FpItemType = "wall" | "room" | "dimension" | "symbol" | "polygon" | "text" | "landmarkPoint" | "landmarkArea";

/** 平面圖內容：牆／矩形房間／尺寸標註／傢俱門窗符號／自由多邊形房間／文字標籤，都掛在圖層底下；
 * activeLayerId 決定新畫的物件要歸到哪一層 */
export interface FloorPlanData {
  layers: FloorPlanLayer[];
  activeLayerId: string;
  walls: FloorPlanWall[];
  rooms: FloorPlanRoom[];
  dimensions: FloorPlanDimension[];
  symbols: FloorPlanSymbol[];
  polygons: FloorPlanPolygonRoom[];
  texts: FloorPlanText[];
  landmarkPoints: FloorPlanLandmarkPoint[];
  landmarkAreas: FloorPlanLandmarkArea[];
}

/** 指北針視覺款式：classic＝原本就有的圓底+十字放射線（預設，舊資料沒有 style 欄位時視為這個）；
 * rose＝八角羅盤玫瑰；arrow＝簡約指北箭頭。見 components/map/MapDecorations.tsx 的 CompassGraphic
 * 與 MapViewPage.tsx 的 PNG 匯出（兩邊要同步支援每一種款式，畫布顯示跟匯出圖片才會一致） */
export type CompassStyle = "classic" | "rose" | "arrow";

/** 單一地圖同時支援兩種內容，畫在同一個畫布上、共用名稱／星號／資料夾／尺寸這些外層欄位：
 * heightMap 等是手繪高度地形，floorPlan 是向量牆＋房間＋圖層（見 FloorPlanData）——編輯時用
 * 上方的模式切換在「地形」「平面圖」兩套工具列之間切換，兩邊畫的東西疊在同一張地圖上 */
export interface MapView {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** 畫布內容座標範圍（固定尺寸，目前不提供建立時選擇解析度的功能） */
  width: number;
  height: number;
  /** 高度圖：灰階 PNG dataURL，像素亮度 0~255 線性對應高度 0~100；
   * 未繪製過時是 undefined，畫布該部分顯示為海平面 */
  heightMap?: string;
  /** 海洋顏色；未設定時使用預設值（見 heightColorRamp.ts 的 DEFAULT_SEA_COLOR） */
  seaColor?: string;
  /** 平面圖內容（牆／房間／圖層）；未使用過平面圖工具的地圖是 undefined */
  floorPlan?: FloorPlanData;
  viewport?: { x: number; y: number; scale: number };
  /** 底圖參考：半透明疊在筆刷圖層上方供描繪（原始顏色，不套等高線濾鏡），跟 heightMap 分開存，
   * 純粹當作臨摹輔助，只在編輯模式顯示，不會出現在瀏覽畫面 */
  referenceImage?: string;
  referenceImageOpacity?: number;
  /** 比例尺：內容座標系位置＋長度（像素）對應 realDistance 個 unit（使用者自訂單位文字，例如「公里」）。
   * 存成數字＋單位而不是單純一串文字，是因為畫布尺規／量距離工具都要用 lengthPx/realDistance
   * 這個比例反推任意兩點的實際距離，字串沒辦法可靠地拆出數字來算 */
  scaleBar?: { x: number; y: number; lengthPx: number; realDistance: number; unit: string };
  /** 指北針：內容座標系位置＋旋轉角度（度，順時針，0＝北朝畫布上方）＋四個方位標籤（預設東西南北，可各自改成自訂文字）。
   * style 是視覺款式（見 CompassStyle／CompassGraphic），未設定視為 "classic"（這個功能上線前就存在的唯一款式，
   * 舊資料不用轉檔即可相容） */
  compass?: { x: number; y: number; rotation: number; labels: { n: string; e: string; s: string; w: string }; style?: CompassStyle };
  createdAt: string;
  updatedAt: string;
}

export interface NarrativeGraphFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 一張分支敘事圖（文字RPG／Twine風）的外層資訊；段落本身是各自獨立的一手內容資料（見 Passage），
 * 這裡只存圖的基本資料與起始段落標記 */
export interface NarrativeGraph {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** 故事開頭的段落 id（Twine 的「起始段落」標記）；未設定表示尚未指定 */
  startPassageId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 段落裡的一個選項連結：使用者選擇後前往 targetPassageId；未連結（尚未選段落）時 targetPassageId 為 undefined，
 * 畫布上不畫線，但選項文字本身還在，不會因為斷線就整筆消失。
 * label 是選項的名稱（用於選項列表、下拉選單等內部識別），與畫布連接線上實際顯示的文字（aboveText／belowText）分開：
 * aboveText 留空時，連接線上方顯示的文字才會退回沿用 label */
export interface PassageChoice {
  id: string;
  label: string;
  targetPassageId?: string;
  /** 連接線顏色；留空使用預設色 */
  lineColor?: string;
  /** 連接線粗細；留空使用預設值 */
  lineWidth?: number;
  /** 連接線上方顯示的文字（選填，與選項名稱 label 分開輸入）；留空則退回顯示 label */
  aboveText?: string;
  aboveTextSize?: number;
  aboveTextColor?: string;
  /** 連接線下方另外顯示的文字（選填，與上方的文字分開），可獨立設定字級／顏色 */
  belowText?: string;
  belowTextSize?: number;
  belowTextColor?: string;
}

/** 分支敘事圖裡的一個段落：一塊故事正文＋若干選項連結，畫布上的一個節點 */
export interface Passage {
  id: string;
  worldId: string;
  graphId: string;
  title: string;
  body: string;
  choices: PassageChoice[];
  position: { x: number; y: number };
  /** 節點底色／文字顏色；留空使用預設值 */
  bgColor?: string;
  textColor?: string;
  /** 節點顯示寬高；留空使用預設值 */
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
}

/** 一般寫作文件目錄用的資料夾，僅依世界分類（比照 NarrativeGraphFolder） */
export interface WritingFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 一般寫作模式（Word-like 富文本）的一份文件 */
export interface WritingDoc {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** TipTap／ProseMirror 文件 JSON；尚未寫過內容時為 undefined，編輯器用空文件初始化 */
  content?: object;
  /** 字數快取，存檔時從 content 抽出的純文字重新計算；直接數字元數（比照 Passage.body.length 的既有慣例），
   * 不特別處理英文斷詞，符合中文為主的使用情境 */
  wordCount: number;
  /** 使用者自訂目標字數，選填 */
  targetWordCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 故事板目錄用的資料夾，僅依世界分類（比照 NarrativeGraphFolder／WritingFolder） */
export interface StoryboardFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 故事板的一個「幕/區塊」；使用者可自由新增/刪除/改名/排序，不特別標記任何一塊為特殊的「未分類」——
 * 輕量結構資料，直接存在 Storyboard 記錄自己身上（不開獨立資料表），比照 RelationGraphView.groups 的做法 */
export interface StoryboardLane {
  id: string;
  name: string;
  order: number;
}

/** 故事板：受 Save the Cat 節拍表啟發的場景規劃板，多個 lane、每個 lane 裡放可跨 lane 拖曳的卡片 */
export interface Storyboard {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  lanes: StoryboardLane[];
  createdAt: string;
  updatedAt: string;
}

/** 故事板卡片＝一個場景/節拍；數量多、內容重，跟 Passage 之於 NarrativeGraph 一樣開獨立資料表 */
export interface StoryboardCard {
  id: string;
  storyboardId: string;
  laneId: string;
  order: number;
  title: string;
  time?: string;
  location?: string;
  /** 相關資訊卡：連到任意分類的既有 Entry，不限角色——直接存 id 陣列，不走 relation.ts 的
   * syncEntryLinkRelations（那套是 Entry 互連專用，卡片不是 Entry，硬接上去會讓卡片的連結意外冒出在關係圖裡） */
  relatedEntryIds: string[];
  content?: string;
  emotionalTurn?: string;
  conflict?: string;
  createdAt: string;
  updatedAt: string;
}

export const STORYBOARD_COLOR_KEY = "__storyboard__";

/** 故事章節目錄用的資料夾，僅依世界分類（比照 NarrativeGraphFolder／WritingFolder） */
export interface StoryOutlineFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 一份「章節大綱」文件：同一個世界可以建立多份（例如不同故事線各一份），底下是一棵可無限
 * 細分的篇章樹（見 StoryChapter） */
export interface StoryOutline {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** 選填：設定後新增篇章時，「時間」型別的欄位（若套用的章節範本有帶）留空曆法就會自動代入這一套。
   * 可隨時更換，不像 Timeline 的曆法選定後鎖定——換這個不會讓既有篇章已經填好的欄位資料損毀，
   * 只影響「之後新增的篇章」透過範本代入的預設值 */
  calendarId?: string;
  /** 選填：新增篇章時要套用哪一份章節範本（見 StoryChapterTemplate）自動帶入預設欄位；
   * 不設定就是空白篇章，跟資訊卡「不選範本」的既有行為一致。可隨時更換 */
  chapterTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 一個篇章節點；parentChapterId 未設定＝頂層篇章，可無限往下細分——用扁平表＋parentChapterId
 * 存階層（比照 TimelineBranch.parentBranchId 的既有慣例），order 是同一層兄弟節點之間的順序。
 * 欄位比照資訊卡（Entry）：name 是固定頂層欄位，其餘內容用通用的 fields/values 系統自由增刪，
 * 供套用章節範本（StoryChapterTemplate）帶入預設欄位。fields/values 不接 relation.ts 的
 * syncEntryLinkRelations／scrubEntryLinkReferences（那套是 Entry 互連專用，篇章不是 Entry，
 * 接上去會讓連結意外冒出在關係圖裡；來源 Entry 被刪除後這裡的 entryLink 欄位值留著失效 id
 * 也不會壞，渲染時 EntryLinkPicker 唯讀模式自己查不到就自然濾掉，跟故事板卡片現有行為一致） */
export interface StoryChapter {
  id: string;
  worldId: string;
  outlineId: string;
  parentChapterId?: string;
  order: number;
  name: string;
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  /** 是否啟用正文（TipTap 富文本），由使用者依這個篇章的需要自行決定，不是每個篇章都要有 */
  hasBody: boolean;
  /** TipTap／ProseMirror 文件 JSON；hasBody 為 false 時不使用（比照 WritingDoc.content 的既有慣例） */
  body?: object;
  bodyWordCount: number;
  createdAt: string;
  updatedAt: string;
}

export const STORY_OUTLINE_COLOR_KEY = "__storyOutline__";

/** 章節範本：跟 Template 之於 Category 的關係一樣，只是章節不屬於任何分類，所以不需要
 * allCategories/categoryId/builtInCategoryKey 這些綁定欄位——每一份章節範本本來就能被任何
 * 「章節大綱」文件選用（見 StoryOutline.chapterTemplateId） */
export interface StoryChapterTemplate {
  id: string;
  worldId?: string; // scope === "world" 時才有值
  scope: Scope;
  name: string;
  isBuiltIn: boolean;
  folderId?: string;
  blocks: TemplateBlock[];
}

/** 劇本文件目錄用的資料夾，僅依世界分類（比照 NarrativeGraphFolder／WritingFolder） */
export interface ScriptFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

/** 劇本模式（Fountain 格式啟發的自動排版編輯器）的一份文件 */
export interface ScriptDoc {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** TipTap／ProseMirror 文件 JSON；每個頂層節點都是 scriptLine，帶 lineType/manualOverride 屬性 */
  content?: object;
  /** 字數快取，比照 WritingDoc.wordCount 的既有慣例：存檔時從 content 抽出的純文字重新計算字元數 */
  wordCount: number;
  targetWordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const SCRIPT_DOC_COLOR_KEY = "__scriptDoc__";

export interface CalendarMonth {
  id: string;
  name: string;
  days: number;
}

/** 一套自訂曆法：比照範本／模組／群組的 scope + isBuiltIn + folderId 模式（管理頁「曆法」分頁
 * 可整理成資料夾，並內建一套「西元」），可被多個時間線文件共用同一套曆法，
 * 避免同一個世界底下兩份時間線各自定義出互相矛盾的月份結構 */
export interface Calendar {
  id: string;
  worldId?: string; // scope === "world" 時才有值
  scope: Scope;
  isBuiltIn: boolean;
  folderId?: string;
  name: string;
  months: CalendarMonth[];
  /** 一週幾天；未設定（或 <1）＝這套曆法不追蹤星期概念，時間線／月曆模式不顯示星期、不判斷週末。
   * 星期是獨立於月份結構之外、單純每隔固定天數重複一次的週期，不受月份邊界影響（例如某個月的
   * 最後一天跟下個月第一天照樣連續算） */
  weekLength?: number;
  /** 每個星期幾的名稱，索引 0～weekLength-1；缺項時退回「第 N 天」（見 calendarMath.ts 的
   * weekdayName） */
  weekdayNames?: string[];
  /** 星期幾算週末，索引對應 weekdayNames／weekAnchor 的 weekdayIndex；可複選（例如週六日兩天） */
  weekendDayIndices?: number[];
  /** 星期換算的錨點：指定「某年某月某日」對應第幾個星期幾，其餘日期的星期都用這個點往前後推算
   * （見 calendarMath.ts 的 weekdayOf）。未設定時預設錨點為曆法紀元起點（year:0, 1月1日）對應
   * 星期 0 */
  weekAnchor?: { year: number; monthIndex: number; day: number; weekdayIndex: number };
  createdAt: string;
  updatedAt: string;
}

/** 時間線目錄用的資料夾，僅依世界分類（比照 NarrativeGraphFolder／WritingFolder） */
export interface TimelineFolder {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  tagColor?: string;
}

export interface Timeline {
  id: string;
  worldId: string;
  folderId?: string;
  name: string;
  description?: string;
  tagColor?: string;
  starred: boolean;
  starOrder?: number;
  /** 這份時間線使用哪套曆法；建立時必選（世界裡要先有至少一套曆法才能新增時間線） */
  calendarId: string;
  /** 使用者可設定的畫布可視範圍（例如西元 2002～2026）；不設定則自動依現有事件／分岔點的日期範圍決定
   * （兩者都沒有時退回一個預設範圍），讓分支即使還沒有任何事件，也能先顯示一條有意義長度的線 */
  viewStartYear?: number;
  viewEndYear?: number;
  /** 若這條時間線是系統為某個角色 Entry 自動建立維護的「角色時間線」，這裡記錄來源 Entry id；
   * 使用者手動建立的一般時間線這個欄位是 undefined（見 characterTimeline.ts） */
  ownerEntryId?: string;
  /** 標記這是系統自動建立維護的「全部角色」彙整時間線（同一世界只會有一條）：主線上同步彙整
   * 這個世界裡每個有出生日期的角色的出生/死亡事件，供一次比較所有角色的生日與相對年齡。
   * 跟 ownerEntryId 用途類似但不屬於單一角色，見 characterTimeline.ts */
  isAllCharactersTimeline?: boolean;
  /** 這條時間線上所有事件日期最小顯示到哪一層（時/分/秒）；未設定視為 "day"。全時間線共用一個
   * 設定，事件不用各自選——同一條時間線上的事件通常屬於同一個敘事顆粒度 */
  timePrecision?: DateTimePrecision;
  /** 故事主要發生的時間焦點：畫布掛載時與按下「重置檢視」時，會以這個區間為中心縮放置中，
   * 而不是每次都要重新手動導覽到故事重點所在的時間段（時間線本身仍是一條涵蓋完整可視範圍、
   * 不會斷掉的線，這只是決定「預設看哪一段」）。focusEndYear 未設定＝聚焦單一時間點
   * （focusYear 本身那一年）；有設定＝聚焦一段區間（focusYear～focusEndYear）。兩者都未設定
   * 則維持原本「縮放置中顯示全部內容」的行為 */
  focusYear?: number;
  focusEndYear?: number;
  createdAt: string;
  updatedAt: string;
}

/** 時間線上的一條世界線／分支；只支援分岔，不支援合併。
 * parentBranchId 為 undefined 代表主線（每條時間線建立時自動建一條） */
export interface TimelineBranch {
  id: string;
  timelineId: string;
  name: string;
  color?: string;
  parentBranchId?: string;
  /** 分岔點的日期——直接存日期而非參照某個事件，讓分岔不依賴父分支已經有事件存在
   * （父分支即使還沒有任何事件，也能先決定「從什麼時候開始分岔」）；主線本身沒有這三個欄位。
   * 獨立世界線（parentBranchId 為 undefined 但不是主線）也可以選填這三個欄位，當成明確的起始日期
   * ——不設定則維持原本「從可視範圍最左端開始」的行為（見 TimelineViewPage.tsx 的 laneStartX） */
  divergeYear?: number;
  divergeMonthIndex?: number;
  divergeDay?: number;
  /** 這條分支/世界線的結束日期（選填）：設定後車道的線只會畫到這個日期就停住，不會像預設一樣
   * 無限往右延伸——用於「舊時代到此結束，另開一條世界線接續新時代」這種需要明確劃出起訖範圍的情境。
   * 沒設定則維持原本「一路延伸下去」的行為 */
  endYear?: number;
  endMonthIndex?: number;
  endDay?: number;
  /** 同一個父分支底下的手足排序，決定車道分配的順序 */
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** 時間線上的一個事件：日期比照通用時間欄位，支援單一時間／固定性（週期重複）／持續型（區間）
 * 三種模式（見 DateFieldValue），內容則比照 Entry 用通用的 FieldDef[]/FieldValue 系統，
 * 讓使用者能像資訊卡一樣自由增刪欄位 */
export interface TimelineEvent {
  id: string;
  worldId: string;
  timelineId: string;
  branchId: string;
  name: string;
  date: DateFieldValue;
  /** 事件自己的顏色；未設定則沿用所在分支的顏色（見 TimelineBranch.color） */
  color?: string;
  fields: FieldDef[];
  values: Record<string, FieldValue>;
  /** 選填連結既有資訊卡（角色/地點等），比照 StoryboardCard.relatedEntryIds 的既有慣例 */
  relatedEntryIds: string[];
  /** 標記這是同步角色出生/死亡/受孕自動產生的事件（而非使用者手動新增），存檔時用來找到
   * 既有的自動事件並更新，而不是每次都重複新增；編輯器裡也用這個鎖定名稱/日期 */
  autoKind?: "birth" | "death" | "pregnancyStart";
  /** 選填連結到「事件」分類裡對應的資訊卡（見 timelineEventSync.ts）：這個時間線事件的名稱/日期
   * 若跟著同步，會反映到這張資訊卡上；使用者也可以從既有的事件資訊卡反過來匯入成時間線事件，
   * 兩種情況都會設定這個欄位。跟 autoKind 的角色生日/死亡不同，這裡連結的是「事件」分類的一般資訊卡 */
  linkedEntryId?: string;
  createdAt: string;
  updatedAt: string;
}

export const TIMELINE_COLOR_KEY = "__timeline__";

export const BUILTIN_CATEGORY_KEYS = [
  "character",
  "location",
  "event",
  "organization",
  "item",
  "note",
] as const;

export type BuiltInCategoryKey = (typeof BUILTIN_CATEGORY_KEYS)[number];

export const BUILTIN_CATEGORY_LABELS: Record<BuiltInCategoryKey, string> = {
  character: "角色",
  location: "地點",
  event: "事件",
  organization: "組織",
  item: "物品",
  note: "筆記",
};

/** 標籤色彩（色票），供任何色彩選擇欄位快速套用；scope 與群組/模組/範本概念相同 */
export interface ColorSwatch {
  id: string;
  color: string;
  label?: string;
  order: number;
  folderId?: string;
  /** 未設定視為 "global"（相容舊資料） */
  scope?: Scope;
  worldId?: string; // scope === "world" 時才有值
}

/** 管理頁（範本／模組／群組／標籤色彩／資源／曆法）可整理用的資料夾種類 */
export type ManagerKind = "template" | "module" | "group" | "color" | "resource" | "calendar" | "storyChapterTemplate";

export type AssetKind = "image" | "video" | "audio" | "document" | "other";

/** 素材管理的一筆檔案：實際內容存 Blob（不是 base64 data URL）——圖片以外的檔案
 * （尤其影片）動輒數 MB，內嵌成 data URL 存進其他記錄會讓那筆記錄被版本歷史整包複製時
 * 跟著暴增；獨立一張表存 Blob，欄位／資源分頁都只存 assetId 參照。這張表刻意不掛版本歷史
 * hook（見 versionHistory.ts 頂端說明）——檔案是「被取代」而不是「被編修」的東西 */
export interface Asset {
  id: string;
  scope: Scope;
  worldId?: string; // scope === "world" 才有
  folderId?: string; // 對應 ManagerFolder（kind: "resource"）
  name: string;
  kind: AssetKind;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: string;
  updatedAt: string;
}

/** 管理頁資料夾：可設定單一世界或通用，與範本/模組/群組的 scope 概念相同 */
export interface ManagerFolder {
  id: string;
  kind: ManagerKind;
  worldId?: string;
  scope: Scope;
  name: string;
  order: number;
  tagColor?: string;
  /** 上層資料夾 id；不設定即為頂層資料夾。同一個 kind 底下的資料夾才可互相巢狀 */
  parentFolderId?: string;
}

/** 版本歷史的一筆快照：某個內容表的一筆記錄在被更新或刪除「之前」的完整內容，由
 * src/data/versionHistory.ts 的 Dexie table hook 統一攔截寫入，見該檔案說明——不是各個
 * repository 的 save/update 函式自己寫的 */
export interface ContentVersion {
  id: string;
  /** 直接存 Dexie 的表名字串（"entries"／"writingDocs"…），復原時可以直接 db.table(entityType)
   * 用，不用再另外維護一份「entityType → 表名」對照表 */
  entityType: string;
  entityId: string;
  /** 部分全域範圍的內容（如通用範本）沒有 worldId */
  worldId?: string;
  /** 存檔當下的顯示名稱（obj.name，撈不到就留空），版本列表 UI 不用另外反查就能顯示 */
  entityName?: string;
  /** 這個版本被取代／刪除前的完整內容（深拷貝，不跟 Dexie 內部物件共用參照） */
  snapshot: unknown;
  /** 這筆快照是「被更新取代」還是「被刪除」——刪除的快照可以拿來復原被誤刪的項目 */
  reason: "updated" | "deleted";
  createdAt: string;
}
