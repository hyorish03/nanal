import { reflectionFilters } from './filters';

test('회고에 쓰인 템플릿을 처음 나온 순서로, 개수와 함께 모은다', () => {
  const entries = [
    { template: 'gratitude', templateName: '감사한 날' },
    { template: 'lethargy', templateName: '무기력했던 날' },
    { template: 'gratitude', templateName: '감사한 날' },
  ];
  expect(reflectionFilters(entries)).toEqual([
    { id: 'gratitude', name: '감사한 날', count: 2 },
    { id: 'lethargy', name: '무기력했던 날', count: 1 },
  ]);
});
