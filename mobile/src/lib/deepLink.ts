// 위젯·컨트롤이 앱을 여는 주소(스펙 11.6). Hermes의 URL 지원에 기대지 않고 직접 읽는다.
export type LinkAction = 'voice' | 'focus';
export type DeepLink = { action: LinkAction | null };

const PATTERN = /^nanal:\/\/([a-z-]+)\/?(?:\?(.*))?$/;

export function parseDeepLink(url: string | null): DeepLink | null {
  const m = url ? PATTERN.exec(url) : null;
  if (!m) return null;
  const [, host, query = ''] = m;
  if (host === 'voice') return { action: 'voice' };
  if (host === 'today') return { action: query.split('&').includes('focus=1') ? 'focus' : null };
  return null;
}
