import { addDays, formatShortDate } from '../lib/date';

export type OrganizedItem = { kind: 'task' | 'note'; text: string; date: string };
export type DraftItem = OrganizedItem & { id: string; picked: boolean };

export function toDrafts(items: OrganizedItem[]): DraftItem[] {
  return items.map((item, i) => ({ ...item, id: `d${i}`, picked: true }));
}

export function dateLabel(date: string, today: string): string {
  if (date === today) return '';
  if (date === addDays(today, 1)) return '내일';
  return formatShortDate(date);
}
