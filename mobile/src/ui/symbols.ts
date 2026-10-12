import type { Item } from '../items/repo';

export type SymbolKind = 'open' | 'doing' | 'done' | 'migrated' | 'note';

type ItemLike = Pick<Item, 'kind' | 'status'>;

export function symbolKind(item: ItemLike): SymbolKind {
  if (item.kind === 'note') return 'note';
  return item.status ?? 'open';
}

// 기호를 탭하면 할 일 → 진행 중 → 끝냄 → 할 일로 돈다(스펙 11.2).
export function canAdvance(item: ItemLike): boolean {
  const k = symbolKind(item);
  return k === 'open' || k === 'doing' || k === 'done';
}

const WORD: Record<SymbolKind, string> = {
  open: '할 일',
  doing: '진행 중',
  done: '끝낸 일',
  migrated: '옮긴 일',
  note: '메모',
};
const HINT: Partial<Record<SymbolKind, string>> = {
  open: '탭하면 진행 중',
  doing: '탭하면 끝냄',
  done: '탭하면 다시 할 일',
};

export function itemA11yLabel(item: ItemLike & Pick<Item, 'priority' | 'text'>): string {
  const k = symbolKind(item);
  const hint = HINT[k];
  return `${item.priority ? '중요, ' : ''}${WORD[k]}, ${item.text}${hint ? `. ${hint}` : ''}`;
}

export type LegendEntry = {
  symbol: SymbolKind | 'highlight' | 'more';
  name: string;
  desc: string;
  kind?: 'task' | 'note'; // 입력 칩에서 고른 종류와 같으면 강조한다
};

export const LEGEND: LegendEntry[] = [
  { symbol: 'open', kind: 'task', name: '할 일', desc: '해야 할 일과 약속. 시간은 글에 함께 적어요(예: 15:00 팀 회의). 탭하면 진행 중' },
  { symbol: 'note', kind: 'note', name: '메모', desc: '생각, 느낌, 기억하고 싶은 것' },
  { symbol: 'doing', name: '진행 중', desc: '하고 있는 일. 탭하면 끝낸 일이 돼요' },
  { symbol: 'done', name: '끝낸 일', desc: '동그라미가 채워지고 줄이 그어져요. 탭하면 다시 할 일로' },
  { symbol: 'highlight', name: '형광펜 = 중요', desc: '⋯를 눌러 칠해요. 하루 3개까지, 위로 올라가요' },
  { symbol: 'migrated', name: '옮긴 일', desc: '다른 날로 옮겨 간 일' },
  { symbol: 'more', name: '더보기', desc: '줄 오른쪽 ⋯에서 형광펜이나 지우기를 골라요' },
];
