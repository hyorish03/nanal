// App Store Connect에 올라간 나날 빌드 중 가장 큰 번호 + 1을 출력한다. CI가 빌드 번호를 정할 때 쓴다.
// 환경: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH(.p8 경로)
import { sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BUNDLE_ID = 'nanal.mengle.zen';
const API = 'https://api.appstoreconnect.apple.com/v1';
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;

function token() {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })}.${b64({
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  const key = readFileSync(ASC_KEY_PATH, 'utf8');
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${signature}`;
}

const headers = { Authorization: `Bearer ${token()}` };
async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} 실패 (${res.status}): ${await res.text()}`);
  return res.json();
}

const apps = await get(`${API}/apps?filter[bundleId]=${BUNDLE_ID}&fields[apps]=bundleId`);
const app = apps.data.find((a) => a.attributes.bundleId === BUNDLE_ID);
if (!app) throw new Error(`${BUNDLE_ID} 앱을 찾지 못했어요`);

// 빌드 번호(version)는 문자열이라 서버 정렬을 믿지 않고 모두 받아 숫자로 비교한다.
let max = 0;
let url = `${API}/builds?filter[app]=${app.id}&fields[builds]=version&limit=200`;
while (url) {
  const page = await get(url);
  for (const b of page.data) max = Math.max(max, Number(b.attributes.version) || 0);
  url = page.links?.next;
}
console.log(max + 1);
