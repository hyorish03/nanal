import { isAuthRetryableFetchError, type AuthError, type User } from '@supabase/supabase-js';
import { OFFLINE_MESSAGE } from './userError';

// 로그인·가입 화면의 판단과 오류 문구. 서버의 영어 문구는 그대로 보여주지 않는다.

export const MIN_PASSWORD = 8;
export const SIGN_IN_UNKNOWN = '로그인하지 못했어요. 잠시 뒤에 다시 해 주세요';
export const SIGN_UP_UNKNOWN = '가입하지 못했어요. 잠시 뒤에 다시 해 주세요';
export const RESEND_UNKNOWN = '메일을 보내지 못했어요. 잠시 뒤에 다시 해 주세요';
export const ALREADY_REGISTERED = '이미 가입한 이메일이에요. 로그인해 주세요';
export const EMAIL_NOT_CONFIRMED = '아직 이메일 인증을 하지 않았어요. 받은 메일함에서 인증 링크를 눌러 주세요';

// 보내기 전에 거르는 정도의 가벼운 검사. 진짜 확인은 인증 메일이 한다.
export function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function isEmailNotConfirmed(e: AuthError): boolean {
  return e.code === 'email_not_confirmed' || e.message.includes('Email not confirmed');
}

const isRateLimited = (e: AuthError) =>
  e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit' || e.status === 429;

export function signInErrorMessage(e: AuthError): string {
  if (isAuthRetryableFetchError(e)) return OFFLINE_MESSAGE;
  if (e.code === 'invalid_credentials' || e.message.includes('Invalid login credentials')) {
    return '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요';
  }
  if (isEmailNotConfirmed(e)) return EMAIL_NOT_CONFIRMED;
  if (isRateLimited(e)) return '시도가 너무 잦았어요. 잠시 뒤에 다시 해 주세요';
  return SIGN_IN_UNKNOWN;
}

// 가입과 인증 메일 다시 보내기에 같이 쓴다
export function signUpErrorMessage(e: AuthError, fallback = SIGN_UP_UNKNOWN): string {
  if (isAuthRetryableFetchError(e)) return OFFLINE_MESSAGE;
  if (e.code === 'user_already_exists' || e.code === 'email_exists') return ALREADY_REGISTERED;
  if (e.code === 'weak_password') return '비밀번호가 너무 쉬워요. 8자 이상으로 조금 더 길게 해 주세요';
  if (e.code === 'signup_disabled') return '지금은 가입을 받을 수 없어요. 잠시 뒤에 다시 해 주세요';
  if (e.code === 'email_address_invalid') return '이메일 주소를 다시 확인해 주세요';
  if (isRateLimited(e)) return '메일을 너무 자주 보냈어요. 잠시 뒤에 다시 해 주세요';
  return fallback;
}

// 이메일 인증을 켜 두면 Supabase는 이미 있는 이메일로 가입해도 오류 대신 빈 identities를 돌려준다(가입 여부를 숨기려고)
export function isExistingAccount(user: Pick<User, 'identities'> | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
