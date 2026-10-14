// 계정 지우기(App Store 5.1.1(v)). 바깥(Supabase)에 닿는 일은 deps로 받아 테스트에서 바꿔 끼운다.
import { fail, json } from '../_shared/http.ts';

export type DeleteAccountDeps = {
  // Authorization 헤더의 JWT로 부른 사람을 확인한다. 없거나 틀리면 null.
  verifyUser: (req: Request) => Promise<string | null>;
  // auth.users에서 지운다. 사용자 표는 모두 on delete cascade라 함께 지워진다.
  deleteUser: (userId: string) => Promise<void>;
  logError: (where: string, e: unknown) => void;
};

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  if (req.method !== 'POST') return fail('method_not_allowed');
  let userId: string | null;
  try {
    userId = await deps.verifyUser(req);
  } catch (e) {
    deps.logError('delete-account verify', e);
    return fail('unauthorized');
  }
  if (!userId) return fail('unauthorized');
  try {
    await deps.deleteUser(userId);
    return json({ ok: true });
  } catch (e) {
    deps.logError('delete-account', e);
    return fail('delete_failed');
  }
}
