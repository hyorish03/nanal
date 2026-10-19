import { AI_CONSENT_KEY, giveAiConsent, hasAiConsent } from './consent';

const client = (metadata: Record<string, unknown> | null, updateError: Error | null = null) => {
  const updateUser = jest.fn(async () => ({ data: {}, error: updateError }));
  return {
    updateUser,
    c: {
      auth: {
        getSession: async () => ({ data: { session: metadata ? { user: { user_metadata: metadata } } : null } }),
        updateUser,
      },
    } as never,
  };
};

test('계정에 동의한 때가 있으면 동의한 것', async () => {
  expect(await hasAiConsent(client({ [AI_CONSENT_KEY]: '2026-10-19T00:00:00.000Z' }).c)).toBe(true);
});

test('없거나 세션이 없거나 읽지 못하면 동의하지 않은 것', async () => {
  expect(await hasAiConsent(client({}).c)).toBe(false);
  expect(await hasAiConsent(client(null).c)).toBe(false);
  const broken = { auth: { getSession: async () => Promise.reject(new Error('x')) } } as never;
  expect(await hasAiConsent(broken)).toBe(false);
});

test('동의하면 계정에 그때를 남기고, 저장하지 못하면 던진다', async () => {
  const ok = client({});
  await giveAiConsent(ok.c, new Date('2026-10-19T09:00:00.000Z'));
  expect(ok.updateUser).toHaveBeenCalledWith({ data: { [AI_CONSENT_KEY]: '2026-10-19T09:00:00.000Z' } });
  await expect(giveAiConsent(client({}, new Error('offline')).c)).rejects.toThrow('offline');
});
