import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import {
  ALREADY_REGISTERED,
  EMAIL_NOT_CONFIRMED,
  isEmailLike,
  isExistingAccount,
  RESEND_UNKNOWN,
  SIGN_IN_UNKNOWN,
  SIGN_UP_UNKNOWN,
  signInErrorMessage,
  signUpErrorMessage,
} from './authErrors';
import { OFFLINE_MESSAGE } from './userError';

describe('isEmailLike', () => {
  it('흔한 주소는 통과하고 앞뒤 빈칸은 봐준다', () => {
    expect(isEmailLike('me@example.com')).toBe(true);
    expect(isEmailLike('  me.you+tag@mail.co.kr ')).toBe(true);
  });
  it('모양이 덜 된 주소는 거른다', () => {
    expect(isEmailLike('')).toBe(false);
    expect(isEmailLike('me')).toBe(false);
    expect(isEmailLike('me@example')).toBe(false);
    expect(isEmailLike('me @example.com')).toBe(false);
    expect(isEmailLike('@example.com')).toBe(false);
  });
});

describe('signInErrorMessage', () => {
  it('비밀번호가 틀리면', () => {
    expect(signInErrorMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(
      '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요',
    );
  });
  it('인증을 아직 안 했으면', () => {
    expect(signInErrorMessage(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'))).toBe(EMAIL_NOT_CONFIRMED);
    expect(signInErrorMessage(new AuthApiError('Email not confirmed', 400, undefined))).toBe(EMAIL_NOT_CONFIRMED);
  });
  it('연결이 없거나 모르는 오류', () => {
    expect(signInErrorMessage(new AuthRetryableFetchError('Network request failed', 0))).toBe(OFFLINE_MESSAGE);
    expect(signInErrorMessage(new AuthApiError('Something', 500, 'unexpected_failure'))).toBe(SIGN_IN_UNKNOWN);
  });
});

describe('signUpErrorMessage', () => {
  it('서버 코드를 한국어로 옮긴다', () => {
    expect(signUpErrorMessage(new AuthApiError('User already registered', 422, 'user_already_exists'))).toBe(ALREADY_REGISTERED);
    expect(signUpErrorMessage(new AuthApiError('Password is weak', 422, 'weak_password'))).toMatch(/너무 쉬워요/);
    expect(signUpErrorMessage(new AuthApiError('Signups not allowed', 422, 'signup_disabled'))).toMatch(/가입을 받을 수 없어요/);
    expect(signUpErrorMessage(new AuthApiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'))).toMatch(
      /너무 자주 보냈어요/,
    );
    expect(signUpErrorMessage(new AuthApiError('Too many', 429, undefined))).toMatch(/너무 자주 보냈어요/);
    expect(signUpErrorMessage(new AuthRetryableFetchError('Network request failed', 0))).toBe(OFFLINE_MESSAGE);
  });
  it('모르는 오류는 영어 대신 기본 문구', () => {
    const e = new AuthApiError('Database error saving new user', 500, 'unexpected_failure');
    expect(signUpErrorMessage(e)).toBe(SIGN_UP_UNKNOWN);
    expect(signUpErrorMessage(e, RESEND_UNKNOWN)).toBe(RESEND_UNKNOWN);
  });
});

describe('isExistingAccount', () => {
  it('identities가 빈 배열이면 이미 있는 계정이다', () => {
    expect(isExistingAccount({ identities: [] })).toBe(true);
  });
  it('새 계정이거나 사용자가 없으면 아니다', () => {
    expect(isExistingAccount({ identities: [{} as never] })).toBe(false);
    expect(isExistingAccount({ identities: undefined })).toBe(false);
    expect(isExistingAccount(null)).toBe(false);
  });
});
