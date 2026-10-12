const PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

// Hermes 등 엔진별 Date 파싱 차이를 피하려고 직접 파싱한다. 초 단위까지의 UTC 시각(ms)과 소수부 문자열을 돌려준다.
function parse(value: string): { utcSeconds: number; fraction: string } {
  const match = PATTERN.exec(value);
  if (!match) throw new Error(`알 수 없는 시각 형식: ${value}`);
  const [, year, month, day, hour, minute, second, fraction, zone] = match;

  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2) || '0');
    offsetMinutes = sign * (hh * 60 + mm);
  }

  const utcSeconds =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) -
    offsetMinutes * 60_000;
  return { utcSeconds, fraction: fraction ?? '' };
}

// toISOString() 형식(밀리초)으로 맞춘다.
export function normalizeTimestamp(value: string): string {
  const { utcSeconds, fraction } = parse(value);
  const ms = Number(fraction.substring(0, 3).padEnd(3, '0'));
  return new Date(utcSeconds + ms).toISOString();
}

// UTC 마이크로초 6자리 형식. 이 형식의 문자열은 사전순 비교가 시간순 비교와 같다.
export function sortableTimestamp(value: string): string {
  const { utcSeconds, fraction } = parse(value);
  const micros = fraction.substring(0, 6).padEnd(6, '0');
  return `${new Date(utcSeconds).toISOString().slice(0, 19)}.${micros}Z`;
}
