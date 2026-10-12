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

// 콜드 스타트 주소는 프로세스당 한 번만 처리한다(로그인·로그아웃으로 화면이 다시 마운트돼도 되풀이하지 않는다).
let initialUrlConsumed = false;
export function consumeInitialUrl(): boolean {
  if (initialUrlConsumed) return false;
  initialUrlConsumed = true;
  return true;
}
export function resetInitialUrlForTest() {
  initialUrlConsumed = false;
}
