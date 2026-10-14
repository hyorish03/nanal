// 로그인한 사람이 자기 계정을 영구히 지운다. 부른 사람은 사용자 JWT로 확인하고,
// 지우기만 service role(관리자) 클라이언트로 한다. 키는 Edge Functions가 넣어 주는 환경 변수에서만 읽고 남기지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { userClient } from '../_shared/http.ts';
import { handleDeleteAccount } from './logic.ts';

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없습니다');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 오류 메시지는 남기지 않고 종류만 남긴다
function logError(where: string, e: unknown): void {
  console.error(where, e instanceof Error ? e.name : 'unknown');
}

Deno.serve((req) =>
  handleDeleteAccount(req, {
    verifyUser: async (r) => (await userClient(r))?.userId ?? null,
    deleteUser: async (userId) => {
      // 영구 삭제(soft delete 아님). items·days·reflections·templates·monthly_reviews·ai_usage·ai_entitlements는
      // 모두 auth.users를 on delete cascade로 가리켜 함께 지워진다. Storage는 쓰지 않는다.
      const { error } = await adminClient().auth.admin.deleteUser(userId);
      if (error) throw new Error(`계정 지우기 실패: ${error.status ?? ''}`);
    },
    logError,
  })
);
