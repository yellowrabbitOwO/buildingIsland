import type { Table, Transaction } from "dexie";
import type { ContentVersion } from "./types";

const MAX_VERSIONS_PER_ENTITY = 30;

/** 每筆快照都會觸發一次修剪查詢；修剪動作是「盡力而為、非同步、不等待」，見
 * attachVersionHistoryHook 呼叫端 */
async function pruneOldVersions(versionsTable: Table<ContentVersion, string>, entityType: string, entityId: string): Promise<void> {
  const all = await versionsTable.where({ entityType, entityId }).sortBy("createdAt");
  const excess = all.length - MAX_VERSIONS_PER_ENTITY;
  if (excess > 0) await versionsTable.bulkDelete(all.slice(0, excess).map((v) => v.id));
}

/** 掛在某張內容表上，統一攔截「更新前」／「刪除前」的完整記錄寫進 contentVersions——不改動任何
 * 既有的 save/update repository 函式，新增一種要涵蓋的內容類型只要在 db.ts 的表格清單裡加一行。
 * versionsTable 用參數傳入（而不是直接 import db）是為了避免 db.ts↔versionHistory.ts 互相
 * import 造成的循環依賴。
 *
 * IndexedDB 的 transaction 涵蓋的 store 清單在建立當下就固定了、中途不能擴增，所以不能在
 * hook 內直接對 contentVersions 這張「原本沒被包進這次 transaction」的表寫入——要用
 * transaction.on("complete", ...) 延到原本的存檔 transaction 真的提交之後，另外開一次獨立寫入。
 * 這也表示版本記錄的寫入不保證跟原始存檔操作同一個 transaction 原子性——它是盡力而為的安全網，
 * 寫入失敗（catch 吞掉）不該讓原本的存檔操作跟著失敗 */
/** 整批刪除世界時呼叫，標記在該次 cascade-delete 的 transaction 上：世界都刪了，
 * 過程中每張表觸發的「刪除前」快照不用再記錄（沒有「復原單一項目」的意義），
 * deleteWorld() 會接著直接清掉這個世界既有的全部版本歷史，兩者搭配才不會有
 * 「先清掉舊快照、hook 又在 transaction 提交後補進新快照」的競態 */
export function skipVersionHistoryFor(transaction: Transaction): void {
  (transaction as unknown as { _skipVersionHistory?: boolean })._skipVersionHistory = true;
}

export function attachVersionHistoryHook(table: Table<any, string>, entityType: string, versionsTable: Table<ContentVersion, string>): void {
  const capture = (obj: any, reason: "updated" | "deleted", transaction: Transaction) => {
    if (!obj || typeof obj !== "object" || typeof obj.id !== "string") return;
    if ((transaction as unknown as { _skipVersionHistory?: boolean })._skipVersionHistory) return;
    transaction.on("complete", () => {
      versionsTable
        .add({
          id: crypto.randomUUID(),
          entityType,
          entityId: obj.id,
          worldId: typeof obj.worldId === "string" ? obj.worldId : undefined,
          entityName: typeof obj.name === "string" ? obj.name : undefined,
          snapshot: structuredClone(obj),
          reason,
          createdAt: new Date().toISOString(),
        })
        .then(() => pruneOldVersions(versionsTable, entityType, obj.id))
        .catch(() => {});
    });
  };
  table.hook("updating", function (_modifications, _primKey, obj, transaction) {
    capture(obj, "updated", transaction);
  });
  table.hook("deleting", function (_primKey, obj, transaction) {
    capture(obj, "deleted", transaction);
  });
}
