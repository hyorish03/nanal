import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRemote } from './supabaseRemote';

function fakeClient() {
  const calls: { table: string; rows: unknown; options: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: unknown, options: unknown) => {
        calls.push({ table, rows, options });
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

test.each([
  ['items', 'id'],
  ['reflections', 'id'],
  ['templates', 'id'],
  ['days', 'user_id,date'],
  ['monthly_reviews', 'user_id,month'],
] as const)('%s는 onConflict %s로 올린다', async (table, onConflict) => {
  const { client, calls } = fakeClient();
  await createSupabaseRemote(client, 'u1').upsert(table, [{ a: 1 }]);
  expect(calls[0].options).toEqual({ onConflict });
  expect(calls[0].rows).toEqual([{ a: 1, user_id: 'u1' }]);
});
