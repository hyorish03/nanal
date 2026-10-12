import { fromRemote, toRemote } from './codec';

test('toRemote: 정의된 컬럼만 보내고 answers는 JSON 객체로 바꾼다', () => {
  expect(
    toRemote('reflections', {
      id: 'r1',
      date: '2026-10-06',
      template: 'free',
      answers: '{"body":"hi"}',
      created_at: '2026-10-06T00:00:00.000Z',
      updated_at: '2026-10-06T00:00:00.000Z',
      deleted_at: null,
    }),
  ).toEqual({
    id: 'r1',
    date: '2026-10-06',
    template: 'free',
    answers: { body: 'hi' },
    snapshot: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    deleted_at: null,
  });
});

test('fromRemote: 서버 전용 컬럼을 버리고 시각을 toISOString 형식으로 맞춘다', () => {
  expect(
    fromRemote('reflections', {
      id: 'r1',
      user_id: 'u1',
      date: '2026-10-06',
      template: 'free',
      answers: { body: 'hi' },
      created_at: '2026-10-06T00:00:00+00:00',
      updated_at: '2026-10-06T09:30:00.5+09:00',
      deleted_at: null,
      synced_at: '2026-10-06T00:00:01+00:00',
    }),
  ).toEqual({
    id: 'r1',
    date: '2026-10-06',
    template: 'free',
    answers: '{"body":"hi"}',
    snapshot: null,
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:30:00.500Z',
    deleted_at: null,
  });
});

test('priority는 로컬 0/1 ↔ 서버 boolean', () => {
  const row = { id: 'i', date: '2026-10-07', kind: 'task', text: 'a', status: 'open', priority: 1, migrated_from: null,
    created_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null };
  expect(toRemote('items', row).priority).toBe(true);
  expect(fromRemote('items', { ...toRemote('items', row), priority: false }).priority).toBe(0);
});

test('templates.questions와 reflections.snapshot은 JSON으로 오간다', () => {
  const t = { id: 't', name: '운동한 날', questions: '[{"key":"q1","text":"무슨 운동?"}]',
    created_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null };
  expect(toRemote('templates', t).questions).toEqual([{ key: 'q1', text: '무슨 운동?' }]);
  expect(fromRemote('templates', toRemote('templates', t)).questions).toBe(t.questions);
  const r = fromRemote('reflections', { id: 'r', date: '2026-10-07', template: 't', answers: {}, snapshot: null,
    created_at: '2026-10-07T00:00:00+00:00', updated_at: '2026-10-07T00:00:00+00:00', deleted_at: null });
  expect(r.snapshot).toBeNull();
});

test('monthly_reviews: content는 JSON으로 주고받는다', () => {
  const content = { version: 1, stats: { month: '2026-09' } };
  const local = {
    month: '2026-09', content: JSON.stringify(content), model: 'claude-sonnet-5-5',
    created_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null,
  };
  const remote = toRemote('monthly_reviews', local);
  expect(remote.content).toEqual(content);
  expect(fromRemote('monthly_reviews', remote)).toEqual(local);
});
