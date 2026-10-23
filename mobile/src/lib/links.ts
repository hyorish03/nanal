import { Alert, Linking } from 'react-native';

// 앱 밖으로 여는 주소들.
// 개인정보 처리방침(Notion 공개 페이지)
export const PRIVACY_URL = 'https://hyorinleee.notion.site/3c3b7bc9ffaa8003a919ce49d8ecb34a';

// 가입 인증 메일의 링크를 누르면 돌아올 앱 주소. Supabase 대시보드의 Redirect URLs에도 넣어 두어야 한다.
export const AUTH_CONFIRMED_URL = 'nanal://auth/confirmed';

// 문의하기(설정). App Store Connect의 지원 URL과 같은 곳을 쓴다
export const SUPPORT_EMAIL = 'hyorindev@gmail.com';
export const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[나날] 문의')}`;

// 앱 밖 주소를 연다. 열 수 없으면(메일 앱이 없는 등) 주소를 보여 준다
async function openOrShow(url: string, fallback: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('열지 못했어요', fallback);
  }
}

export const openPrivacy = () => openOrShow(PRIVACY_URL, PRIVACY_URL);
export const openSupport = () => openOrShow(SUPPORT_URL, `${SUPPORT_EMAIL}로 메일을 보내 주세요`);
