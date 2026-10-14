import type { Db } from '../db/types';

/**
 * 로컬 DB를 처음 로그인한 사용자에게 묶는다. 다른 계정의 기록이 섞여 올라가는 것을 막기 위해서다.
 * 소유자는 sync_state의 'owner' 행(cursor 열에 사용자 id)에 저장한다.
 */
export async function claimOwner(db: Db, userId: string): Promise<'ok' | 'mismatch'> {
  return db.transaction(async (tx) => {
    const row = await tx.getFirstAsync<{ cursor: string }>(
      'SELECT cursor FROM sync_state WHERE table_name = ?',
      ['owner'],
    );
    if (!row) {
      await tx.runAsync('INSERT INTO sync_state (table_name, cursor) VALUES (?, ?)', ['owner', userId]);
      return 'ok';
    }
    return row.cursor === userId ? 'ok' : 'mismatch';
  });
}

// 계정을 지운 뒤 이 기기의 기록을 모두 비운다(할 일·메모·기분·회고·템플릿·월간 돌아보기·언젠가, 보낼 목록, 동기화 위치, 소유자).
// 표 구조는 그대로 두므로 다른 계정으로 로그인하면 빈 노트로 시작한다.
const LOCAL_TABLES = ['items', 'days', 'reflections', 'templates', 'monthly_reviews', 'someday', 'outbox', 'sync_state'] as const;
export async function wipeLocalData(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of LOCAL_TABLES) await tx.runAsync(`DELETE FROM ${t}`, []);
  });
}
