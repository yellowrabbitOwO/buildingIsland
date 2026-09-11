import { db, newId, nowISO } from "../db";
import type { TimelineBranch } from "../types";

export async function listBranches(timelineId: string): Promise<TimelineBranch[]> {
  return db.timelineBranches.where({ timelineId }).toArray();
}

export async function getBranch(id: string): Promise<TimelineBranch | undefined> {
  return db.timelineBranches.get(id);
}

export async function nextBranchOrder(timelineId: string, parentBranchId: string | undefined): Promise<number> {
  const siblings = (await listBranches(timelineId)).filter((b) => b.parentBranchId === parentBranchId);
  return siblings.length ? Math.max(...siblings.map((b) => b.order)) + 1 : 0;
}

/** parentBranchId 未提供＝新增一條「獨立平行線」：不從任何分支的特定時間點分岔出來，本身就是
 * 一條獨立的根分支，跟主線一樣從可視範圍最左端開始畫（見 TimelineViewPage.tsx 的 laneStartX）；
 * divergeYear/monthIndex/day 選填，設定後改成從指定日期開始（例如接續另一條世界線的結束點）。
 * endYear/monthIndex/day 選填，設定後線畫到這個日期就停住，不論是否為獨立世界線都可以設定 */
export async function createBranch(
  timelineId: string,
  input: {
    name: string;
    color?: string;
    parentBranchId?: string;
    divergeYear?: number;
    divergeMonthIndex?: number;
    divergeDay?: number;
    endYear?: number;
    endMonthIndex?: number;
    endDay?: number;
  }
): Promise<TimelineBranch> {
  const order = await nextBranchOrder(timelineId, input.parentBranchId);
  const branch: TimelineBranch = {
    id: newId(),
    timelineId,
    name: input.name,
    color: input.color,
    parentBranchId: input.parentBranchId,
    divergeYear: input.divergeYear,
    divergeMonthIndex: input.divergeMonthIndex,
    divergeDay: input.divergeDay,
    endYear: input.endYear,
    endMonthIndex: input.endMonthIndex,
    endDay: input.endDay,
    order,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.timelineBranches.add(branch);
  return branch;
}

export async function updateBranch(
  id: string,
  patch: Partial<
    Pick<
      TimelineBranch,
      "name" | "color" | "parentBranchId" | "divergeYear" | "divergeMonthIndex" | "divergeDay" | "endYear" | "endMonthIndex" | "endDay" | "order"
    >
  >
): Promise<void> {
  await db.timelineBranches.update(id, { ...patch, updatedAt: nowISO() });
}

/** 遞迴找出一條分支的所有子孫分支 id（含自己），純記憶體運算——一個時間線的分支數量不會多到
 * 需要資料庫層級遞迴查詢，一次抓全部分支在 JS 裡建父子關係表最簡單 */
async function collectDescendantBranchIds(timelineId: string, rootId: string): Promise<string[]> {
  const all = await listBranches(timelineId);
  const byParent = new Map<string, TimelineBranch[]>();
  for (const b of all) {
    if (!b.parentBranchId) continue;
    if (!byParent.has(b.parentBranchId)) byParent.set(b.parentBranchId, []);
    byParent.get(b.parentBranchId)!.push(b);
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return result;
}

/** 刪除分支前呼叫，回報會連坐刪除的子孫分支數與事件數，供確認對話框顯示 */
export async function countBranchDeletionImpact(
  timelineId: string,
  branchId: string
): Promise<{ branchCount: number; eventCount: number }> {
  const ids = await collectDescendantBranchIds(timelineId, branchId);
  const eventCounts = await Promise.all(ids.map((id) => db.timelineEvents.where({ branchId: id }).count()));
  return { branchCount: ids.length, eventCount: eventCounts.reduce((a, b) => a + b, 0) };
}

/** 刪除分支：連坐刪除所有子孫分支與其事件（分支是階層結構，沒有故事板車道那種可以「移到未分類」
 * 的平行替代方案）；呼叫端應先用 countBranchDeletionImpact 跳確認對話框 */
export async function deleteBranchCascade(timelineId: string, branchId: string): Promise<void> {
  const ids = await collectDescendantBranchIds(timelineId, branchId);
  await db.transaction("rw", [db.timelineBranches, db.timelineEvents], async () => {
    for (const id of ids) {
      await db.timelineEvents.where({ branchId: id }).delete();
    }
    await db.timelineBranches.bulkDelete(ids);
  });
}
