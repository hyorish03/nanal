import { assertEquals } from 'jsr:@std/assert@1';
import { type DeleteAccountDeps, handleDeleteAccount } from './logic.ts';

const USER = '11111111-1111-1111-1111-111111111111';

function fakeDeps(over: Partial<DeleteAccountDeps> = {}) {
  const deleted: string[] = [];
  const deps: DeleteAccountDeps = {
    verifyUser: (req) => Promise.resolve(req.headers.get('Authorization') === 'Bearer good' ? USER : null),
    deleteUser: (id) => {
      deleted.push(id);
      return Promise.resolve();
    },
    logError: () => {},
    ...over,
  };
  return { deps, deleted };
}

const post = (headers: Record<string, string> = {}) =>
  new Request('http://local/delete-account', { method: 'POST', headers });

Deno.test('delete-account: POST가 아니면 405', async () => {
  const { deps, deleted } = fakeDeps();
  const res = await handleDeleteAccount(new Request('http://local/delete-account', { method: 'GET' }), deps);
  assertEquals(res.status, 405);
  assertEquals(await res.json(), { error: 'method_not_allowed' });
  assertEquals(deleted, []);
});

Deno.test('delete-account: 로그인 없이 부르면 401, 아무것도 지우지 않는다', async () => {
  const { deps, deleted } = fakeDeps();
  const res = await handleDeleteAccount(post(), deps);
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: 'unauthorized' });
  assertEquals(deleted, []);
});

Deno.test('delete-account: 틀린 토큰이면 401', async () => {
  const { deps, deleted } = fakeDeps();
  const res = await handleDeleteAccount(post({ Authorization: 'Bearer bad' }), deps);
  assertEquals(res.status, 401);
  assertEquals(deleted, []);
});

Deno.test('delete-account: 확인 중 오류가 나도 401(내부 내용은 내보내지 않는다)', async () => {
  const { deps, deleted } = fakeDeps({ verifyUser: () => Promise.reject(new Error('network')) });
  const res = await handleDeleteAccount(post({ Authorization: 'Bearer good' }), deps);
  assertEquals(res.status, 401);
  assertEquals(deleted, []);
});

Deno.test('delete-account: 부른 사람 자신만 지우고 { ok: true }', async () => {
  const { deps, deleted } = fakeDeps();
  const res = await handleDeleteAccount(post({ Authorization: 'Bearer good' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(deleted, [USER]);
});

Deno.test('delete-account: 지우기가 실패하면 500 delete_failed, 자세한 내용 없이', async () => {
  const { deps } = fakeDeps({ deleteUser: () => Promise.reject(new Error('secret internal detail')) });
  const res = await handleDeleteAccount(post({ Authorization: 'Bearer good' }), deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'delete_failed' });
});
