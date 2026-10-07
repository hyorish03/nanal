# 하루 기록 앱 MVP 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불렛저널식 할 일(이월 포함)과 기분·템플릿 회고를 기록하는 아이폰용 Expo 앱을, 로컬 우선 저장과 Supabase 동기화로 만든다.

**Architecture:** 모든 읽기/쓰기는 기기 SQLite(`expo-sqlite`)에서 하고, 쓸 때마다 같은 트랜잭션에서 `outbox`에 변경 키를 남긴다. 동기화 엔진이 outbox를 Supabase에 upsert(push)하고, 서버가 찍은 `synced_at` 커서로 변경분을 받아(pull) `updated_at` 기준 last-write-wins로 반영한다. 도메인 로직(날짜, 이월, 동기화)은 순수 TS 모듈로 두고 Node의 `better-sqlite3` 어댑터로 테스트한다.

**Tech Stack:** Expo (blank-typescript), React Native, expo-sqlite, Supabase (Auth, Postgres, RLS, pgTAP), supabase-js, Jest(jest-expo), better-sqlite3(테스트 전용)

**Spec:** `docs/superpowers/specs/2026-10-06-daily-log-app-design.md`

**공통 규칙**
- 모든 커밋 메시지 끝에 빈 줄 다음 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
- 명령은 별도 표기가 없으면 `mobile/` 디렉터리에서 실행한다.
- 스펙과 다른 점 한 가지: `days`는 하루에 한 행이므로 `id` 대신 `date`(서버는 `(user_id, date)`)를 키로 쓴다. 두 기기가 오프라인에서 같은 날의 기분을 입력해도 키 충돌이 생기지 않게 하기 위함이다.

---

## 파일 구조

```
mobile/
  App.tsx                         앱 진입점: DB 열기, 세션 확인, 로그인/메인 분기
  .env.example                    Supabase URL/anon key 예시
  test/setup.ts                   Jest: Node webcrypto 폴리필
  test/sqlite.ts                  Jest: better-sqlite3로 Db 인터페이스 구현
  test/sqlite.test.ts
  test/fakeRemote.ts              Jest: 메모리 Supabase 대역
  src/db/types.ts                 Db, Row, SqlParam 타입
  src/db/schema.ts (+test)        로컬 스키마와 마이그레이션
  src/db/client.ts                expo-sqlite로 DB 열기
  src/lib/date.ts (+test)         logicalDate (새벽 4시 경계)
  src/lib/id.ts (+test)           UUID v4 생성, 난수 바이트
  src/sync/tables.ts              동기화 대상 테이블 정의
  src/sync/outbox.ts (+test)      markDirty, pendingCount
  src/sync/codec.ts (+test)       로컬 행 ↔ 서버 행 변환
  src/sync/remote.ts              Remote 인터페이스
  src/sync/push.ts (+test)
  src/sync/pull.ts (+test)
  src/sync/engine.ts (+test)      push+pull, 동시 실행 방지
  src/sync/supabaseRemote.ts      Remote의 Supabase 구현
  src/sync/useSync.ts             동기화 시점(시작/포그라운드/쓰기 후/30초) 훅
  src/items/repo.ts (+test)       불렛 항목과 이월
  src/days/repo.ts (+test)        기분
  src/reflections/templates.ts    템플릿 질문 상수
  src/reflections/repo.ts (+test)
  src/stats/recordedDays.ts (+test)
  src/supabase.ts                 Supabase 클라이언트(세션 암호화 저장)
  src/screens/LoginScreen.tsx
  src/screens/Main.tsx            동기화 상태 표시, 화면 전환
  src/screens/TodayScreen.tsx
  src/screens/EveningScreen.tsx
supabase/
  migrations/20261006000000_init.sql
  tests/rls.test.sql
```

---

### Task 1: Expo 프로젝트와 테스트 환경

**Files:**
- Create: `mobile/` (create-expo-app), `mobile/test/setup.ts`, `mobile/test/sqlite.ts`, `mobile/test/sqlite.test.ts`, `mobile/src/db/types.ts`, `mobile/.env.example`
- Modify: `mobile/package.json`, `mobile/.gitignore`

- [ ] **Step 1: 프로젝트 생성 (저장소 루트에서)**

```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install expo-sqlite expo-secure-store @react-native-async-storage/async-storage react-native-get-random-values react-native-url-polyfill react-native-safe-area-context @supabase/supabase-js
npm install aes-js
npm install --save-dev @types/aes-js better-sqlite3 @types/better-sqlite3
npx expo install jest-expo jest @types/jest -- --save-dev
```

- [ ] **Step 2: package.json에 테스트 설정 추가**

`mobile/package.json`의 `scripts`에 다음 두 줄을 추가하고, 최상위에 `jest` 키를 추가한다.

```json
"test": "jest",
"typecheck": "tsc --noEmit"
```

```json
"jest": {
  "preset": "jest-expo",
  "testEnvironment": "node",
  "setupFiles": ["<rootDir>/test/setup.ts"]
}
```

- [ ] **Step 3: `.gitignore`에 `.env` 추가, `.env.example` 작성**

`mobile/.gitignore` 끝에 추가:

```
.env
```

`mobile/.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

- [ ] **Step 4: Db 타입 작성**

`mobile/src/db/types.ts`:

```ts
export type SqlParam = string | number | null;
export type Row = Record<string, SqlParam>;

