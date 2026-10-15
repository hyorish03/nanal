import { planMove, type Placed } from '../lib/position';
import { markDirty } from '../sync/outbox';
import type { Tx } from './types';

// 끌어서 옮긴 순서를 저장한다. 오늘 장(items, 같은 날 안에서)과 언젠가(someday)가 같이 쓴다.
// 자리값이 없는 줄은 맨 뒤로(예전 앱·서버 마이그레이션 전에 만든 줄), 같으면 적은 순서대로
export const POSITION_ORDER = 'position IS NULL, position, created_at, id';

type Table = 'items' | 'someday';

// scope: 옮길 수 있는 범위의 줄들(보이는 순서 그대로). 옮긴 줄 하나만 고치거나, 사이가 좁으면 모두 다시 매긴다
export async function moveInScope(tx: Tx, table: Table, scope: Placed[], id: string, toIndex: number, now: Date): Promise<void> {
  const plan = planMove(scope, id, toIndex);
  if (!plan) return;
  const ts = now.toISOString();
  if (plan.kind === 'one') {
    await tx.runAsync(`UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ?`, [plan.position, ts, id]);
    await markDirty(tx, table, id);
    return;
  }
  for (let i = 0; i < plan.order.length; i++) {
    await tx.runAsync(`UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ?`, [i + 1, ts, plan.order[i]]);
    await markDirty(tx, table, plan.order[i]);
  }
}
