import 'jsr:@supabase/functions-js@2.108.2/edge-runtime.d.ts';

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.0.0';
import { pipeline } from 'npm:@supabase/middleware@1';
import { type SupabaseContext, withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1';

import { registerTools, type ToolContext } from './tools/index.ts';

// 나날 MCP 서버(Claude 같은 AI 앱이 사용자의 나날 기록을 읽고 적는 곳). 한 Edge Function으로:
//   withOAuthProtectedResource  OAuth 발견 정보(RFC 9728). 인증 전에 돌아 로그인 안 한 클라이언트도 읽고,
//                               401에 WWW-Authenticate를 붙인다
//   withSupabase                사용자 토큰을 확인하고 그 사용자 권한(RLS)의 클라이언트를 만든다
//   handleMcp                   MCP 전송과 도구(./tools)
// 로그인·동의는 Supabase OAuth 서버가 하고, 동의 화면은 웹(web/oauth/consent)에 있다.

const INSTRUCTIONS = [
  '나날(Nanal) is a Korean bullet-journal app. These tools act as the signed-in user; Row Level Security applies.',
  'A day starts at 04:00 Asia/Seoul time, so before 04:00 "today" is still the previous date.',
  'Day pages hold tasks and notes in the order written. Task status: open (○, to do), doing (◐), done (✓), migrated (›, moved to another day — a copy exists there), dropped (×, decided not to do).',
  'Mood is 1-5: 1 힘듦, 2 가라앉음, 3 보통, 4 괜찮음, 5 좋음. Reflections are short evening journal answers.',
  'Write tools only add lines or change task status; editing text, deleting and moving are done in the app. Keep added lines short, in Korean if the user writes Korean.',
  'Records can include personal feelings; summarize gently and do not diagnose.',
].join(' ');

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
};

function createServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: 'nanal', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  registerTools(server, context);
  return server;
}

// 서버와 도구는 요청 하나에만 그 사용자로 묶인다
function handleMcp(request: Request, ctx: SupabaseContext): Promise<Response> {
  const handler = createMcpHandler(
    () => createServer({ supabase: ctx.supabase, userClaims: ctx.userClaims!, jwtClaims: ctx.jwtClaims! }),
    // 사용자 글이 로그에 남지 않게 오류 이름만 남긴다
    { onerror: (error) => console.error('MCP request failed', error instanceof Error ? error.name : 'unknown') },
  );
  return handler.fetch(request);
}

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user', cors: { headers: CORS_HEADERS } })],
    (request, ctx) => handleMcp(request, ctx),
  ),
);
