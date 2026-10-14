import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { pendingCount } from '../sync/outbox';

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
