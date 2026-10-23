import { Alert } from 'react-native';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { accountInitial, accountName, accountOf, cleanName, DELETE_TIMEOUT_MS, DeleteTimeoutError, deleteAccount, NAME_MAX, saveAccountName, withTimeout } from './account';

jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: { signOut: jest.fn(() => Promise.resolve({})), updateUser: jest.fn(() => Promise.resolve({ error: null })) } },
}));
jest.mock('../sync/outbox', () => ({ pendingCount: jest.fn() }));
jest.mock('../sync/owner', () => ({ wipeLocalData: jest.fn(() => Promise.resolve()) }));

const invoke = supabase.functions.invoke as jest.Mock;
const signOut = supabase.auth.signOut as jest.Mock;
const db = {} as Db;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  invoke.mockReset();
  signOut.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('withTimeout은 시간 안에 끝나면 그 값을 준다', async () => {
  await expect(withTimeout(Promise.resolve(1), 100)).resolves.toBe(1);
});

test('withTimeout은 시간이 지나면 DeleteTimeoutError로 끝난다', async () => {
  const p = withTimeout(new Promise(() => {}), 100);
  jest.advanceTimersByTime(100);
  await expect(p).rejects.toBeInstanceOf(DeleteTimeoutError);
});

test('삭제 요청에 시간 제한을 건다', async () => {
  invoke.mockResolvedValue({ error: null });
  await deleteAccount(db);
  expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST', timeout: DELETE_TIMEOUT_MS });
  expect(signOut).toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('서버가 답하지 않으면 실패 안내를 띄우고 로그아웃하지 않는다', async () => {
  invoke.mockReturnValue(new Promise(() => {}));
  const p = deleteAccount(db);
  jest.advanceTimersByTime(DELETE_TIMEOUT_MS);
  await p;
  expect(Alert.alert).toHaveBeenCalledWith('계정을 삭제하지 못했어요', '인터넷 연결을 확인한 뒤 다시 해 주세요.');
  expect(signOut).not.toHaveBeenCalled();
});

test('서버 오류면 실패 안내를 띄운다', async () => {
  invoke.mockResolvedValue({ error: new Error('500') });
  await deleteAccount(db);
  expect(Alert.alert).toHaveBeenCalledWith('계정을 삭제하지 못했어요', '잠시 뒤에 다시 해 주세요. 계속 안 되면 문의해 주세요.');
  expect(signOut).not.toHaveBeenCalled();
});

describe('이름', () => {
  test('계정 정보에서 이메일과 이름을 꺼낸다. 빈 이름이나 문자열이 아니면 없는 것', () => {
    expect(accountOf({ email: 'a@b.com', user_metadata: { name: ' 효린 ' } })).toEqual({ email: 'a@b.com', name: '효린' });
    expect(accountOf({ email: 'a@b.com', user_metadata: { name: '  ' } }).name).toBeNull();
    expect(accountOf({ email: 'a@b.com', user_metadata: { name: 3 } }).name).toBeNull();
    expect(accountOf(null)).toEqual({ email: null, name: null });
  });

  test('보이는 이름: 적은 이름, 없으면 이메일 앞부분, 둘 다 없으면 "나"', () => {
    expect(accountName({ email: 'hyorish03@naver.com', name: '효린' })).toBe('효린');
    expect(accountName({ email: 'hyorish03@naver.com', name: null })).toBe('hyorish03');
    expect(accountName({ email: null, name: null })).toBe('나');
  });

  test('아바타 글자는 보이는 이름의 첫 글자(영문은 대문자)', () => {
    expect(accountInitial({ email: 'x@y.com', name: '효린' })).toBe('효');
    expect(accountInitial({ email: 'hyorish03@naver.com', name: null })).toBe('H');
  });

  test('이름 다듬기: 앞뒤 빈칸, 겹친 빈칸, 길이', () => {
    expect(cleanName('  김   효린 ')).toBe('김 효린');
    expect(cleanName('가'.repeat(NAME_MAX + 5))).toHaveLength(NAME_MAX);
  });

  test('이름을 계정에 저장하고, 비우면 지운다. 실패하면 던진다', async () => {
    const update = supabase.auth.updateUser as jest.Mock;
    await saveAccountName(' 효린 ');
    expect(update).toHaveBeenLastCalledWith({ data: { name: '효린' } });
    await saveAccountName('   ');
    expect(update).toHaveBeenLastCalledWith({ data: { name: null } });
    update.mockResolvedValueOnce({ error: new Error('offline') });
    await expect(saveAccountName('x')).rejects.toThrow('offline');
  });
});
