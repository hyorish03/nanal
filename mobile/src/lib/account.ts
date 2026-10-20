import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { pendingCount } from '../sync/outbox';
import { switchOwner, wipeLocalData } from '../sync/owner';
import { reloadWidgets } from '../widget/reload';
import { FunctionsFetchError } from '@supabase/supabase-js';

// 로그인한 계정의 이메일. 세션이 바뀌면(로그아웃 등) 따라 바뀐다
export function useAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user.email ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return email;
}

// 계정 버튼에 넣을 한 글자(이메일 맨 앞 글자)
export function accountInitial(email: string | null): string {
  const c = email?.trim()[0];
  return c ? c.toUpperCase() : '나';
}

// 로그아웃 전에 한 번 묻는다. 아직 서버로 보내지 못한 기록이 있으면 함께 알린다.
// 이 기기에서만 로그아웃한다(기록은 기기에 남고, 같은 계정으로 다시 로그인하면 그대로 이어진다).
export async function confirmSignOut(db: Db): Promise<void> {
  const pending = await pendingCount(db).catch(() => 0);
  const message =
    pending > 0
      ? `다시 로그인하면 기록이 그대로 돌아와요.\n\n아직 서버로 보내지 못한 기록 ${pending}개가 있어요. 인터넷에 연결된 뒤 로그아웃하면 안전해요.`
      : '다시 로그인하면 기록이 그대로 돌아와요.';
  Alert.alert('로그아웃할까요?', message, [
    { text: '취소', style: 'cancel' },
    { text: '로그아웃', style: 'destructive', onPress: () => void supabase.auth.signOut({ scope: 'local' }).catch(() => {}) },
  ]);
}

// 다른 계정의 기록이 있는 기기에서 지금 계정으로 새로 시작할지 묻는다. 서버에 다 올라갔으면 잃는 것이 없다고,
// 아직 못 올린 기록이 있으면 그만큼 사라진다고 알린다. 지운 뒤 onDone(다시 소유자 확인)을 부른다.
export async function confirmStartFresh(db: Db, userId: string, onDone: () => void): Promise<void> {
  const pending = await pendingCount(db).catch(() => 0);
  const message =
    pending > 0
      ? `이전 계정의 기록 중 ${pending}개는 아직 서버에 올리지 못했어요. 지우면 이 기록은 사라져요. 지키려면 먼저 이전 계정으로 로그인해 올려 주세요.`
      : '이전 계정의 기록은 서버에 그대로 있어서, 그 계정으로 다시 로그인하면 돌아와요. 이 기기에서만 지우고 지금 계정으로 새로 시작해요.';
  Alert.alert('이 기기의 기록을 지울까요?', message, [
    { text: '취소', style: 'cancel' },
    {
      text: pending > 0 ? '그래도 지우기' : '지우고 시작',
      style: 'destructive',
      onPress: () =>
        void switchOwner(db, userId).then(
          () => {
            reloadWidgets();
            onDone();
          },
          () => Alert.alert('지우지 못했어요', '잠시 뒤에 다시 해 주세요.'),
        ),
    },
  ]);
}

// 계정 삭제(App Store 규정: 가입을 받으면 앱 안에서 지울 수 있어야 한다). 되돌릴 수 없으니 한 번 묻는다.
// 서버에서 계정과 모든 기록을 지운 뒤 이 기기의 기록도 비우고 로그아웃한다.
export function confirmDeleteAccount(db: Db): void {
  Alert.alert('계정을 삭제할까요?', '모든 기록(할 일, 메모, 기분, 회고)이 서버와 이 기기에서 지워지고 되돌릴 수 없어요.', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => void deleteAccount(db) },
  ]);
}

// 삭제 중인지. 계정 시트·사이드바 어디서 눌렀든 앱 전체를 덮는 "삭제하는 중…"이 이것을 본다
let deleting = false;
const deletingListeners = new Set<(v: boolean) => void>();
function setDeleting(v: boolean) {
  deleting = v;
  deletingListeners.forEach((l) => l(v));
}
export function useDeletingAccount(): boolean {
  const [v, setV] = useState(deleting);
  useEffect(() => {
    deletingListeners.add(setV);
    setV(deleting);
    return () => {
      deletingListeners.delete(setV);
    };
  }, []);
  return v;
}

// 서버가 오래 답하지 않으면 실패로 보고 다시 하게 한다
export const DELETE_TIMEOUT_MS = 20_000;

export class DeleteTimeoutError extends Error {
  constructor() {
    super('delete-account timed out');
    this.name = 'DeleteTimeoutError';
  }
}

// ms 안에 끝나지 않으면 DeleteTimeoutError로 끝낸다(원래 요청은 fetch의 timeout이 끊는다)
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new DeleteTimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function deleteAccount(db: Db): Promise<void> {
  if (deleting) return;
  setDeleting(true);
  try {
    const { error } = await withTimeout(
      supabase.functions.invoke('delete-account', { method: 'POST', timeout: DELETE_TIMEOUT_MS }),
      DELETE_TIMEOUT_MS,
    ).catch((e: unknown) => ({ error: e }));
    if (error) {
      Alert.alert(
        '계정을 삭제하지 못했어요',
        error instanceof FunctionsFetchError || error instanceof DeleteTimeoutError
          ? '인터넷 연결을 확인한 뒤 다시 해 주세요.'
          : '잠시 뒤에 다시 해 주세요. 계속 안 되면 문의해 주세요.',
      );
      return;
    }
    await wipeLocalData(db).catch(() => {});
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  } finally {
    setDeleting(false);
  }
}
