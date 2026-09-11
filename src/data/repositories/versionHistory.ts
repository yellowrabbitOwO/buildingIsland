import { db } from "../db";
import { saveEntry } from "./entry";
import type { ContentVersion, Entry } from "../types";

/** 某個內容記錄的所有版本快照，新到舊排序（見 versionHistory.ts 的 Dexie hook 機制，
 * 這些快照不是任何 repository 的 save/update 函式自己寫的） */
export async function listVersions(entityType: string, entityId: string): Promise<ContentVersion[]> {
  return db.contentVersions.where({ entityType, entityId }).reverse().sortBy("createdAt");
}

/** 復原：多數類型直接把快照整包 put 回原本的表（Dexie put 對不存在的 id 會直接建回來，
 * 「復原一個已被刪除的項目」不用另外寫特殊邏輯）。entries 是唯一的例外——saveEntry() 存檔時
 * 還會同步 syncAllEntryLinkRelations／syncCharacterTimeline 這些衍生資料，直接 put 繞過這些
 * 同步邏輯會讓復原後的關聯／時間線資料跟復原的版本對不上，所以 entries 改呼叫 saveEntry() 走
 * 正常存檔路徑，其餘類型維持通用的 put，不用為了這一個例外把整個復原邏輯都繞成
 * 「每種類型各自一個復原函式」 */
export async function restoreVersion(version: ContentVersion): Promise<void> {
  if (version.entityType === "entries") {
    await saveEntry(version.snapshot as Entry);
  } else {
    await db.table(version.entityType).put(version.snapshot);
  }
}
