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

// 컨트롤(iOS 18)이 App Group에 남긴 "동작|시각(ms)". 1분이 지난 것은 버린다(앱이 늦게 열려 엉뚱할 때 뜨지 않게).
export const PENDING_ACTION_KEY = 'pendingAction';
const PENDING_TTL_MS = 60_000;

export function parsePendingAction(raw: string | null | undefined, nowMs: number): LinkAction | null {
  const m = raw ? /^(voice|focus)\|(\d+)$/.exec(raw) : null;
  if (!m) return null;
  const age = nowMs - Number(m[2]);
  return age >= -PENDING_TTL_MS && age <= PENDING_TTL_MS ? (m[1] as LinkAction) : null;
}
