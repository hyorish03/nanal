import { canAdvance, itemA11yLabel, symbolKind } from './symbols';

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

test('스크린 리더 문구에 중요, 상태, 다음 동작을 담는다', () => {
  expect(itemA11yLabel(task('open', true))).toBe('중요, 할 일, 보고서. 탭하면 진행 중');
  expect(itemA11yLabel(task('doing'))).toBe('진행 중, 보고서. 탭하면 끝냄');
  expect(itemA11yLabel(task('done'))).toBe('끝낸 일, 보고서. 탭하면 다시 할 일');
  expect(itemA11yLabel({ kind: 'note', status: null, priority: false, text: '비' })).toBe('메모, 비');
});
