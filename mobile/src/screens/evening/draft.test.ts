import { draftKey, hasAnswer, readDraft, withoutTemplate, writeDraft } from './draft';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}

const broken = {
  getItem: async (): Promise<string | null> => {
    throw new Error('x');
  },
  setItem: async () => {
    throw new Error('x');
  },
  removeItem: async () => {
    throw new Error('x');
  },
};

test('쓰던 답을 날짜별로 남겼다가 다시 읽는다', async () => {
  const store = memoryStore();
  const draft = { template: 'gratitude', answers: { gratitude: { good: '커피' } } };
  await writeDraft(store, '2026-10-06', draft);
  expect(store.data.has(draftKey('2026-10-06'))).toBe(true);
  expect(await readDraft(store, '2026-10-06')).toEqual(draft);
  expect(await readDraft(store, '2026-10-07')).toBeNull();
});

test('적은 글이 없으면 지운다', async () => {
  const store = memoryStore();
  await writeDraft(store, '2026-10-06', { template: 'gratitude', answers: { gratitude: { good: '커피' } } });
  await writeDraft(store, '2026-10-06', { template: 'gratitude', answers: { gratitude: { good: '  ' } } });
  expect(store.data.size).toBe(0);
});

test('남긴 템플릿의 답만 비운다', () => {
  const draft = { template: 'gratitude', answers: { gratitude: { good: '커피' }, free: { body: '메모' } } };
  expect(withoutTemplate(draft, 'gratitude')).toEqual({ template: null, answers: { free: { body: '메모' } } });
});

test('깨진 값이나 저장소 오류에도 멈추지 않는다', async () => {
  const store = memoryStore();
  store.data.set(draftKey('2026-10-06'), '{깨짐');
  expect(await readDraft(store, '2026-10-06')).toBeNull();
  store.data.set(draftKey('2026-10-06'), '{"template":3,"answers":{"a":{"b":1,"c":"글"}}}');
  expect(await readDraft(store, '2026-10-06')).toEqual({ template: null, answers: { a: { c: '글' } } });
  expect(await readDraft(broken, '2026-10-06')).toBeNull();
  await expect(writeDraft(broken, '2026-10-06', { template: null, answers: { a: { b: '글' } } })).resolves.toBeUndefined();
});

test('공백이 아닌 글자가 하나라도 있어야 답이 있다', () => {
  expect(hasAnswer(undefined)).toBe(false);
  expect(hasAnswer({ a: ' \n', b: '' })).toBe(false);
  expect(hasAnswer({ a: ' ', b: '응' })).toBe(true);
});
