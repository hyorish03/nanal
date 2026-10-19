// 앱 밖으로 여는 주소들.
// 개인정보 처리방침(Notion 공개 페이지)
export const PRIVACY_URL = 'https://hyorinleee.notion.site/3c3b7bc9ffaa8003a919ce49d8ecb34a';

// 가입 인증 메일의 링크를 누르면 돌아올 앱 주소. Supabase 대시보드의 Redirect URLs에도 넣어 두어야 한다.
export const AUTH_CONFIRMED_URL = 'nanal://auth/confirmed';

// 문의하기(계정 시트·사이드바). App Store Connect의 지원 URL과 같은 곳을 쓴다
export const SUPPORT_EMAIL = 'hyorindev@gmail.com';
export const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[나날] 문의')}`;
