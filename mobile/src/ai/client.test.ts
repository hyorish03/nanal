import { FunctionsFetchError, FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';
import { createMonthlyReview, organizeText, ORGANIZE_TIMEOUT_MS, REVIEW_TIMEOUT_MS } from './client';

const fakeClient = (result: { data: unknown; error: unknown }) => {
  const invoke = jest.fn().mockResolvedValue(result);
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
};

const aborted = () => new FunctionsFetchError(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
const failWith = (error: unknown) => fakeClient({ data: null, error }).client;

test('정리와 돌아보기에 시간 제한을 건다', async () => {
  const organize = fakeClient({ data: { items: [] }, error: null });
  await organizeText(organize.client, '빨래', '2026-10-19');
  expect(organize.invoke).toHaveBeenCalledWith('organize-voice', { body: { text: '빨래', today: '2026-10-19' }, timeout: ORGANIZE_TIMEOUT_MS });

  const review = fakeClient({ data: null, error: aborted() });
  await expect(createMonthlyReview(review.client, '2026-09')).rejects.toMatchObject({ code: 'ai_busy' });
  expect(review.invoke).toHaveBeenCalledWith('monthly-review', { body: { month: '2026-09' }, timeout: REVIEW_TIMEOUT_MS });
});

test('시간이 다 돼 끊기면 ai_busy, 서버에 닿지 못하면 offline', async () => {
  await expect(organizeText(failWith(aborted()), 'a', '2026-10-19')).rejects.toMatchObject({ code: 'ai_busy' });
  const network = new FunctionsFetchError(new TypeError('Network request failed'));
  await expect(organizeText(failWith(network), 'a', '2026-10-19')).rejects.toMatchObject({ code: 'offline' });
  await expect(organizeText(failWith(new FunctionsRelayError({})), 'a', '2026-10-19')).rejects.toMatchObject({ code: 'ai_busy' });
});
