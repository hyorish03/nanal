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
// 다음 상태로 넘기는 메뉴 문구
const ADVANCE: Partial<Record<SymbolKind, { label: string; to: SymbolKind }>> = {
  open: { label: '진행 중으로', to: 'doing' },
  doing: { label: '끝냄으로', to: 'done' },
  done: { label: '다시 할 일로', to: 'open' },
};

export function advanceAction(item: ItemLike): { label: string; to: SymbolKind } | null {
  return ADVANCE[symbolKind(item)] ?? null;
}

const HINT: Partial<Record<SymbolKind, string>> = {
  open: '누르면 진행 중으로 바뀌어요',
  doing: '누르면 끝낸 일로 바뀌어요',
  done: '누르면 다시 할 일로 바뀌어요',
};

// 스크린 리더가 읽는 이름: 글을 먼저, 그다음 상태와 중요("장보기, 할 일, 중요")
export function itemA11yLabel(item: ItemLike & Pick<Item, 'priority' | 'text'>): string {
  return `${item.text}, ${WORD[symbolKind(item)]}${item.priority ? ', 중요' : ''}`;
}

// 눌렀을 때 일어날 일은 이름이 아니라 힌트로 따로 읽는다
export function itemA11yHint(item: ItemLike): string | undefined {
  return HINT[symbolKind(item)];
}

export type LegendEntry = {
  symbol: SymbolKind | 'highlight' | 'more';
  name: string;
  desc: string;
  kind?: 'task' | 'note'; // 입력 칩에서 고른 종류와 같으면 강조한다
};

export const LEGEND: LegendEntry[] = [
  { symbol: 'open', kind: 'task', name: '할 일', desc: '해야 할 일과 약속. 시간은 글에 함께 적어요(예: 15:00 팀 회의). 기호를 누르면 진행 중' },
  { symbol: 'note', kind: 'note', name: '메모', desc: '생각, 느낌, 기억하고 싶은 것' },
  { symbol: 'doing', name: '진행 중', desc: '하고 있는 일. 기호를 누르면 끝낸 일이 돼요' },
  { symbol: 'done', name: '끝낸 일', desc: '동그라미가 채워지고 줄이 그어져요. 기호를 누르면 다시 할 일로' },
  { symbol: 'highlight', name: '형광펜 = 중요', desc: '⋯를 눌러 칠해요. 하루 3개까지, 위로 올라가요' },
  { symbol: 'migrated', name: '옮긴 일', desc: '다른 날로 옮겨 간 일' },
  { symbol: 'more', name: '더보기', desc: '줄 오른쪽 ⋯나 글을 길게 눌러 형광펜, 고치기, 지우기를 골라요' },
];
