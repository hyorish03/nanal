import { consumeInitialUrl, parseAuthLink, parseDeepLink, parsePendingAction, resetInitialUrlForTest } from './deepLink';

describe('parseDeepLink', () => {
  it('말로 적기를 연다', () => {
    expect(parseDeepLink('nanal://voice')).toEqual({ action: 'voice' });
    expect(parseDeepLink('nanal://voice/')).toEqual({ action: 'voice' });
  });

  it('오늘 화면을 열고, focus=1이면 입력칸에 포커스한다', () => {
    expect(parseDeepLink('nanal://today')).toEqual({ action: null });
    expect(parseDeepLink('nanal://today?focus=1')).toEqual({ action: 'focus' });
    expect(parseDeepLink('nanal://today?focus=0')).toEqual({ action: null });
  });

  it('모르는 주소와 개발용 빌드 주소는 무시한다', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('https://example.com/voice')).toBeNull();
    expect(parseDeepLink('nanal://settings')).toBeNull();
    expect(parseDeepLink('nanal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081')).toBeNull();
  });
});

describe('parseAuthLink', () => {
  it('인증 메일에서 돌아온 주소', () => {
    expect(parseAuthLink('nanal://auth/confirmed')).toBe('confirmed');
    expect(parseAuthLink('nanal://auth/confirmed#access_token=x&type=signup')).toBe('confirmed');
    expect(parseAuthLink('nanal://auth/confirmed?code=abc')).toBe('confirmed');
  });
  it('만료되거나 이미 쓴 링크', () => {
    expect(parseAuthLink('nanal://auth/confirmed#error=access_denied&error_code=otp_expired')).toBe('failed');
  });
  it('다른 주소는 아니다', () => {
    expect(parseAuthLink(null)).toBeNull();
    expect(parseAuthLink('nanal://today')).toBeNull();
    expect(parseAuthLink('nanal://auth')).toBeNull();
  });
  it('위젯 동작(parseDeepLink)으로는 읽히지 않는다', () => {
    expect(parseDeepLink('nanal://auth/confirmed')).toBeNull();
    expect(parseDeepLink('nanal://auth/confirmed#access_token=x')).toBeNull();
  });
});

describe('consumeInitialUrl', () => {
  it('프로세스당 한 번만 true', () => {
    resetInitialUrlForTest();
    expect(consumeInitialUrl()).toBe(true);
    expect(consumeInitialUrl()).toBe(false);
    expect(consumeInitialUrl()).toBe(false);
  });
});

describe('parsePendingAction', () => {
  const now = 1_760_000_000_000;
  it('컨트롤이 남긴 동작을 읽는다', () => {
    expect(parsePendingAction(`voice|${now - 500}`, now)).toBe('voice');
    expect(parsePendingAction(`focus|${now}`, now)).toBe('focus');
  });

  it('1분이 지났거나 모르는 값은 버린다', () => {
    expect(parsePendingAction(`voice|${now - 61_000}`, now)).toBeNull();
    expect(parsePendingAction('voice', now)).toBeNull();
    expect(parsePendingAction(`settings|${now}`, now)).toBeNull();
    expect(parsePendingAction(null, now)).toBeNull();
  });
});
