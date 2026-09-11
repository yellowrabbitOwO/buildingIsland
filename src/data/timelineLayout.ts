import type { TimelineBranch } from "./types";

/** 把一棵分支樹（透過 parentBranchId 串起來）分配車道：先序（pre-order）DFS，每條分支第一次
 * 被拜訪時就佔用「目前還沒用過的下一個車道號碼」。DFS 會先遞迴完子孫才換下一個手足，子孫車道
 * 自然緊接在父分支後面，視覺上聚在一起，不用額外記帳。主線（parentBranchId 為 undefined）
 * 永遠是第一個被拜訪的，車道 0。每條分支車道全域唯一，不會跟任何其他分支共用車道——
 * 比只跟「父分支」不重疊更強、也更簡單，不需要追蹤「這個車道用到哪個時間點為止」再回收，
 * 對這個工具的規模（大概幾十條分支）換來的視覺密度效益也不值得那個複雜度 */
export function assignLanes(branches: TimelineBranch[]): Map<string, number> {
  const byParent = new Map<string | undefined, TimelineBranch[]>();
  for (const b of branches) {
    const key = b.parentBranchId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(b);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.order - b.order);

  const lanes = new Map<string, number>();
  const visited = new Set<string>(); // 防呆：資料若有循環父子關係，擋住無限遞迴
  let nextLane = 0;

  function visit(branch: TimelineBranch) {
    if (visited.has(branch.id)) return;
    visited.add(branch.id);
    lanes.set(branch.id, nextLane);
    nextLane += 1;
    for (const child of byParent.get(branch.id) ?? []) visit(child);
  }
  for (const root of byParent.get(undefined) ?? []) visit(root);

  return lanes;
}
