import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { pendingCount } from '../sync/outbox';
import { wipeLocalData } from '../sync/owner';
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

// 계정 삭제(App Store 규정: 가입을 받으면 앱 안에서 지울 수 있어야 한다). 되돌릴 수 없으니 한 번 묻는다.
// 서버에서 계정과 모든 기록을 지운 뒤 이 기기의 기록도 비우고 로그아웃한다.
export function confirmDeleteAccount(db: Db): void {
  Alert.alert('계정을 삭제할까요?', '모든 기록(할 일, 메모, 기분, 회고)이 서버와 이 기기에서 지워지고 되돌릴 수 없어요.', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: () => void deleteAccount(db) },
  ]);
}

async function deleteAccount(db: Db): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    Alert.alert(
      '계정을 삭제하지 못했어요',
      error instanceof FunctionsFetchError ? '인터넷 연결을 확인한 뒤 다시 해 주세요.' : '잠시 뒤에 다시 해 주세요. 계속 안 되면 문의해 주세요.',
    );
    return;
  }
  await wipeLocalData(db).catch(() => {});
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
