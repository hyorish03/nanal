import type { SupabaseClient } from '@supabase/supabase-js';

// AI 정리(organize-voice)를 처음 쓰기 전에 받는 동의(App Review 5.1.2(i)). 계정의 user_metadata에 동의한 때를 남겨
// 다른 기기에서 로그인해도 다시 묻지 않는다. 월간 돌아보기는 화면에서 따로 보내는 것을 보여 주고 버튼으로 받는다.
export const AI_CONSENT_KEY = 'ai_consent_at';

type AuthClient = Pick<SupabaseClient, 'auth'>;

// 세션을 읽지 못하면 동의하지 않은 것으로 본다(묻는 쪽이 안전하다)
export async function hasAiConsent(client: AuthClient): Promise<boolean> {
  try {
    const { data } = await client.auth.getSession();
    return typeof data.session?.user.user_metadata?.[AI_CONSENT_KEY] === 'string';
  } catch {
    return false;
  }
}

// 저장하지 못하면(오프라인 등) 던진다. 그때는 정리도 못 하므로 부르는 쪽이 메모로 남기기를 권한다
export async function giveAiConsent(client: AuthClient, now = new Date()): Promise<void> {
  const { error } = await client.auth.updateUser({ data: { [AI_CONSENT_KEY]: now.toISOString() } });
  if (error) throw error;
}
