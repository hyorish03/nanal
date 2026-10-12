import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './remote';
import { TABLES } from './tables';

// PostgREST 필터 값에 '.', ':'가 들어가므로 큰따옴표로 감싸고, 안의 따옴표와 역슬래시는 이스케이프한다.
const quote = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;

export function createSupabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table, rows) {
      const { key } = TABLES[table];
      // 서버에서 id가 아닌 키는 모두 (user_id, 키) 복합 키다.
      const onConflict = key === 'id' ? 'id' : `user_id,${key}`;
      const { error } = await client
        .from(table)
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict });
      if (error) throw new Error(`${table} 업로드 실패: ${error.message}`);
    },
    async pullAfter(table, cursor, limit) {
      const { key } = TABLES[table];
      // RLS가 본인 행만 돌려주지만, 인덱스(user_id, synced_at)를 타도록 조건을 명시한다.
      let query = client.from(table).select('*').eq('user_id', userId);
      if (cursor) {
        const at = quote(cursor.syncedAt);
        query =
          cursor.key === null
            ? query.gt('synced_at', cursor.syncedAt)
            : query.or(`synced_at.gt.${at},and(synced_at.eq.${at},${key}.gt.${quote(cursor.key)})`);
      }
      const { data, error } = await query
        .order('synced_at', { ascending: true })
        .order(key, { ascending: true })
        .limit(limit);
      if (error) throw new Error(`${table} 다운로드 실패: ${error.message}`);
      return data ?? [];
    },
  };
}
