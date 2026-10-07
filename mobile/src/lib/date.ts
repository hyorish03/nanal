export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');

export function logicalDate(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
