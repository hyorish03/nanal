const PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

// Hermes 등 엔진별 Date 파싱 차이를 피하려고 직접 파싱해 toISOString() 형식으로 맞춘다.
export function normalizeTimestamp(value: string): string {
  const match = PATTERN.exec(value);
  if (!match) throw new Error(`알 수 없는 시각 형식: ${value}`);
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const ms = Number((fraction ?? '').substring(0, 3).padEnd(3, '0'));

  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2) || '0');
    offsetMinutes = sign * (hh * 60 + mm);
  }

  const utc =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      ms,
    ) -
    offsetMinutes * 60_000;
  return new Date(utc).toISOString();
}
