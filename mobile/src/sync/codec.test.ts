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
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:30:00.500Z',
    deleted_at: null,
  });
});
