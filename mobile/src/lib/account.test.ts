import { Alert } from 'react-native';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { DELETE_TIMEOUT_MS, DeleteTimeoutError, deleteAccount, withTimeout } from './account';

jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: { signOut: jest.fn(() => Promise.resolve({})) } },
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
