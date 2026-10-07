import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type ErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'quota'
  | 'paid_required'
  | 'not_enough_days'
  | 'ai_busy'
  | 'ai_failed';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  quota: 429,
  paid_required: 402,
  not_enough_days: 422,
  ai_busy: 503,
  ai_failed: 502,
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function fail(code: ErrorCode): Response {
  return json({ error: code }, STATUS[code]);
}

// 호출한 사용자의 JWT로 만든 클라이언트. RLS가 그대로 적용된다(service role을 쓰지 않는다).
export async function userClient(req: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY가 없습니다');
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(auth.slice('Bearer '.length));
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

// 호출 횟수를 하나 쓴다. 한도에 닿았으면 false. monthly는 대상 달(month)이 필요하다.
export async function consumeQuota(client: SupabaseClient, kind: 'voice' | 'monthly', month?: string): Promise<boolean> {
  const { data, error } = await client.rpc('consume_ai_quota', { p_kind: kind, p_month: month ?? null });
  if (error) throw new Error(`호출 횟수 기록 실패: ${error.code ?? ''}`);
  return data === true;
}

// 세지 않고 남은 횟수만 본다.
export async function quotaRemaining(client: SupabaseClient, kind: 'voice' | 'monthly', month?: string): Promise<number> {
  const { data, error } = await client.rpc('ai_quota_remaining', { p_kind: kind, p_month: month ?? null });
  if (error) throw new Error(`호출 횟수 확인 실패: ${error.code ?? ''}`);
  return typeof data === 'number' ? data : 0;
}
