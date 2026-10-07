import type { TableName } from './tables';

export type RemoteRow = Record<string, unknown>;

// 운영: supabaseRemote.ts, 테스트: test/fakeRemote.ts
export interface Remote {
  upsert(table: TableName, rows: RemoteRow[]): Promise<void>;
  // synced_at > since 인 행을 synced_at 오름차순으로 최대 limit개 돌려준다.
  pullSince(table: TableName, since: string, limit: number): Promise<RemoteRow[]>;
}