// expo-sqlite의 SQLiteDatabase가 이 형태를 그대로 만족한다. 테스트는 better-sqlite3로 같은 형태를 구현한다.
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlParam[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
```

- [ ] **Step 5: 테스트 셋업과 어댑터 작성**

`mobile/test/setup.ts`:

```ts
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
```

`mobile/test/sqlite.ts`:

```ts
import Database from 'better-sqlite3';
import type { Db, SqlParam } from '../src/db/types';

export function openTestDb(): Db {
  const raw = new Database(':memory:');
  return {
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: SqlParam[]) {
      const result = raw.prepare(sql).run(params);
      return { changes: result.changes };
    },
    async getAllAsync<T>(sql: string, params: SqlParam[]) {
      return raw.prepare(sql).all(params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlParam[]) {
      return (raw.prepare(sql).get(params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
```

- [ ] **Step 6: 어댑터 테스트 작성**

`mobile/test/sqlite.test.ts`:

```ts
import { openTestDb } from './sqlite';

test('조회, 삽입, 트랜잭션 롤백이 동작한다', async () => {
  const db = openTestDb();
  await db.execAsync('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
  await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);

  await expect(
    db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');

  expect(await db.getAllAsync('SELECT id FROM t', [])).toEqual([{ id: 'a' }]);
  expect(await db.getFirstAsync('SELECT id FROM t WHERE id = ?', ['zzz'])).toBeNull();
});
```

- [ ] **Step 7: 실행해서 통과 확인**

Run: `npm test`
Expected: `Tests: 1 passed`

- [ ] **Step 8: 커밋 (저장소 루트에서)**

```bash
git add mobile
git commit -m "chore: Expo 앱과 Jest/SQLite 테스트 환경 구성"
```

---

### Task 2: logicalDate (새벽 4시 경계)

**Files:**
- Create: `mobile/src/lib/date.ts`
- Test: `mobile/src/lib/date.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/lib/date.test.ts`:

```ts
import { logicalDate } from './date';

// new Date(y, m, d, h, min)은 기기 로컬 시간대 기준이므로 테스트가 시간대에 의존하지 않는다.
test('04:00부터는 그날이다', () => {
  expect(logicalDate(new Date(2026, 9, 6, 4, 0))).toBe('2026-10-06');
  expect(logicalDate(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
});

test('00:00~03:59는 전날이다', () => {
  expect(logicalDate(new Date(2026, 9, 6, 0, 0))).toBe('2026-10-05');
  expect(logicalDate(new Date(2026, 9, 6, 3, 59))).toBe('2026-10-05');
});

test('월과 연도 경계를 넘어간다', () => {
  expect(logicalDate(new Date(2026, 10, 1, 2, 0))).toBe('2026-10-31');
  expect(logicalDate(new Date(2027, 0, 1, 1, 0))).toBe('2026-12-31');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/lib/date.test.ts`
Expected: FAIL, `Cannot find module './date'`

- [ ] **Step 3: 구현**

`mobile/src/lib/date.ts`:

```ts
export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, '0');

export function logicalDate(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/lib/date.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/lib
git commit -m "feat: 새벽 4시 경계의 logicalDate 추가"
```

---

### Task 3: ID 생성

**Files:**
- Create: `mobile/src/lib/id.ts`
- Test: `mobile/src/lib/id.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/lib/id.test.ts`:

```ts
import { newId, randomBytes } from './id';

test('newId는 UUID v4 형식이다', () => {
  expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('newId는 겹치지 않는다', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
});

test('randomBytes는 요청한 길이를 돌려준다', () => {
  expect(randomBytes(32)).toHaveLength(32);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/lib/id.test.ts`
Expected: FAIL, `Cannot find module './id'`

- [ ] **Step 3: 구현**

`mobile/src/lib/id.ts`:

```ts
// 앱에서는 App.tsx 첫 줄의 react-native-get-random-values가, 테스트에서는 Node webcrypto가 제공한다.
type CryptoLike = { getRandomValues(array: Uint8Array): Uint8Array };

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  (globalThis as unknown as { crypto: CryptoLike }).crypto.getRandomValues(bytes);
  return bytes;
}

export function newId(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/lib/id.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/lib
git commit -m "feat: 기기에서 생성하는 UUID v4 추가"
```

---

### Task 4: 로컬 스키마와 마이그레이션

**Files:**
- Create: `mobile/src/db/schema.ts`
- Test: `mobile/src/db/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/db/schema.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from './schema';

const TS = '2026-10-06T00:00:00.000Z';

test('테이블을 만들고 두 번 실행해도 안전하다', async () => {
  const db = openTestDb();
  await migrate(db);
  await migrate(db);
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    [],
  );
  expect(tables.map((t) => t.name)).toEqual(['days', 'items', 'outbox', 'reflections', 'sync_state']);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
});

test('task는 status가 필요하고, 그 외 종류는 status가 없어야 한다', async () => {
  const db = openTestDb();
  await migrate(db);
  const insert = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, 'x', status, TS, TS],
    );
  await expect(insert('a', 'task', null)).rejects.toThrow();
  await expect(insert('b', 'note', 'open')).rejects.toThrow();
  await expect(insert('c', 'task', 'open')).resolves.toBeDefined();
  await expect(insert('d', 'note', null)).resolves.toBeDefined();
});

test('빈 내용과 범위 밖 기분은 거부한다', async () => {
  const db = openTestDb();
  await migrate(db);
  await expect(
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['a', '2026-10-06', 'note', '   ', null, TS, TS],
    ),
  ).rejects.toThrow();
  await expect(
    db.runAsync('INSERT INTO days (date, mood, updated_at) VALUES (?, ?, ?)', ['2026-10-06', 6, TS]),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/db/schema.test.ts`
Expected: FAIL, `Cannot find module './schema'`

- [ ] **Step 3: 구현**

`mobile/src/db/schema.ts`:

```ts
import type { Db } from './types';

// 배열 순서가 곧 버전이다. 이미 배포한 항목은 수정하지 말고 새 항목을 뒤에 추가한다.
const MIGRATIONS = [
  `
  CREATE TABLE items (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('task', 'event', 'note')),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    status TEXT CHECK (status IN ('open', 'done', 'migrated', 'dropped')),
    migrated_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK ((kind = 'task') = (status IS NOT NULL))
  );
  CREATE INDEX items_date ON items (date);
  CREATE TABLE days (
    date TEXT PRIMARY KEY NOT NULL,
    mood INTEGER CHECK (mood BETWEEN 1 AND 5),
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE reflections (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    template TEXT NOT NULL CHECK (template IN ('perfectionism', 'lethargy', 'gratitude', 'free')),
    answers TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX reflections_date ON reflections (date);
  CREATE TABLE outbox (
    table_name TEXT NOT NULL,
    row_key TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (table_name, row_key)
  );
  CREATE TABLE sync_state (
    table_name TEXT PRIMARY KEY NOT NULL,
    cursor TEXT NOT NULL
  );
  `,
];

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/db/schema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/db
git commit -m "feat: 로컬 SQLite 스키마와 마이그레이션 추가"
```

---

### Task 5: 동기화 테이블 정의와 outbox

**Files:**
- Create: `mobile/src/sync/tables.ts`, `mobile/src/sync/outbox.ts`
- Test: `mobile/src/sync/outbox.test.ts`

- [ ] **Step 1: 테이블 정의 작성**

`mobile/src/sync/tables.ts`:

```ts
export const TABLES = {
  items: {
    key: 'id',
    columns: ['id', 'date', 'kind', 'text', 'status', 'migrated_from', 'created_at', 'updated_at', 'deleted_at'],
  },
  days: {
    key: 'date',
    columns: ['date', 'mood', 'updated_at', 'deleted_at'],
  },
  reflections: {
    key: 'id',
    columns: ['id', 'date', 'template', 'answers', 'created_at', 'updated_at', 'deleted_at'],
  },
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
```

- [ ] **Step 2: 실패하는 테스트 작성**

`mobile/src/sync/outbox.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { markDirty, pendingCount } from './outbox';

test('같은 행을 여러 번 표시하면 한 줄로 합쳐지고 version이 오른다', async () => {
  const db = openTestDb();
  await migrate(db);
  await markDirty(db, 'items', 'a');
  await markDirty(db, 'items', 'a');
  await markDirty(db, 'days', '2026-10-06');
  expect(await pendingCount(db)).toBe(2);
  expect(
    await db.getFirstAsync('SELECT version FROM outbox WHERE table_name = ? AND row_key = ?', ['items', 'a']),
  ).toEqual({ version: 2 });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- src/sync/outbox.test.ts`
Expected: FAIL, `Cannot find module './outbox'`

- [ ] **Step 4: 구현**

`mobile/src/sync/outbox.ts`:

```ts
import type { Db } from '../db/types';
import type { TableName } from './tables';

// 반드시 행을 바꾼 것과 같은 트랜잭션 안에서 호출한다.
export async function markDirty(db: Db, table: TableName, key: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox (table_name, row_key) VALUES (?, ?)
     ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1`,
    [table, key],
  );
}

export async function pendingCount(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox', []);
  return row?.n ?? 0;
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- src/sync/outbox.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/sync
git commit -m "feat: 동기화 대상 테이블 정의와 outbox 추가"
```

---

### Task 6: 불렛 항목과 이월

**Files:**
- Create: `mobile/src/items/repo.ts`
- Test: `mobile/src/items/repo.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/items/repo.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import {
  addItem,
  deleteItem,
  dropItem,
  listItemsForDate,
  listMigrationCandidates,
  migrateToToday,
  toggleDone,
} from './repo';

const MON = new Date(2026, 9, 5, 9, 0); // 2026-10-05
const TUE = new Date(2026, 9, 6, 9, 0); // 2026-10-06

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const outboxKeys = async () =>
  (await db.getAllAsync<{ row_key: string }>("SELECT row_key FROM outbox WHERE table_name = 'items'", [])).map(
    (r) => r.row_key,
  );

test('addItem: 할 일은 open으로 논리 날짜에 저장되고 outbox에 오른다', async () => {
  const item = await addItem(db, { kind: 'task', text: '  보고서 쓰기 ' }, MON);
  expect(item).toMatchObject({ date: '2026-10-05', kind: 'task', text: '보고서 쓰기', status: 'open' });
  expect(await listItemsForDate(db, '2026-10-05')).toHaveLength(1);
  expect(await outboxKeys()).toEqual([item.id]);
});

test('addItem: 메모와 일정은 status가 없다', async () => {
  const note = await addItem(db, { kind: 'note', text: '생각' }, MON);
  expect(note.status).toBeNull();
});

test('addItem: 새벽 3시 입력은 전날로 저장된다', async () => {
  const item = await addItem(db, { kind: 'note', text: '늦은 생각' }, new Date(2026, 9, 6, 3, 0));
  expect(item.date).toBe('2026-10-05');
});

test('addItem: 빈 내용은 거부한다', async () => {
  await expect(addItem(db, { kind: 'task', text: '   ' }, MON)).rejects.toThrow('내용을 입력하세요');
});

test('toggleDone: open과 done을 오간다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await toggleDone(db, item.id, MON);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('done');
  await toggleDone(db, item.id, MON);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('open');
});

test('migrateToToday: 원래 항목은 migrated, 오늘 날짜로 연결된 새 할 일이 생긴다', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  const created = await migrateToToday(db, old.id, TUE);

  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
  expect(created).toMatchObject({ date: '2026-10-06', text: '운동', status: 'open', migrated_from: old.id });
  expect(created.id).not.toBe(old.id);
  expect((await outboxKeys()).sort()).toEqual([old.id, created.id].sort());
});

test('migrateToToday: 열린 할 일이 아니면 거부한다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await toggleDone(db, item.id, MON);
  await expect(migrateToToday(db, item.id, TUE)).rejects.toThrow('열린 할 일만');
});

test('dropItem: 할 일을 dropped로 바꾼다', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  await dropItem(db, item.id, TUE);
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('dropped');
});

test('listMigrationCandidates: 오늘 이전의 열린 할 일만, 삭제된 것은 빼고 돌려준다', async () => {
  const open = await addItem(db, { kind: 'task', text: 'open' }, MON);
  const done = await addItem(db, { kind: 'task', text: 'done' }, MON);
  await toggleDone(db, done.id, MON);
  const deleted = await addItem(db, { kind: 'task', text: 'deleted' }, MON);
  await deleteItem(db, deleted.id, MON);
  await addItem(db, { kind: 'note', text: 'note' }, MON);
  await addItem(db, { kind: 'task', text: 'today' }, TUE);

  const candidates = await listMigrationCandidates(db, '2026-10-06');
  expect(candidates.map((c) => c.id)).toEqual([open.id]);
});

test('deleteItem: 행은 남기고 deleted_at만 찍으며 목록에서 빠진다', async () => {
  const item = await addItem(db, { kind: 'note', text: 'a' }, MON);
  await db.runAsync('DELETE FROM outbox', []);
  await deleteItem(db, item.id, TUE);
  expect(await listItemsForDate(db, '2026-10-05')).toHaveLength(0);
  expect(await db.getFirstAsync('SELECT deleted_at FROM items WHERE id = ?', [item.id])).toEqual({
    deleted_at: TUE.toISOString(),
  });
  expect(await outboxKeys()).toEqual([item.id]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/items/repo.test.ts`
Expected: FAIL, `Cannot find module './repo'`

- [ ] **Step 3: 구현**

`mobile/src/items/repo.ts`:

```ts
import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

export type ItemKind = 'task' | 'event' | 'note';
export type TaskStatus = 'open' | 'done' | 'migrated' | 'dropped';

export type Item = {
  id: string;
  date: string;
  kind: ItemKind;
  text: string;
  status: TaskStatus | null;
  migrated_from: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = 'id, date, kind, text, status, migrated_from, created_at, updated_at, deleted_at';

async function insertItem(db: Db, item: Item): Promise<void> {
  await db.runAsync(`INSERT INTO items (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id,
    item.date,
    item.kind,
    item.text,
    item.status,
    item.migrated_from,
    item.created_at,
    item.updated_at,
    item.deleted_at,
  ]);
  await markDirty(db, 'items', item.id);
}

async function requireItem(db: Db, id: string): Promise<Item> {
  const item = await db.getFirstAsync<Item>(`SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!item) throw new Error(`항목을 찾을 수 없습니다: ${id}`);
  return item;
}

async function updateStatus(db: Db, id: string, status: TaskStatus, now: Date): Promise<void> {
  await db.runAsync('UPDATE items SET status = ?, updated_at = ? WHERE id = ?', [status, now.toISOString(), id]);
  await markDirty(db, 'items', id);
}

export async function addItem(db: Db, input: { kind: ItemKind; text: string }, now = new Date()): Promise<Item> {
  const text = input.text.trim();
  if (!text) throw new Error('내용을 입력하세요');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(),
    date: logicalDate(now),
    kind: input.kind,
    text,
    status: input.kind === 'task' ? 'open' : null,
    migrated_from: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.withTransactionAsync(() => insertItem(db, item));
  return item;
}

export async function toggleDone(db: Db, id: string, now = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open' && item.status !== 'done') throw new Error('완료 처리할 수 없는 항목입니다');
    await updateStatus(db, id, item.status === 'open' ? 'done' : 'open', now);
  });
}

export async function dropItem(db: Db, id: string, now = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open') throw new Error('열린 할 일만 버릴 수 있습니다');
    await updateStatus(db, id, 'dropped', now);
  });
}

export async function migrateToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  const ts = now.toISOString();
  const newItemId = newId();
  await db.withTransactionAsync(async () => {
    const item = await requireItem(db, id);
    if (item.status !== 'open') throw new Error('열린 할 일만 옮길 수 있습니다');
    await updateStatus(db, id, 'migrated', now);
    await insertItem(db, {
      ...item,
      id: newItemId,
      date: logicalDate(now),
      status: 'open',
      migrated_from: item.id,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    });
  });
  return requireItem(db, newItemId);
}

export async function deleteItem(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.withTransactionAsync(async () => {
    await requireItem(db, id);
    await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(db, 'items', id);
  });
}

export function listItemsForDate(db: Db, date: string): Promise<Item[]> {
  return db.getAllAsync<Item>(
    `SELECT ${COLUMNS} FROM items WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
}

export function listMigrationCandidates(db: Db, today: string): Promise<Item[]> {
  return db.getAllAsync<Item>(
    `SELECT ${COLUMNS} FROM items
     WHERE kind = 'task' AND status = 'open' AND date < ? AND deleted_at IS NULL
     ORDER BY date, created_at`,
    [today],
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/items/repo.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/items
git commit -m "feat: 불렛 항목 저장과 이월(migration) 로직 추가"
```

---

### Task 7: 기분 기록

**Files:**
- Create: `mobile/src/days/repo.ts`
- Test: `mobile/src/days/repo.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/days/repo.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { getMood, setMood } from './repo';

const NOW = new Date(2026, 9, 6, 22, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기분을 저장하고 다시 고치면 덮어쓴다', async () => {
  await setMood(db, '2026-10-06', 3, NOW);
  await setMood(db, '2026-10-06', 5, NOW);
  expect(await getMood(db, '2026-10-06')).toBe(5);
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'days'", [])).toEqual([
    { row_key: '2026-10-06' },
  ]);
});

test('null로 기분을 지울 수 있다', async () => {
  await setMood(db, '2026-10-06', 3, NOW);
  await setMood(db, '2026-10-06', null, NOW);
  expect(await getMood(db, '2026-10-06')).toBeNull();
});

test('1~5 정수가 아니면 거부한다', async () => {
  await expect(setMood(db, '2026-10-06', 0, NOW)).rejects.toThrow('1~5');
  await expect(setMood(db, '2026-10-06', 2.5, NOW)).rejects.toThrow('1~5');
});

test('기록이 없는 날은 null', async () => {
  expect(await getMood(db, '2026-10-01')).toBeNull();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/days/repo.test.ts`
Expected: FAIL, `Cannot find module './repo'`

- [ ] **Step 3: 구현**

`mobile/src/days/repo.ts`:

```ts
import type { Db } from '../db/types';
import { markDirty } from '../sync/outbox';

export async function setMood(db: Db, date: string, mood: number | null, now = new Date()): Promise<void> {
  if (mood !== null && !(Number.isInteger(mood) && mood >= 1 && mood <= 5)) {
    throw new Error('기분은 1~5 사이 정수여야 합니다');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO days (date, mood, updated_at, deleted_at) VALUES (?, ?, ?, NULL)
       ON CONFLICT (date) DO UPDATE SET mood = excluded.mood, updated_at = excluded.updated_at, deleted_at = NULL`,
      [date, mood, now.toISOString()],
    );
    await markDirty(db, 'days', date);
  });
}

export async function getMood(db: Db, date: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ mood: number | null }>(
    'SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL',
    [date],
  );
  return row?.mood ?? null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/days/repo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/days
git commit -m "feat: 하루 기분 기록 추가"
```

---

### Task 8: 템플릿 회고

**Files:**
- Create: `mobile/src/reflections/templates.ts`, `mobile/src/reflections/repo.ts`
- Test: `mobile/src/reflections/repo.test.ts`

- [ ] **Step 1: 템플릿 상수 작성**

`mobile/src/reflections/templates.ts`:

```ts
export const TEMPLATES = {
  perfectionism: {
    label: '완벽주의가 올라온 날',
    questions: [
      { key: 'want', text: '무엇을 완벽하게 하고 싶었나요?' },
      { key: 'reframe', text: '"지금 완벽주의 반응이 올라온 것뿐"이라고 보면 무엇이 달라지나요?' },
    ],
  },
  lethargy: {
    label: '무기력했던 날',
    questions: [
      { key: 'cause', text: '무기력의 원인으로 짐작되는 것은?' },
      { key: 'recovery', text: '오늘을 회복의 시간으로 본다면 무엇을 채웠나요?' },
    ],
  },
  gratitude: {
    label: '감사한 날',
    questions: [{ key: 'good', text: '오늘 좋았던 일 3가지와 그 이유' }],
  },
  free: {
    label: '자유 일지',
    questions: [{ key: 'body', text: '자유롭게 쓰기' }],
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
```

- [ ] **Step 2: 실패하는 테스트 작성**

`mobile/src/reflections/repo.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addReflection, listReflections } from './repo';

const NOW = new Date(2026, 9, 6, 23, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('답변을 정리해 저장하고 다시 읽는다', async () => {
  const saved = await addReflection(
    db,
    { template: 'lethargy', answers: { cause: ' 잠 부족 ', recovery: '', unknown: '무시됨' } },
    NOW,
  );
  expect(saved).toMatchObject({ date: '2026-10-06', template: 'lethargy', answers: { cause: '잠 부족' } });

  const list = await listReflections(db, '2026-10-06');
  expect(list).toHaveLength(1);
  expect(list[0].answers).toEqual({ cause: '잠 부족' });
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([
    { row_key: saved.id },
  ]);
});

test('모든 답변이 비어 있으면 거부한다', async () => {
  await expect(addReflection(db, { template: 'gratitude', answers: { good: '  ' } }, NOW)).rejects.toThrow(
    '하나 이상',
  );
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- src/reflections/repo.test.ts`
Expected: FAIL, `Cannot find module './repo'`

- [ ] **Step 4: 구현**

`mobile/src/reflections/repo.ts`:

```ts
import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { TEMPLATES, type TemplateKey } from './templates';

export type Reflection = {
  id: string;
  date: string;
  template: TemplateKey;
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ReflectionRow = Omit<Reflection, 'answers'> & { answers: string };

export async function addReflection(
  db: Db,
  input: { template: TemplateKey; answers: Record<string, string> },
  now = new Date(),
): Promise<Reflection> {
  const answers: Record<string, string> = {};
  for (const q of TEMPLATES[input.template].questions) {
    const value = (input.answers[q.key] ?? '').trim();
    if (value) answers[q.key] = value;
  }
  if (Object.keys(answers).length === 0) throw new Error('답변을 하나 이상 입력하세요');

  const ts = now.toISOString();
  const reflection: Reflection = {
    id: newId(),
    date: logicalDate(now),
    template: input.template,
    answers,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO reflections (id, date, template, answers, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [reflection.id, reflection.date, reflection.template, JSON.stringify(answers), ts, ts],
    );
    await markDirty(db, 'reflections', reflection.id);
  });
  return reflection;
}

export async function listReflections(db: Db, date: string): Promise<Reflection[]> {
  const rows = await db.getAllAsync<ReflectionRow>(
    `SELECT id, date, template, answers, created_at, updated_at, deleted_at
     FROM reflections WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
  return rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) as Record<string, string> }));
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- src/reflections/repo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/reflections
git commit -m "feat: 상황별 템플릿 회고 추가"
```

---

### Task 9: 기록한 날 수

**Files:**
- Create: `mobile/src/stats/recordedDays.ts`
- Test: `mobile/src/stats/recordedDays.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/stats/recordedDays.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import { addItem, deleteItem } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { countRecordedDays } from './recordedDays';

test('항목, 기분, 회고 중 하나라도 있는 날을 한 번씩 센다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 1, 9));
  await addItem(db, { kind: 'note', text: 'b' }, new Date(2026, 9, 1, 10));
  await setMood(db, '2026-10-02', 4);
  await addReflection(db, { template: 'free', answers: { body: 'c' } }, new Date(2026, 9, 3, 22));
  await setMood(db, '2026-10-04', null);
  const removed = await addItem(db, { kind: 'note', text: 'd' }, new Date(2026, 9, 5, 9));
  await deleteItem(db, removed.id);

  expect(await countRecordedDays(db)).toBe(3);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/stats/recordedDays.test.ts`
Expected: FAIL, `Cannot find module './recordedDays'`

- [ ] **Step 3: 구현**

`mobile/src/stats/recordedDays.ts`:

```ts
import type { Db } from '../db/types';

// 스트릭 대신 줄어들지 않는 누적 일수를 보여준다(스펙 4절).
export async function countRecordedDays(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT date FROM items WHERE deleted_at IS NULL
       UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
       UNION SELECT date FROM reflections WHERE deleted_at IS NULL
     )`,
    [],
  );
  return row?.n ?? 0;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/stats/recordedDays.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/stats
git commit -m "feat: 기록한 날 누적 수 추가"
```

---

### Task 10: 로컬 ↔ 서버 행 변환

**Files:**
- Create: `mobile/src/sync/codec.ts`, `mobile/src/sync/remote.ts`
- Test: `mobile/src/sync/codec.test.ts`

- [ ] **Step 1: Remote 인터페이스 작성**

`mobile/src/sync/remote.ts`:

```ts
import type { TableName } from './tables';

export type RemoteRow = Record<string, unknown>;

// 운영: supabaseRemote.ts, 테스트: test/fakeRemote.ts
export interface Remote {
  upsert(table: TableName, rows: RemoteRow[]): Promise<void>;
  // synced_at > since 인 행을 synced_at 오름차순으로 최대 limit개 돌려준다.
  pullSince(table: TableName, since: string, limit: number): Promise<RemoteRow[]>;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`mobile/src/sync/codec.test.ts`:

```ts
import { fromRemote, toRemote } from './codec';

test('toRemote: 정의된 컬럼만 보내고 answers는 JSON 객체로 바꾼다', () => {
  expect(
    toRemote('reflections', {
      id: 'r1',
      date: '2026-10-06',
      template: 'free',
      answers: '{"body":"hi"}',
      created_at: '2026-10-06T00:00:00.000Z',
      updated_at: '2026-10-06T00:00:00.000Z',
      deleted_at: null,
    }),
  ).toEqual({
    id: 'r1',
    date: '2026-10-06',
    template: 'free',
    answers: { body: 'hi' },
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:00:00.000Z',
    deleted_at: null,
  });
});

test('fromRemote: 서버 전용 컬럼을 버리고 시각을 toISOString 형식으로 맞춘다', () => {
  expect(
    fromRemote('reflections', {
      id: 'r1',
      user_id: 'u1',
      date: '2026-10-06',
      template: 'free',
      answers: { body: 'hi' },
      created_at: '2026-10-06T00:00:00+00:00',
      updated_at: '2026-10-06T09:30:00.5+09:00',
      deleted_at: null,
      synced_at: '2026-10-06T00:00:01+00:00',
    }),
  ).toEqual({
    id: 'r1',
    date: '2026-10-06',
    template: 'free',
    answers: '{"body":"hi"}',
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-06T00:30:00.500Z',
    deleted_at: null,
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- src/sync/codec.test.ts`
Expected: FAIL, `Cannot find module './codec'`

- [ ] **Step 4: 구현**

`mobile/src/sync/codec.ts`:

```ts
import type { Row, SqlParam } from '../db/types';
import type { RemoteRow } from './remote';
import { TABLES, type TableName } from './tables';

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at']);
const JSON_COLUMNS = new Set(['answers']);

export function toRemote(table: TableName, row: Row): RemoteRow {
  const out: RemoteRow = {};
  for (const column of TABLES[table].columns) {
    const value = row[column] ?? null;
    out[column] = JSON_COLUMNS.has(column) && typeof value === 'string' ? JSON.parse(value) : value;
  }
  return out;
}

// 로컬 LWW 비교는 문자열 비교이므로 시각을 항상 toISOString() 형식으로 맞춘다.
export function fromRemote(table: TableName, remote: RemoteRow): Row {
  const out: Row = {};
  for (const column of TABLES[table].columns) {
    const value = remote[column] ?? null;
    if (value === null) out[column] = null;
    else if (TIMESTAMP_COLUMNS.has(column)) out[column] = new Date(String(value)).toISOString();
    else if (JSON_COLUMNS.has(column)) out[column] = JSON.stringify(value);
    else out[column] = value as SqlParam;
  }
  return out;
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- src/sync/codec.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/sync
git commit -m "feat: 로컬과 서버 행 변환 추가"
```

---

### Task 11: push

**Files:**
- Create: `mobile/test/fakeRemote.ts`, `mobile/src/sync/push.ts`
- Test: `mobile/src/sync/push.test.ts`

- [ ] **Step 1: 메모리 서버 대역 작성**

`mobile/test/fakeRemote.ts`:

```ts
import type { Remote, RemoteRow } from '../src/sync/remote';
import { TABLES, type TableName } from '../src/sync/tables';

// 실제 서버처럼 updated_at이 더 오래된 쓰기는 무시하고, 쓸 때마다 synced_at을 찍는다.
export function createFakeRemote() {
  const store: Record<TableName, Map<string, RemoteRow>> = {
    items: new Map(),
    days: new Map(),
    reflections: new Map(),
  };
  const state = { failUpsert: false, upsertCalls: 0 };
  let clock = Date.UTC(2026, 0, 1);

  function write(table: TableName, row: RemoteRow) {
    const key = String(row[TABLES[table].key]);
    const prev = store[table].get(key);
    if (prev && Date.parse(String(row.updated_at)) < Date.parse(String(prev.updated_at))) return;
    clock += 1000;
    store[table].set(key, { ...row, synced_at: new Date(clock).toISOString() });
  }

  const remote: Remote = {
    async upsert(table, rows) {
      state.upsertCalls++;
      if (state.failUpsert) throw new Error('network down');
      for (const row of rows) write(table, row);
    },
    async pullSince(table, since, limit) {
      return [...store[table].values()]
        .filter((r) => String(r.synced_at) > since)
        .sort((a, b) => String(a.synced_at).localeCompare(String(b.synced_at)))
        .slice(0, limit);
    },
  };

  return { remote, store, state, serverWrite: write };
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`mobile/src/sync/push.test.ts`:

```ts
import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, toggleDone } from '../items/repo';
import { markDirty, pendingCount } from './outbox';
import { push } from './push';

const NOW = new Date(2026, 9, 6, 9, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('outbox의 행을 서버에 올리고 outbox를 비운다', async () => {
  const fake = createFakeRemote();
  const item = await addItem(db, { kind: 'task', text: 'a' }, NOW);
  await push(db, fake.remote);
  expect(fake.store.items.get(item.id)).toMatchObject({ id: item.id, text: 'a', status: 'open' });
  expect(await pendingCount(db)).toBe(0);
});

test('전송에 실패하면 outbox를 그대로 남긴다', async () => {
  const fake = createFakeRemote();
  await addItem(db, { kind: 'task', text: 'a' }, NOW);
  fake.state.failUpsert = true;
  await expect(push(db, fake.remote)).rejects.toThrow('network down');
  expect(await pendingCount(db)).toBe(1);
});

test('전송 중에 같은 행이 다시 바뀌면 outbox에 남겨 다음에 다시 보낸다', async () => {
  const fake = createFakeRemote();
  const item = await addItem(db, { kind: 'task', text: 'a' }, NOW);
  const upsert = fake.remote.upsert;
  fake.remote.upsert = async (table, rows) => {
    await upsert(table, rows);
    await toggleDone(db, item.id, new Date(2026, 9, 6, 9, 1));
  };
  await push(db, fake.remote);
  expect(await pendingCount(db)).toBe(1);

  fake.remote.upsert = upsert;
  await push(db, fake.remote);
  expect(fake.store.items.get(item.id)).toMatchObject({ status: 'done' });
  expect(await pendingCount(db)).toBe(0);
});

test('로컬에 없는 키는 outbox에서만 지운다', async () => {
  const fake = createFakeRemote();
  await markDirty(db, 'items', 'ghost');
  await push(db, fake.remote);
  expect(fake.state.upsertCalls).toBe(0);
  expect(await pendingCount(db)).toBe(0);
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test -- src/sync/push.test.ts`
Expected: FAIL, `Cannot find module './push'`

- [ ] **Step 4: 구현**

`mobile/src/sync/push.ts`:

```ts
import type { Db, Row } from '../db/types';
import { toRemote } from './codec';
import type { Remote } from './remote';
import { TABLES, TABLE_NAMES } from './tables';

const BATCH = 200;

export async function push(db: Db, remote: Remote): Promise<void> {
  for (const table of TABLE_NAMES) {
    const { key } = TABLES[table];
    for (;;) {
      const entries = await db.getAllAsync<{ row_key: string; version: number }>(
        'SELECT row_key, version FROM outbox WHERE table_name = ? ORDER BY rowid LIMIT ?',
        [table, BATCH],
      );
      if (entries.length === 0) break;

      const placeholders = entries.map(() => '?').join(', ');
      const rows = await db.getAllAsync<Row>(
        `SELECT * FROM ${table} WHERE ${key} IN (${placeholders})`,
        entries.map((e) => e.row_key),
      );
      if (rows.length > 0) await remote.upsert(table, rows.map((r) => toRemote(table, r)));

      // 읽은 뒤에 다시 바뀐 행(version 증가)은 지우지 않아 다음 push에서 다시 보낸다.
      for (const e of entries) {
        await db.runAsync('DELETE FROM outbox WHERE table_name = ? AND row_key = ? AND version = ?', [
          table,
          e.row_key,
          e.version,
        ]);
      }
      if (entries.length < BATCH) break;
    }
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- src/sync/push.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 커밋**

```bash
git add mobile/test/fakeRemote.ts mobile/src/sync
git commit -m "feat: outbox를 서버로 올리는 push 추가"
```

---

### Task 12: pull과 last-write-wins 반영

**Files:**
- Create: `mobile/src/sync/pull.ts`
- Test: `mobile/src/sync/pull.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/sync/pull.test.ts`:

```ts
import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { getMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, listItemsForDate } from '../items/repo';
import { pendingCount } from './outbox';
import { pull } from './pull';

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const serverItem = (overrides: Record<string, unknown>) => ({
  id: 'srv-1',
  user_id: 'u1',
  date: '2026-10-06',
  kind: 'task',
  text: '서버에서 옴',
  status: 'open',
  migrated_from: null,
  created_at: '2026-10-06T00:00:00+00:00',
  updated_at: '2026-10-06T00:00:00+00:00',
  deleted_at: null,
  ...overrides,
});

test('서버의 새 행을 로컬에 넣고 outbox에는 올리지 않는다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  expect(await pull(db, fake.remote)).toBe(true);
  expect(await listItemsForDate(db, '2026-10-06')).toMatchObject([
    { id: 'srv-1', text: '서버에서 옴', updated_at: '2026-10-06T00:00:00.000Z' },
  ]);
  expect(await pendingCount(db)).toBe(0);
});

test('로컬이 더 최신이면 로컬을 유지한다', async () => {
  const fake = createFakeRemote();
  const local = await addItem(db, { kind: 'task', text: '로컬 최신' }, new Date(Date.UTC(2026, 9, 6, 12)));
  fake.serverWrite('items', serverItem({ id: local.id, text: '서버 옛것', updated_at: '2026-10-06T01:00:00Z' }));
  expect(await pull(db, fake.remote)).toBe(false);
  expect((await listItemsForDate(db, local.date))[0].text).toBe('로컬 최신');
});

test('서버가 더 최신이면 덮어쓴다', async () => {
  const fake = createFakeRemote();
  const local = await addItem(db, { kind: 'task', text: '로컬 옛것' }, new Date(Date.UTC(2026, 9, 6, 1)));
  fake.serverWrite('items', serverItem({ id: local.id, date: local.date, text: '서버 최신', updated_at: '2026-10-06T12:00:00Z' }));
  expect(await pull(db, fake.remote)).toBe(true);
  expect((await listItemsForDate(db, local.date))[0].text).toBe('서버 최신');
});

test('커서를 저장해 변경이 없으면 다시 반영하지 않는다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  await pull(db, fake.remote);
  expect(await pull(db, fake.remote)).toBe(false);
  expect(await db.getFirstAsync("SELECT cursor FROM sync_state WHERE table_name = 'items'", [])).toEqual({
    cursor: fake.store.items.get('srv-1')!.synced_at,
  });
});

test('date를 키로 쓰는 days도 반영한다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('days', { user_id: 'u1', date: '2026-10-06', mood: 4, updated_at: '2026-10-06T00:00:00Z', deleted_at: null });
  await pull(db, fake.remote);
  expect(await getMood(db, '2026-10-06')).toBe(4);
});

test('서버의 삭제 표시도 반영되어 목록에서 빠진다', async () => {
  const fake = createFakeRemote();
  fake.serverWrite('items', serverItem({}));
  await pull(db, fake.remote);
  fake.serverWrite('items', serverItem({ deleted_at: '2026-10-06T02:00:00Z', updated_at: '2026-10-06T02:00:00Z' }));
  await pull(db, fake.remote);
  expect(await listItemsForDate(db, '2026-10-06')).toHaveLength(0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/sync/pull.test.ts`
Expected: FAIL, `Cannot find module './pull'`

- [ ] **Step 3: 구현**

`mobile/src/sync/pull.ts`:

```ts
import type { Db, Row } from '../db/types';
import { fromRemote } from './codec';
import type { Remote } from './remote';
import { TABLES, TABLE_NAMES, type TableName } from './tables';

const PAGE = 500;
// 서버 트랜잭션 커밋 순서와 synced_at 순서가 어긋날 수 있어 커서보다 조금 앞에서부터 다시 받는다.
// 다시 받은 행은 LWW 조건 때문에 변화가 없으므로 안전하다.
const OVERLAP_MS = 60_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

export async function applyRemoteRow(db: Db, table: TableName, row: Row): Promise<boolean> {
  const { key, columns } = TABLES[table];
  const cols = columns as readonly string[];
  const updates = cols
    .filter((c) => c !== key)
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const result = await db.runAsync(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (${key}) DO UPDATE SET ${updates}
     WHERE excluded.updated_at > ${table}.updated_at`,
    cols.map((c) => row[c] ?? null),
  );
  return result.changes > 0;
}

export async function pull(db: Db, remote: Remote): Promise<boolean> {
  let changed = false;
  for (const table of TABLE_NAMES) {
    const state = await db.getFirstAsync<{ cursor: string }>('SELECT cursor FROM sync_state WHERE table_name = ?', [
      table,
    ]);
    let cursor = state?.cursor ?? null;
    let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : EPOCH;

    for (;;) {
      const rows = await remote.pullSince(table, since, PAGE);
      for (const r of rows) {
        if (await applyRemoteRow(db, table, fromRemote(table, r))) changed = true;
      }
      if (rows.length > 0) {
        const last = new Date(String(rows[rows.length - 1].synced_at)).toISOString();
        since = last;
        if (!cursor || last > cursor) cursor = last;
      }
      if (rows.length < PAGE) break;
    }

    if (cursor) {
      await db.runAsync(
        `INSERT INTO sync_state (table_name, cursor) VALUES (?, ?)
         ON CONFLICT (table_name) DO UPDATE SET cursor = excluded.cursor`,
        [table, cursor],
      );
    }
  }
  return changed;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/sync/pull.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add mobile/src/sync
git commit -m "feat: 서버 변경분을 받아 last-write-wins로 반영하는 pull 추가"
```

---

### Task 13: 동기화 엔진

**Files:**
- Create: `mobile/src/sync/engine.ts`
- Test: `mobile/src/sync/engine.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`mobile/src/sync/engine.test.ts`:

```ts
import { createFakeRemote } from '../../test/fakeRemote';
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import { addItem } from '../items/repo';
import { createSyncEngine } from './engine';

test('동시에 여러 번 호출해도 한 번만 실행된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
  expect(fake.state.upsertCalls).toBe(1);
});

test('서버에서 바뀐 것이 있으면 onPulled를 부른다', async () => {
  const db = openTestDb();
  await migrate(db);
  const fake = createFakeRemote();
  fake.serverWrite('days', { user_id: 'u1', date: '2026-10-06', mood: 3, updated_at: '2026-10-06T00:00:00Z', deleted_at: null });
  const onPulled = jest.fn();
  const engine = createSyncEngine(db, fake.remote, onPulled);

  await engine.sync();
  await engine.sync();
  expect(onPulled).toHaveBeenCalledTimes(1);
});

test('실패해도 다음 호출은 다시 실행된다', async () => {
  const db = openTestDb();
  await migrate(db);
  await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 6, 9));
  const fake = createFakeRemote();
  const engine = createSyncEngine(db, fake.remote);

  fake.state.failUpsert = true;
  await expect(engine.sync()).rejects.toThrow('network down');
  fake.state.failUpsert = false;
  await engine.sync();
  expect(fake.store.items.size).toBe(1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/sync/engine.test.ts`
Expected: FAIL, `Cannot find module './engine'`

- [ ] **Step 3: 구현**

`mobile/src/sync/engine.ts`:

```ts
import type { Db } from '../db/types';
import { pull } from './pull';
import { push } from './push';
import type { Remote } from './remote';

export function createSyncEngine(db: Db, remote: Remote, onPulled?: () => void) {
  let running: Promise<void> | null = null;
  return {
    sync(): Promise<void> {
      if (!running) {
        running = (async () => {
          await push(db, remote);
          if (await pull(db, remote)) onPulled?.();
        })().finally(() => {
          running = null;
        });
      }
      return running;
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- src/sync/engine.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 전체 테스트와 타입 체크**

Run: `npm test && npm run typecheck`
Expected: 모든 테스트 PASS, tsc 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add mobile/src/sync
git commit -m "feat: push와 pull을 묶는 동기화 엔진 추가"
```

---

### Task 14: Supabase 스키마, RLS, LWW 트리거

**Files:**
- Create: `supabase/config.toml` (CLI 생성), `supabase/migrations/20261006000000_init.sql`, `supabase/tests/rls.test.sql`

사전 조건: Docker Desktop 실행 중.

- [ ] **Step 1: Supabase 초기화 (저장소 루트에서)**

```bash
npx supabase init
```

Expected: `supabase/config.toml` 생성

- [ ] **Step 2: 실패하는 DB 테스트 작성**

`supabase/tests/rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.items (id, date, kind, text, status, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-06', 'task', 'mine', 'open',
        '2026-10-06T00:00:00Z', '2026-10-06T00:00:00Z');
insert into public.days (date, mood, updated_at) values ('2026-10-06', 4, '2026-10-06T00:00:00Z');

select is((select count(*)::int from public.items), 1, 'A는 자기 항목을 본다');
select is(
  (select user_id from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id 기본값은 auth.uid()'
);

update public.items set text = 'older', updated_at = '2026-10-05T00:00:00Z'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'mine',
  '더 오래된 updated_at의 수정은 무시된다'
);

select throws_ok($$ delete from public.items $$, '42501', null, '행 삭제 권한이 없다');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.items), 0, 'B는 A의 항목을 못 본다');
select is((select count(*)::int from public.days), 0, 'B는 A의 기분을 못 본다');
select throws_ok(
  $$ insert into public.items (id, user_id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
             '2026-10-06', 'note', 'x', null, now(), now()) $$,
  '42501', null, 'B는 A 명의로 쓸 수 없다'
);
update public.items set text = 'hacked', updated_at = '2027-01-01T00:00:00Z'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select text from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'mine',
  'B의 수정은 A의 항목에 적용되지 않았다'
);

select * from finish();
rollback;
```

- [ ] **Step 3: 실패 확인**

```bash
npx supabase start
npx supabase test db
```

Expected: FAIL, `relation "public.items" does not exist`

- [ ] **Step 4: 마이그레이션 작성**

`supabase/migrations/20261006000000_init.sql`:

```sql
create table public.items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('task', 'event', 'note')),
  text text not null check (length(btrim(text)) > 0),
  status text check (status in ('open', 'done', 'migrated', 'dropped')),
  migrated_from uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  check ((kind = 'task') = (status is not null))
);
create index items_user_synced on public.items (user_id, synced_at);

create table public.days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);
create index days_user_synced on public.days (user_id, synced_at);

create table public.reflections (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  template text not null check (template in ('perfectionism', 'lethargy', 'gratitude', 'free')),
  answers jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index reflections_user_synced on public.reflections (user_id, synced_at);

-- last-write-wins: 더 오래된 updated_at의 수정은 무시하고, 반영된 쓰기에만 synced_at을 찍는다.
create function public.apply_lww() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

create trigger items_lww before insert or update on public.items
  for each row execute function public.apply_lww();
create trigger days_lww before insert or update on public.days
  for each row execute function public.apply_lww();
create trigger reflections_lww before insert or update on public.reflections
  for each row execute function public.apply_lww();

alter table public.items enable row level security;
alter table public.days enable row level security;
alter table public.reflections enable row level security;

create policy items_select on public.items for select to authenticated
  using (user_id = (select auth.uid()));
create policy items_insert on public.items for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy items_update on public.items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy days_select on public.days for select to authenticated
  using (user_id = (select auth.uid()));
create policy days_insert on public.days for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy days_update on public.days for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy reflections_select on public.reflections for select to authenticated
  using (user_id = (select auth.uid()));
create policy reflections_insert on public.reflections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy reflections_update on public.reflections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 삭제는 deleted_at으로만 한다.
revoke delete, truncate on public.items, public.days, public.reflections from anon, authenticated;
```

- [ ] **Step 5: 통과 확인**

```bash
npx supabase db reset
npx supabase test db
```

Expected: `rls.test.sql .. ok`, `All tests successful.`

- [ ] **Step 6: 커밋 (저장소 루트에서)**

```bash
git add supabase
git commit -m "feat: Supabase 스키마, RLS, last-write-wins 트리거 추가"
```

---

### Task 15: Supabase 클라이언트와 Remote 구현

**Files:**
- Create: `mobile/src/supabase.ts`, `mobile/src/sync/supabaseRemote.ts`

이 두 파일은 외부 서비스에 붙는 얇은 연결부라 단위 테스트 대신 타입 체크와 Task 20의 실기기 확인으로 검증한다.

- [ ] **Step 1: 클라이언트 작성**

`mobile/src/supabase.ts`:

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { randomBytes } from './lib/id';

// 세션은 SecureStore 용량 제한(2KB)을 넘을 수 있어, 암호화한 본문은 AsyncStorage에, 키는 SecureStore에 둔다.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = randomBytes(256 / 8);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    return encrypted ? this.decrypt(key, encrypted) : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await this.encrypt(key, value));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 가 없습니다. mobile/.env를 확인하세요.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

- [ ] **Step 2: Remote 구현 작성**

`mobile/src/sync/supabaseRemote.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './remote';

export function createSupabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table, rows) {
      const onConflict = table === 'days' ? 'user_id,date' : 'id';
      const { error } = await client
        .from(table)
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict });
      if (error) throw new Error(`${table} 업로드 실패: ${error.message}`);
    },
    async pullSince(table, since, limit) {
      const { data, error } = await client
        .from(table)
        .select('*')
        .gt('synced_at', since)
        .order('synced_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`${table} 다운로드 실패: ${error.message}`);
      return data ?? [];
    },
  };
}
```

- [ ] **Step 3: 타입 체크**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add mobile/src/supabase.ts mobile/src/sync/supabaseRemote.ts
git commit -m "feat: Supabase 클라이언트와 Remote 구현 추가"
```

---

### Task 16: 동기화 시점 훅

**Files:**
- Create: `mobile/src/sync/useSync.ts`

- [ ] **Step 1: 구현**

`mobile/src/sync/useSync.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Db } from '../db/types';
import { createSyncEngine } from './engine';
import { pendingCount } from './outbox';
import type { Remote } from './remote';

const DEBOUNCE_MS = 2_000;
const RETRY_MS = 30_000;

export function useSync(db: Db, remote: Remote, onPulled: () => void) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onPulledRef = useRef(onPulled);
  onPulledRef.current = onPulled;

  const engine = useMemo(() => createSyncEngine(db, remote, () => onPulledRef.current()), [db, remote]);

  const runSync = useCallback(async () => {
    try {
      await engine.sync();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(await pendingCount(db));
    }
  }, [db, engine]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSync = useCallback(() => {
    pendingCount(db).then(setPending);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(runSync, DEBOUNCE_MS);
  }, [db, runSync]);

  useEffect(() => {
    runSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runSync();
    }, RETRY_MS);
    return () => {
      sub.remove();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runSync]);

  return { pending, error, requestSync };
}
```

- [ ] **Step 2: 타입 체크**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add mobile/src/sync/useSync.ts
git commit -m "feat: 앱 시작, 포그라운드, 쓰기 후, 30초 주기 동기화 훅 추가"
```

---

### Task 17: 로그인 화면과 앱 진입점

**Files:**
- Create: `mobile/src/db/client.ts`, `mobile/src/screens/LoginScreen.tsx`, `mobile/src/screens/Main.tsx`
- Modify: `mobile/App.tsx` (전체 교체)

`Main.tsx`는 이 Task에서 동기화 표시와 화면 전환 틀까지 만들고, 실제 화면은 Task 18, 19에서 채운다. 그 전까지 타입 체크가 통과하도록 Task 18, 19의 화면 파일을 먼저 최소 형태로 만든다(Step 4).

- [ ] **Step 1: DB 열기**

`mobile/src/db/client.ts`:

```ts
import { openDatabaseAsync } from 'expo-sqlite';
import { migrate } from './schema';
import type { Db } from './types';

export async function openDb(): Promise<Db> {
  const db: Db = await openDatabaseAsync('daily-log.db');
  await migrate(db);
  return db;
}
```

- [ ] **Step 2: 로그인 화면**

`mobile/src/screens/LoginScreen.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) setError(e.message);
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        하루 기록
      </Text>
      <TextInput
        style={styles.input}
        placeholder="이메일"
        accessibilityLabel="이메일"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="비밀번호"
        accessibilityLabel="비밀번호"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={signIn}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, busy && styles.disabled]}
        accessibilityRole="button"
        disabled={busy || !email || !password}
        onPress={signIn}
      >
        <Text style={styles.buttonText}>{busy ? '로그인 중…' : '로그인'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: '#b00020' },
  button: { backgroundColor: '#222', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: 메인 틀**

`mobile/src/screens/Main.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { EveningScreen } from './EveningScreen';
import { TodayScreen } from './TodayScreen';

export function Main({ db, userId }: { db: Db; userId: string }) {
  const remote = useMemo(() => createSupabaseRemote(supabase, userId), [userId]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const { pending, error, requestSync } = useSync(db, remote, refresh);
  const [screen, setScreen] = useState<'today' | 'evening'>('today');

  // 앱을 다시 열면 날짜(새벽 4시 경계)가 바뀌었을 수 있으므로 다시 그린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  return (
    <SafeAreaView style={styles.container}>
      {(pending > 0 || error) && (
        <Text style={styles.syncBar} accessibilityLiveRegion="polite">
          {error ? `동기화 실패, 자동으로 다시 시도합니다 (${pending}건 대기)` : `동기화 대기 ${pending}건`}
        </Text>
      )}
      {screen === 'today' ? (
        <TodayScreen db={db} version={version} onChanged={onChanged} onOpenEvening={() => setScreen('evening')} />
      ) : (
        <EveningScreen db={db} version={version} onChanged={onChanged} onClose={() => setScreen('today')} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  syncBar: { backgroundColor: '#fff4d6', color: '#5c4400', paddingVertical: 6, paddingHorizontal: 16, fontSize: 13 },
});
```

- [ ] **Step 4: 화면 자리 만들기 (Task 18, 19에서 교체)**

`mobile/src/screens/TodayScreen.tsx`:

```tsx
import { Text } from 'react-native';
import type { Db } from '../db/types';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void };

export function TodayScreen(_props: Props) {
  return <Text>오늘</Text>;
}
```

`mobile/src/screens/EveningScreen.tsx`:

```tsx
import { Text } from 'react-native';
import type { Db } from '../db/types';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

export function EveningScreen(_props: Props) {
  return <Text>저녁</Text>;
}
```

- [ ] **Step 5: App.tsx 교체**

`mobile/App.tsx`:

```tsx
import 'react-native-get-random-values';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { openDb } from './src/db/client';
import type { Db } from './src/db/types';
import { LoginScreen } from './src/screens/LoginScreen';
import { Main } from './src/screens/Main';
import { supabase } from './src/supabase';

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then(setDb)
      .catch((e) => setFatal(`로컬 저장소를 열 수 없습니다: ${String(e)}`));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  let body: ReactNode;
  if (fatal) body = <Text style={styles.center}>{fatal}</Text>;
  else if (!db || !authReady) body = <ActivityIndicator style={styles.center} />;
  else if (!session) body = <LoginScreen />;
  else body = <Main db={db} userId={session.user.id} />;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>{body}</View>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, textAlign: 'center', textAlignVertical: 'center', marginTop: 120 },
});
```

- [ ] **Step 6: 타입 체크와 테스트**

Run: `npm run typecheck && npm test`
Expected: tsc 오류 없음, 모든 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
git add mobile/App.tsx mobile/src/db/client.ts mobile/src/screens
git commit -m "feat: 로그인 화면과 앱 진입점, 동기화 상태 표시 추가"
```

---

### Task 18: 오늘 화면 (이월, 빠른 입력, 목록)

**Files:**
- Modify: `mobile/src/screens/TodayScreen.tsx` (전체 교체)

- [ ] **Step 1: 구현**

`mobile/src/screens/TodayScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Db } from '../db/types';
import {
  addItem,
  deleteItem,
  dropItem,
  type Item,
  type ItemKind,
  listItemsForDate,
  listMigrationCandidates,
  migrateToToday,
  toggleDone,
} from '../items/repo';
import { logicalDate } from '../lib/date';
import { countRecordedDays } from '../stats/recordedDays';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void };

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'event', symbol: '○', label: '일정' },
  { kind: 'note', symbol: '–', label: '메모' },
];

function symbolOf(item: Item): string {
  if (item.kind === 'event') return '○';
  if (item.kind === 'note') return '–';
  if (item.status === 'done') return 'X';
  if (item.status === 'migrated') return '>';
  return '•';
}

export function TodayScreen({ db, version, onChanged, onOpenEvening }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [later, setLater] = useState<Set<string>>(new Set());
  const [recordedDays, setRecordedDays] = useState(0);
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listItemsForDate(db, today), listMigrationCandidates(db, today), countRecordedDays(db)])
      .then(([i, c, n]) => {
        if (cancelled) return;
        setItems(i);
        setCandidates(c);
        setRecordedDays(n);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const submit = () =>
    run(async () => {
      await addItem(db, { kind, text });
      setText('');
    });

  const visibleCandidates = candidates.filter((c) => !later.has(c.id));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.date} accessibilityRole="header">
            {today}
          </Text>
          <Text style={styles.sub}>기록한 날 {recordedDays}일</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.eveningButton} onPress={onOpenEvening}>
          <Text style={styles.eveningText}>저녁 마무리</Text>
        </Pressable>
      </View>

      {visibleCandidates.length > 0 && (
        <View style={styles.migration}>
          <Text style={styles.sectionTitle}>지난 할 일 {visibleCandidates.length}개</Text>
          {visibleCandidates.map((c) => (
            <View key={c.id} style={styles.candidate}>
              <Text style={styles.candidateText}>
                {c.text} <Text style={styles.sub}>({c.date})</Text>
              </Text>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={() => run(() => migrateToToday(db, c.id))}>
                  <Text style={styles.action}>오늘 하기</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setLater(new Set(later).add(c.id))}>
                  <Text style={styles.action}>나중으로</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => run(() => dropItem(db, c.id))}>
                  <Text style={[styles.action, styles.danger]}>버리기</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k.kind}
            accessibilityRole="button"
            accessibilityLabel={k.label}
            accessibilityState={{ selected: kind === k.kind }}
            style={[styles.kind, kind === k.kind && styles.kindSelected]}
            onPress={() => setKind(k.kind)}
          >
            <Text style={[styles.kindText, kind === k.kind && styles.kindTextSelected]}>{k.symbol}</Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.input}
          autoFocus
          placeholder="한 줄로 기록"
          accessibilityLabel="새 항목"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>아직 기록이 없습니다</Text>}
        renderItem={({ item }) => {
          const toggleable = item.status === 'open' || item.status === 'done';
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                disabled={!toggleable}
                accessibilityRole={toggleable ? 'checkbox' : undefined}
                accessibilityState={toggleable ? { checked: item.status === 'done' } : undefined}
                onPress={() => run(() => toggleDone(db, item.id))}
              >
                <Text style={styles.symbol}>{symbolOf(item)}</Text>
                <Text style={[styles.rowText, item.status === 'dropped' && styles.dropped]}>{item.text}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.text} 삭제`}
                onPress={() => run(() => deleteItem(db, item.id))}
              >
                <Text style={styles.delete}>삭제</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#666', fontSize: 13 },
  eveningButton: { borderWidth: 1, borderColor: '#222', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  eveningText: { fontWeight: '600' },
  migration: { backgroundColor: '#f4f4f4', borderRadius: 8, padding: 12, gap: 8 },
  sectionTitle: { fontWeight: '700' },
  candidate: { gap: 4 },
  candidateText: { fontSize: 15 },
  actions: { flexDirection: 'row', gap: 16 },
  action: { color: '#0a58ca', fontWeight: '600', paddingVertical: 4 },
  danger: { color: '#b00020' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  kindSelected: { backgroundColor: '#222', borderColor: '#222' },
  kindText: { fontSize: 18 },
  kindTextSelected: { color: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16 },
  error: { color: '#b00020' },
  empty: { color: '#999', textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  rowMain: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' },
  symbol: { width: 16, fontSize: 16, textAlign: 'center' },
  rowText: { fontSize: 16, flexShrink: 1 },
  dropped: { textDecorationLine: 'line-through', color: '#999' },
  delete: { color: '#999', paddingHorizontal: 8 },
});
```

참고: `submitBehavior`는 React Native 0.73 이상의 prop이다. 타입 체크에서 없다고 나오면 `blurOnSubmit={false}`로 바꾼다.

- [ ] **Step 2: 타입 체크**

Run: `npm run typecheck`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add mobile/src/screens/TodayScreen.tsx
git commit -m "feat: 오늘 화면(이월, 빠른 입력, 완료 체크) 추가"
```

---

### Task 19: 저녁 마무리 화면 (기분, 템플릿)

**Files:**
- Modify: `mobile/src/screens/EveningScreen.tsx` (전체 교체)

- [ ] **Step 1: 구현**

`mobile/src/screens/EveningScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getMood, setMood } from '../days/repo';
import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { addReflection, listReflections, type Reflection } from '../reflections/repo';
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from '../reflections/templates';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

const MOODS = [1, 2, 3, 4, 5];

export function EveningScreen({ db, version, onChanged, onClose }: Props) {
  const today = logicalDate(new Date());
  const [mood, setMoodState] = useState<number | null>(null);
  const [saved, setSaved] = useState<Reflection[]>([]);
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMood(db, today), listReflections(db, today)])
      .then(([m, r]) => {
        if (cancelled) return;
        setMoodState(m);
        setSaved(r);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickMood = (value: number) => run(() => setMood(db, today, mood === value ? null : value));

  const save = () =>
    run(async () => {
      if (!template) return;
      await addReflection(db, { template, answers });
      setTemplate(null);
      setAnswers({});
    });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {today} 마무리
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text style={styles.link}>닫기</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>오늘 기분</Text>
      <View style={styles.moods}>
        {MOODS.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityLabel={`기분 ${m}점`}
            accessibilityState={{ selected: mood === m }}
            style={[styles.mood, mood === m && styles.moodSelected]}
            onPress={() => pickMood(m)}
          >
            <Text style={[styles.moodText, mood === m && styles.moodTextSelected]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>오늘은 어떤 날이었나요? (선택)</Text>
      <View style={styles.templates}>
        {TEMPLATE_KEYS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: template === key }}
            style={[styles.chip, template === key && styles.chipSelected]}
            onPress={() => {
              setTemplate(template === key ? null : key);
              setAnswers({});
            }}
          >
            <Text style={template === key ? styles.chipTextSelected : undefined}>{TEMPLATES[key].label}</Text>
          </Pressable>
        ))}
      </View>

      {template && (
        <View style={styles.form}>
          {TEMPLATES[template].questions.map((q) => (
            <View key={q.key} style={styles.question}>
              <Text style={styles.questionText}>{q.text}</Text>
              <TextInput
                style={styles.answer}
                multiline
                accessibilityLabel={q.text}
                value={answers[q.key] ?? ''}
                onChangeText={(v) => setAnswers({ ...answers, [q.key]: v })}
              />
            </View>
          ))}
          <Pressable accessibilityRole="button" style={styles.save} onPress={save}>
            <Text style={styles.saveText}>저장</Text>
          </Pressable>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {saved.length > 0 && (
        <View style={styles.saved}>
          <Text style={styles.sectionTitle}>오늘 남긴 회고</Text>
          {saved.map((r) => (
            <View key={r.id} style={styles.savedItem}>
              <Text style={styles.savedLabel}>{TEMPLATES[r.template].label}</Text>
              {TEMPLATES[r.template].questions
                .filter((q) => r.answers[q.key])
                .map((q) => (
                  <Text key={q.key}>
                    <Text style={styles.sub}>{q.text}{'\n'}</Text>
                    {r.answers[q.key]}
                  </Text>
                ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#0a58ca', fontWeight: '600', padding: 4 },
  sectionTitle: { fontWeight: '700', marginTop: 8 },
  moods: { flexDirection: 'row', gap: 10 },
  mood: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  moodSelected: { backgroundColor: '#222', borderColor: '#222' },
  moodText: { fontSize: 18 },
  moodTextSelected: { color: '#fff' },
  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: '#222', borderColor: '#222' },
  chipTextSelected: { color: '#fff' },
  form: { gap: 12 },
  question: { gap: 6 },
  questionText: { fontSize: 15 },
  answer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, minHeight: 72, fontSize: 16, textAlignVertical: 'top' },
  save: { backgroundColor: '#222', borderRadius: 8, padding: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020' },
  saved: { gap: 8 },
  savedItem: { backgroundColor: '#f4f4f4', borderRadius: 8, padding: 12, gap: 6 },
  savedLabel: { fontWeight: '600' },
  sub: { color: '#666', fontSize: 13 },
});
```

- [ ] **Step 2: 타입 체크와 전체 테스트**

Run: `npm run typecheck && npm test`
Expected: tsc 오류 없음, 모든 테스트 PASS

- [ ] **Step 3: 커밋**

```bash
git add mobile/src/screens/EveningScreen.tsx
git commit -m "feat: 저녁 마무리 화면(기분, 상황별 템플릿) 추가"
```

---

### Task 20: Supabase 연결과 실기기 확인

이 Task는 외부 서비스에 반영하는 단계라 **사용자가 직접 하거나 사용자의 확인을 받은 뒤** 진행한다.

- [ ] **Step 1: Supabase 프로젝트 준비 (사용자, 대시보드)**

1. supabase.com에서 새 프로젝트를 만든다.
2. Authentication → Sign In / Providers에서 **"Allow new users to sign up"을 끈다** (혼자 쓰는 앱).
3. Authentication → Users → Add user로 본인 이메일과 비밀번호 계정을 만든다.
4. Project Settings → API에서 Project URL과 anon key를 복사한다.

- [ ] **Step 2: 스키마 배포 (저장소 루트, 사용자 확인 후)**

```bash
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

Expected: `Applying migration 20261006000000_init.sql...` 후 `Finished supabase db push.`

- [ ] **Step 3: 환경 변수**

`mobile/.env.example`을 `mobile/.env`로 복사하고 Step 1의 URL과 anon key를 넣는다. `.env`는 커밋하지 않는다.

- [ ] **Step 4: 실행**

```bash
cd mobile
npx expo start
```

아이폰 카메라로 QR을 찍어 Expo Go에서 연다.

- [ ] **Step 5: 확인 목록**

- [ ] 로그인 후 앱을 완전히 종료했다 다시 열어도 로그인이 유지된다.
- [ ] `•` 할 일, `○` 일정, `–` 메모를 각각 추가하면 목록에 기호와 함께 나타난다.
- [ ] 할 일을 탭하면 `X`로 바뀌고, 다시 탭하면 `•`로 돌아온다.
- [ ] 몇 초 뒤 Supabase Table Editor의 `items`에 같은 행이 보인다.
- [ ] 비행기 모드에서 항목을 추가하면 바로 목록에 나타나고 "동기화 대기 N건"이 뜬다. 비행기 모드를 끄면 30초 안에 표시가 사라지고 서버에 행이 생긴다.
- [ ] Table Editor에서 `items`에 어제 날짜(`date`), `kind = task`, `status = open`인 행을 직접 추가하고(`id`는 `gen_random_uuid()`, `user_id`는 본인 id, `created_at`/`updated_at`은 `now()`), 앱을 백그라운드에서 다시 열면 "지난 할 일"에 나타난다.
- [ ] "오늘 하기"를 누르면 오늘 목록으로 옮겨지고, 서버의 원래 행은 `migrated`, 새 행은 `migrated_from`이 원래 id다.
- [ ] "나중으로"는 지금 화면에서만 숨기고, 앱을 다시 열면 다시 나타난다.
- [ ] "버리기"를 누르면 후보에서 사라지고 서버 행이 `dropped`가 된다.
- [ ] 저녁 마무리에서 기분 4를 누르면 `days`에 행이 생기고, 4를 다시 누르면 `mood`가 null이 된다.
- [ ] 템플릿 "무기력했던 날"에 답하고 저장하면 아래 "오늘 남긴 회고"에 나타나고 `reflections.answers`에 JSON으로 저장된다.
- [ ] 항목을 삭제하면 목록에서 사라지고 서버 행에는 `deleted_at`만 찍힌다.
- [ ] 헤더의 "기록한 날 N일"이 기록이 있는 날 수와 같다.

- [ ] **Step 6: 결과 기록**

확인 중 실패한 항목이 있으면 재현 방법과 함께 기록하고, 원인을 고친 뒤 해당 항목만 다시 확인한다. 코드 변경이 있었다면 커밋한다.

---

## 스펙 대비 확인

| 스펙 | 구현 |
|---|---|
| 3. 아침 이월(오늘 하기/나중으로/버리기) | Task 6, 18 |
| 3. 빠른 입력, 자동 포커스, 완료 토글 | Task 6, 18 |
| 3. 저녁 기분(비워둘 수 있음), 템플릿(건너뛰기 가능) | Task 7, 8, 19 |
| 4. 스트릭 대신 누적 일수 | Task 9, 18 |
| 5. 새벽 4시 경계, `logicalDate` 단일 함수 | Task 2 |
| 6. 데이터 모델, 제약 | Task 4(로컬), 14(서버) |
| 6. RLS, anon key만, 삭제 권한 없음 | Task 14, 15, 20 |
| 7. 로컬 우선, outbox, push/pull, LWW, 동기화 시점, 대기 표시 | Task 5, 10~13, 16, 17 |
| 8. 이메일 로그인, 세션 보안 저장 | Task 15, 17 |
| 9. 테스트(경계, 이월, 동기화, RLS) | Task 2, 6, 11~14 |
