import type { TableName } from './tables';

export type RemoteRow = Record<string, unknown>;

export type PullCursor = { syncedAt: string; key: string | null };

// 운영: supabaseRemote.ts, 테스트: test/fakeRemote.ts
export interface Remote {
  upsert(table: TableName, rows: RemoteRow[]): Promise<void>;
  // (synced_at, key) 순서로 cursor 다음 행을 최대 limit개 돌려준다.
  // key가 null이면 synced_at > cursor.syncedAt, 아니면 synced_at > syncedAt 또는 (synced_at = syncedAt 이고 key > cursor.key).
  // cursor가 null이면 처음부터. 정렬: synced_at 오름차순, 같으면 key 오름차순.
  pullAfter(table: TableName, cursor: PullCursor | null, limit: number): Promise<RemoteRow[]>;
}
