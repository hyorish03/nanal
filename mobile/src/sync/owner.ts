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
