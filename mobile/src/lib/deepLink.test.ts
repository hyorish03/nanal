import { parseDeepLink } from './deepLink';

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
