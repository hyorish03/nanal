import { canAdvance, itemA11yHint, itemA11yLabel, symbolKind } from './symbols';

const task = (status: 'open' | 'doing' | 'done' | 'migrated', priority = false) =>
  ({ kind: 'task' as const, status, priority, text: '보고서' });

test('항목의 기호 종류', () => {
  expect(symbolKind(task('open'))).toBe('open');
  expect(symbolKind(task('doing'))).toBe('doing');
  expect(symbolKind(task('migrated'))).toBe('migrated');
  expect(symbolKind({ kind: 'note', status: null })).toBe('note');
});

test('옮긴 일과 메모는 탭해도 상태가 바뀌지 않는다', () => {
  expect(canAdvance(task('open'))).toBe(true);
  expect(canAdvance(task('done'))).toBe(true);
  expect(canAdvance(task('migrated'))).toBe(false);
  expect(canAdvance({ kind: 'note', status: null })).toBe(false);
});

test('스크린 리더 이름은 글, 상태, 중요 순서', () => {
  expect(itemA11yLabel(task('open', true))).toBe('보고서, 할 일, 중요');
  expect(itemA11yLabel(task('doing'))).toBe('보고서, 진행 중');
  expect(itemA11yLabel(task('done'))).toBe('보고서, 끝낸 일');
  expect(itemA11yLabel({ kind: 'note', status: null, priority: false, text: '비' })).toBe('비, 메모');
});

test('다음 동작은 힌트로 따로 읽는다', () => {
  expect(itemA11yHint(task('open'))).toBe('누르면 진행 중으로 바뀌어요');
  expect(itemA11yHint(task('doing'))).toBe('누르면 끝낸 일로 바뀌어요');
  expect(itemA11yHint(task('done'))).toBe('누르면 다시 할 일로 바뀌어요');
  expect(itemA11yHint(task('migrated'))).toBeUndefined();
  expect(itemA11yHint({ kind: 'note', status: null })).toBeUndefined();
});
