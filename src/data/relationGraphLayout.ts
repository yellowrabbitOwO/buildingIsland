import type { ManualPositions } from "../components/common/GraphPrimitives";

const REPULSION = 9000;
const SPRING_LEN = 150;
const SPRING_K = 0.02;
const GRAVITY = 0.015;
const DAMPING = 0.85;

/** 黃金角螺旋：給未定位節點一個決定性（非隨機）初始位置，讓「算一次就存檔」的結果可重現 */
function spiralStart(i: number, cx: number, cy: number) {
  const angle = i * 137.5 * (Math.PI / 180);
  const r = 20 * Math.sqrt(i);
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** 簡易力導向版面：節點互斥＋沿連線的彈簧引力＋微幅置中重力，固定迭代次數跑完；
 * pinned 內的節點位置不變（仍會排斥其他節點，讓新節點自然避開既有佈局）。
 * 供關係圖畫布頁與主世界首頁的唯讀預覽共用 */
export function forceLayout(
  nodeIds: string[],
  edges: { from: string; to: string }[],
  pinned: ManualPositions,
  size: number
): ManualPositions {
  const cx = size / 2;
  const cy = size / 2;
  const state: ManualPositions = {};
  nodeIds.forEach((id, i) => {
    state[id] = pinned[id] ?? spiralStart(i, cx, cy);
  });
  const movable = nodeIds.filter((id) => !pinned[id]);
  if (movable.length === 0) return state;
  const vel: ManualPositions = {};
  nodeIds.forEach((id) => {
    vel[id] = { x: 0, y: 0 };
  });
  const iterations = Math.max(60, Math.min(400, Math.round(20000 / movable.length)));

  for (let it = 0; it < iterations; it++) {
    const force: ManualPositions = {};
    nodeIds.forEach((id) => {
      force[id] = { x: 0, y: 0 };
    });
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i];
        const b = nodeIds[j];
        const dx = state[b].x - state[a].x;
        const dy = state[b].y - state[a].y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        force[a].x -= fx;
        force[a].y -= fy;
        force[b].x += fx;
        force[b].y += fy;
      }
    }
    for (const e of edges) {
      if (!state[e.from] || !state[e.to]) continue;
      const dx = state[e.to].x - state[e.from].x;
      const dy = state[e.to].y - state[e.from].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = SPRING_K * (d - SPRING_LEN);
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      force[e.from].x += fx;
      force[e.from].y += fy;
      force[e.to].x -= fx;
      force[e.to].y -= fy;
    }
    for (const id of movable) {
      force[id].x += (cx - state[id].x) * GRAVITY;
      force[id].y += (cy - state[id].y) * GRAVITY;
    }
    for (const id of movable) {
      vel[id] = { x: (vel[id].x + force[id].x) * DAMPING, y: (vel[id].y + force[id].y) * DAMPING };
      state[id] = { x: state[id].x + vel[id].x, y: state[id].y + vel[id].y };
    }
  }
  return state;
}

const TREE_LEVEL_HEIGHT = 140;
const TREE_NODE_SPACING = 110;

/** 樹狀階層版面：依連線方向（from → to）把節點排成一棵（或多棵，形成森林）由上而下的樹。
 * 一般關係圖不保證是嚴格的樹（可能有環、可能一個節點有多個「父節點」），所以只取每個節點遇到的第一條入邊當作
 * 它在樹裡的父節點，其餘入邊仍會畫成連線但不影響版面；沒有父節點的節點各自成為一棵樹的根（森林），
 * 完全孤立（無邊）的節點也會各自成一個單節點的根。適合血緣／從屬關係這類有明確方向性的資料。 */
export function treeLayout(nodeIds: string[], edges: { from: string; to: string }[], size: number): ManualPositions {
  const idSet = new Set(nodeIds);
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to || hasParent.has(e.to)) continue;
    hasParent.add(e.to);
    if (!children.has(e.from)) children.set(e.from, []);
    children.get(e.from)!.push(e.to);
  }

  const positions: ManualPositions = {};
  const visited = new Set<string>();
  let nextSlot = 0;

  // 遞迴排版，回傳這個子樹在水平方向的中心位置（slot 單位，最後統一乘上間距）；
  // 葉節點直接佔用下一個空位，有子節點的則置中在所有子節點中心的正上方
  function layout(id: string, depth: number): number {
    visited.add(id);
    const kids = (children.get(id) ?? []).filter((k) => !visited.has(k));
    let x: number;
    if (kids.length === 0) {
      x = nextSlot++;
    } else {
      const childXs = kids.map((k) => layout(k, depth + 1));
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    }
    positions[id] = { x: x * TREE_NODE_SPACING, y: depth * TREE_LEVEL_HEIGHT };
    return x;
  }

  const roots = nodeIds.filter((id) => !hasParent.has(id));
  for (const id of roots) if (!visited.has(id)) layout(id, 0);
  for (const id of nodeIds) if (!visited.has(id)) layout(id, 0); // 防呆：理論上不會發生，但避免任何節點漏排

  const xs = Object.values(positions).map((p) => p.x);
  const ys = Object.values(positions).map((p) => p.y);
  const offsetX = size / 2 - (Math.min(...xs, 0) + Math.max(...xs, 0)) / 2;
  const offsetY = size / 2 - Math.max(...ys, 0) / 2;
  const result: ManualPositions = {};
  for (const id of nodeIds) result[id] = { x: positions[id].x + offsetX, y: positions[id].y + offsetY };
  return result;
}

/** treeLayout 的水平方向版本：深度往右延伸而非往下，讓根節點（如分支敘事的起始段落）落在最左邊、
 * 故事沿水平方向展開，適合「段落＋選項連結」這種閱讀方向由左到右的分支敘事畫布。
 * 直接沿用 treeLayout 整套森林建構邏輯，只是把算好的座標 x/y 對調（深度→x，同層手足→y） */
export function treeLayoutHorizontal(nodeIds: string[], edges: { from: string; to: string }[], size: number): ManualPositions {
  const vertical = treeLayout(nodeIds, edges, size);
  const result: ManualPositions = {};
  for (const id of nodeIds) result[id] = { x: vertical[id].y, y: vertical[id].x };
  return result;
}
