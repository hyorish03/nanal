# 나날 규칙 v2 (데이터 모델과 로직) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목업에서 확정한 규칙(진행 중, 하루 3개 중요 표시, 일정→할 일 통합, 놓아준 일 제거, 내일로, 사용자 템플릿과 회고 스냅샷)을 로컬 DB, 동기화, Supabase, 저장소 함수에 반영한다. 화면 개편은 계획 B에서 하고, 이 계획에서는 기존 화면이 새 API로 계속 동작하게만 고친다.

**Architecture:** 로컬 SQLite는 버전 2 마이그레이션에서 `items`, `reflections`를 다시 만들고 `templates`를 추가한다(SQLite는 CHECK를 바꿀 수 없어 테이블 재생성). 동기화 대상에 `templates`를 더하고 codec에 boolean/JSON 변환을 넣는다. Supabase에는 같은 변경을 담은 두 번째 마이그레이션과 pgTAP 테스트를 추가한다. 규칙(상태 전이, 중요 3개 제한, 정렬, 이월)은 모두 저장소 함수 한 곳에 둔다.

**Tech Stack:** Expo SDK 57, expo-sqlite, Jest + better-sqlite3, Supabase(Postgres 17, RLS, pgTAP)

**Spec:** `docs/superpowers/specs/2026-10-06-daily-log-app-design.md` 11절

**공통 규칙**
- 명령은 별도 표기가 없으면 `mobile/`에서 실행한다. Supabase 명령은 저장소 루트에서 `supabase`(Homebrew)로 실행한다.
- 모든 커밋은 `git commit -m "<메시지>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` 형식.
- DB 규칙: `Db`는 모든 호출을 차례로 실행한다. 쿼리 메서드는 params 배열이 필수(`[]`). 트랜잭션은 `db.transaction(async (tx) => ...)`이며 안에서는 `tx`만 쓴다.
- 배포 순서: 서버 마이그레이션(Task 9)을 먼저 적용한 뒤 새 앱을 실행한다. 반대로 하면 새 컬럼과 `templates` 업로드가 실패해 미전송 목록에 쌓인다(서버 적용 후 자동 재전송되어 유실은 없다).

---

## 파일 구조

| 파일 | 변경 | 책임 |
|---|---|---|
| `src/lib/date.ts` | 수정 | `addDays` 추가 |
| `src/db/schema.ts` | 수정 | 마이그레이션 v2, `migrate(db, target?)` |
| `src/sync/tables.ts` | 수정 | `templates` 추가, `priority`·`snapshot` 컬럼 |
| `src/sync/codec.ts` | 수정 | boolean(`priority`), JSON(`questions`, `snapshot`) 변환 |
| `test/fakeRemote.ts` | 수정 | 저장소를 `TABLE_NAMES`로 생성 |
| `src/items/repo.ts` | 수정 | 상태 전이, 중요 표시, 내일로, 정렬 |
| `src/reflections/templates.ts` | 교체 | 기본 템플릿과 예전 템플릿 이름 |
| `src/reflections/templateRepo.ts` | 신규 | 사용자 템플릿 만들기·수정·삭제·목록 |
| `src/reflections/repo.ts` | 수정 | `templateId`와 스냅샷 저장, 읽을 때 이름·질문 복원 |
| `src/screens/TodayScreen.tsx` | 수정(최소) | 새 함수로 연결 |
| `src/screens/EveningScreen.tsx` | 수정(최소) | 템플릿 목록을 DB에서 읽기 |
| `supabase/migrations/20261007000000_rules_v2.sql` | 신규 | 서버 스키마 v2 |
| `supabase/tests/rules_v2.test.sql` | 신규 | pgTAP 테스트 |

---

### Task 1: 날짜 더하기

**Files:**
- Modify: `mobile/src/lib/date.ts`
- Test: `mobile/src/lib/date.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** (`date.test.ts` 끝에)

```ts
import { addDays } from './date';

test('addDays는 달과 해를 넘긴다', () => {
  expect(addDays('2026-10-07', 1)).toBe('2026-10-08');
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/lib/date.test.ts` → `addDays is not a function`

- [ ] **Step 3: 구현** (`date.ts` 끝에)

```ts
// 'YYYY-MM-DD' 논리 날짜에 n일을 더한다. 시간대와 무관하게 달력 날짜만 계산한다.
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/lib/date.test.ts` → PASS

- [ ] **Step 5: 커밋** — `git add mobile/src/lib && git commit -m "feat: 논리 날짜에 일수를 더하는 addDays" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: 로컬 스키마 v2

**Files:**
- Modify: `mobile/src/db/schema.ts`
- Test: `mobile/src/db/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** (`schema.test.ts` 끝에)

```ts
const TS2 = '2026-10-06T00:00:00.000Z';

test('v1 데이터를 v2로 옮긴다: 일정은 할 일, 놓아준 일은 삭제 표시', async () => {
  const db = openTestDb();
  await migrate(db, 1);
  const ins = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, id, status, TS2, TS2],
    );
  await ins('ev', 'event', null);
  await ins('dr', 'task', 'dropped');
  await ins('op', 'task', 'open');
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['r1', '2026-10-06', 'perfectionism', '{"want":"x"}', TS2, TS2],
  );

  await migrate(db);

  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
  expect(await db.getAllAsync('SELECT id, kind, status, priority, deleted_at FROM items ORDER BY id', [])).toEqual([
    { id: 'dr', kind: 'task', status: 'open', priority: 0, deleted_at: TS2 },
    { id: 'ev', kind: 'task', status: 'open', priority: 0, deleted_at: null },
    { id: 'op', kind: 'task', status: 'open', priority: 0, deleted_at: null },
  ]);
  expect(await db.getFirstAsync('SELECT template, snapshot FROM reflections', [])).toEqual({
    template: 'perfectionism',
    snapshot: null,
  });
});

test('v2 제약: 일정·놓아준 일은 거부, 진행 중·사용자 템플릿은 허용', async () => {
  const db = openTestDb();
  await migrate(db);
  const ins = (id: string, kind: string, status: string | null) =>
    db.runAsync(
      'INSERT INTO items (id, date, kind, text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, '2026-10-06', kind, 'x', status, TS2, TS2],
    );
  await expect(ins('a', 'event', null)).rejects.toThrow();
  await expect(ins('b', 'task', 'dropped')).rejects.toThrow();
  await expect(ins('c', 'task', 'doing')).resolves.toBeDefined();
  await expect(
    db.runAsync(
      'INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['r', '2026-10-06', 'tpl-1', '{}', '{"name":"운동한 날","questions":[]}', TS2, TS2],
    ),
  ).resolves.toBeDefined();
  await expect(
    db.runAsync('INSERT INTO templates (id, name, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      't', '  ', '[]', TS2, TS2,
    ]),
  ).rejects.toThrow();
});
```

기존 첫 테스트의 기대값도 바꾼다: 테이블 목록에 `'templates'`를 추가하고 `user_version`은 `2`.

```ts
  expect(tables.map((t) => t.name)).toEqual(['days', 'items', 'outbox', 'reflections', 'sync_state', 'templates']);
  expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
```

- [ ] **Step 2: 실패 확인** — `npx jest src/db/schema.test.ts` → FAIL

- [ ] **Step 3: 구현** — `MIGRATIONS` 배열 끝에 두 번째 항목을 추가하고 `migrate`에 `target`을 받는다.

```ts
  `
  CREATE TABLE items_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('task', 'note')),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    status TEXT CHECK (status IN ('open', 'doing', 'done', 'migrated')),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
    migrated_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK ((kind = 'task') = (status IS NOT NULL))
  );
  INSERT INTO items_v2 (id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at)
  SELECT id, date,
    CASE WHEN kind = 'event' THEN 'task' ELSE kind END,
    text,
    CASE WHEN kind = 'event' THEN 'open' WHEN status = 'dropped' THEN 'open' ELSE status END,
    0, migrated_from, created_at, updated_at,
    CASE WHEN status = 'dropped' THEN COALESCE(deleted_at, updated_at) ELSE deleted_at END
  FROM items;
  DROP TABLE items;
  ALTER TABLE items_v2 RENAME TO items;
  CREATE INDEX items_date ON items (date);

  CREATE TABLE reflections_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    template TEXT NOT NULL CHECK (length(template) > 0),
    answers TEXT NOT NULL,
    snapshot TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  INSERT INTO reflections_v2 (id, date, template, answers, snapshot, created_at, updated_at, deleted_at)
  SELECT id, date, template, answers, NULL, created_at, updated_at, deleted_at FROM reflections;
  DROP TABLE reflections;
  ALTER TABLE reflections_v2 RENAME TO reflections;
  CREATE INDEX reflections_date ON reflections (date);

  CREATE TABLE templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    questions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  `,
```

```ts
// target은 테스트에서 이전 버전 데이터를 만들 때만 쓴다.
export async function migrate(db: Db, target = MIGRATIONS.length): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  for (let v = row?.user_version ?? 0; v < target; v++) {
    await db.transaction(async (tx) => {
      await tx.execAsync(MIGRATIONS[v]);
      await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
```

변환한 행의 `updated_at`은 바꾸지 않는다. 서버 마이그레이션(Task 8)이 같은 변환을 하므로 동기화 시 충돌이 생기지 않는다.

- [ ] **Step 4: 통과 확인** — `npx jest src/db` → PASS. 다른 스위트는 Task 3~6에서 맞춘다.

- [ ] **Step 5: 커밋** — `git add mobile/src/db && git commit -m "feat: 로컬 스키마 v2(진행 중, 중요, 일정 통합, 템플릿 테이블)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 3: 동기화 테이블과 변환

**Files:**
- Modify: `mobile/src/sync/tables.ts`, `mobile/src/sync/codec.ts`, `mobile/test/fakeRemote.ts`
- Test: `mobile/src/sync/codec.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** (`codec.test.ts` 끝에)

```ts
test('priority는 로컬 0/1 ↔ 서버 boolean', () => {
  const row = { id: 'i', date: '2026-10-07', kind: 'task', text: 'a', status: 'open', priority: 1, migrated_from: null,
    created_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null };
  expect(toRemote('items', row).priority).toBe(true);
  expect(fromRemote('items', { ...toRemote('items', row), priority: false }).priority).toBe(0);
});

test('templates.questions와 reflections.snapshot은 JSON으로 오간다', () => {
  const t = { id: 't', name: '운동한 날', questions: '[{"key":"q1","text":"무슨 운동?"}]',
    created_at: '2026-10-07T00:00:00.000Z', updated_at: '2026-10-07T00:00:00.000Z', deleted_at: null };
  expect(toRemote('templates', t).questions).toEqual([{ key: 'q1', text: '무슨 운동?' }]);
  expect(fromRemote('templates', toRemote('templates', t)).questions).toBe(t.questions);
  const r = fromRemote('reflections', { id: 'r', date: '2026-10-07', template: 't', answers: {}, snapshot: null,
    created_at: '2026-10-07T00:00:00+00:00', updated_at: '2026-10-07T00:00:00+00:00', deleted_at: null });
  expect(r.snapshot).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/sync/codec.test.ts` → FAIL (`templates` 없음)

- [ ] **Step 3: 구현**

`tables.ts`:

```ts
export const TABLES = {
  items: {
    key: 'id',
    columns: ['id', 'date', 'kind', 'text', 'status', 'priority', 'migrated_from', 'created_at', 'updated_at', 'deleted_at'],
  },
  days: {
    key: 'date',
    columns: ['date', 'mood', 'updated_at', 'deleted_at'],
  },
  reflections: {
    key: 'id',
    columns: ['id', 'date', 'template', 'answers', 'snapshot', 'created_at', 'updated_at', 'deleted_at'],
  },
  templates: {
    key: 'id',
    columns: ['id', 'name', 'questions', 'created_at', 'updated_at', 'deleted_at'],
  },
} as const;
```

`codec.ts`:

```ts
const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at']);
const JSON_COLUMNS = new Set(['answers', 'questions', 'snapshot']);
const BOOLEAN_COLUMNS = new Set(['priority']);

export function toRemote(table: TableName, row: Row): RemoteRow {
  const out: RemoteRow = {};
  for (const column of TABLES[table].columns) {
    const value = row[column] ?? null;
    if (BOOLEAN_COLUMNS.has(column)) out[column] = value === 1;
    else out[column] = JSON_COLUMNS.has(column) && typeof value === 'string' ? JSON.parse(value) : value;
  }
  return out;
}

// 로컬 LWW 비교는 문자열 비교이므로 시각을 항상 toISOString() 형식으로 맞춘다.
export function fromRemote(table: TableName, remote: RemoteRow): Row {
  const out: Row = {};
  for (const column of TABLES[table].columns) {
    const value = remote[column] ?? null;
    if (BOOLEAN_COLUMNS.has(column)) out[column] = value === true ? 1 : 0;
    else if (value === null) out[column] = null;
    else if (TIMESTAMP_COLUMNS.has(column)) out[column] = normalizeTimestamp(String(value));
    else if (JSON_COLUMNS.has(column)) out[column] = JSON.stringify(value);
    else out[column] = value as SqlParam;
  }
  return out;
}
```

`test/fakeRemote.ts`: 테이블별 저장소를 고정 키 대신 `TABLE_NAMES`로 만든다.

```ts
import { TABLES, TABLE_NAMES, type TableName } from '../src/sync/tables';
// ...
  const store = Object.fromEntries(TABLE_NAMES.map((t) => [t, new Map<string, RemoteRow>()])) as Record<
    TableName,
    Map<string, RemoteRow>
  >;
```

- [ ] **Step 4: 통과 확인** — `npx jest src/sync` → PASS. 기존 codec 테스트의 `reflections` 기대값에 `snapshot: null`이 빠져 있으면 추가한다.

- [ ] **Step 5: 커밋** — `git add mobile/src/sync mobile/test && git commit -m "feat: templates 동기화와 priority·JSON 컬럼 변환" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 4: 할 일 규칙

**Files:**
- Modify: `mobile/src/items/repo.ts`
- Test: `mobile/src/items/repo.test.ts`

규칙: 상태는 `open → doing → done → open`. 중요(`priority`)는 할 일에만, 같은 날 안 끝낸 할 일 중 최대 3개. 목록 정렬은 진행 중 → 중요 → 나머지(입력 순) → 끝냄·옮김. 이월 후보는 이전 날짜의 `open`·`doing` 할 일. "내일로"는 원래 항목을 `migrated`로, 내일 날짜로 새 `open` 항목을 만든다. 이월된 새 항목의 중요 표시는 초기화한다(하루 3개 규칙 때문).

- [ ] **Step 1: 테스트 교체** — `toggleDone`, `dropItem` 관련 테스트를 지우고 아래를 추가한다. 상단 import는 `addItem, advanceStatus, deleteItem, listItemsForDate, listMigrationCandidates, migrateToToday, migrateToTomorrow, setPriority`로 바꾼다.

```ts
test('advanceStatus: 할 일 → 진행 중 → 끝냄 → 할 일', async () => {
  const item = await addItem(db, { kind: 'task', text: 'a' }, MON);
  const statusOf = async () => (await listItemsForDate(db, '2026-10-05'))[0].status;
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('doing');
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('done');
  await advanceStatus(db, item.id, MON);
  expect(await statusOf()).toBe('open');
});

test('advanceStatus: 메모는 거부한다', async () => {
  const note = await addItem(db, { kind: 'note', text: 'n' }, MON);
  await expect(advanceStatus(db, note.id, MON)).rejects.toThrow('상태를 바꿀 수 없는');
});

test('setPriority: 같은 날 안 끝낸 할 일 3개까지', async () => {
  const ids = [];
  for (const t of ['a', 'b', 'c', 'd']) ids.push((await addItem(db, { kind: 'task', text: t }, MON)).id);
  for (const id of ids.slice(0, 3)) await setPriority(db, id, true, MON);
  await expect(setPriority(db, ids[3], true, MON)).rejects.toThrow('하루 3개까지');
  await advanceStatus(db, ids[0], MON);
  await advanceStatus(db, ids[0], MON); // done → 자리가 빈다
  await expect(setPriority(db, ids[3], true, MON)).resolves.toBeUndefined();
});

test('setPriority: 메모는 거부, 끄기는 언제나 된다', async () => {
  const note = await addItem(db, { kind: 'note', text: 'n' }, MON);
  await expect(setPriority(db, note.id, true, MON)).rejects.toThrow('메모');
  const t = await addItem(db, { kind: 'task', text: 't' }, MON);
  await setPriority(db, t.id, true, MON);
  await setPriority(db, t.id, false, MON);
  expect((await listItemsForDate(db, '2026-10-05')).find((i) => i.id === t.id)?.priority).toBe(false);
});

test('listItemsForDate 정렬: 진행 중 → 중요 → 나머지 → 끝냄', async () => {
  const a = await addItem(db, { kind: 'task', text: 'a' }, new Date(2026, 9, 5, 9, 0));
  const b = await addItem(db, { kind: 'task', text: 'b' }, new Date(2026, 9, 5, 9, 1));
  const c = await addItem(db, { kind: 'note', text: 'c' }, new Date(2026, 9, 5, 9, 2));
  const d = await addItem(db, { kind: 'task', text: 'd' }, new Date(2026, 9, 5, 9, 3));
  const e = await addItem(db, { kind: 'task', text: 'e' }, new Date(2026, 9, 5, 9, 4));
  await advanceStatus(db, a.id, MON);
  await advanceStatus(db, a.id, MON); // a: done
  await advanceStatus(db, e.id, MON); // e: doing
  await setPriority(db, d.id, true, MON); // d: 중요
  expect((await listItemsForDate(db, '2026-10-05')).map((i) => i.text)).toEqual(['e', 'd', 'b', 'c', 'a']);
});

test('migrateToTomorrow: 원래는 migrated, 내일 날짜로 새 할 일', async () => {
  const old = await addItem(db, { kind: 'task', text: '운동' }, MON);
  await setPriority(db, old.id, true, MON);
  const created = await migrateToTomorrow(db, old.id, TUE);
  expect(created).toMatchObject({ date: '2026-10-07', status: 'open', priority: false, migrated_from: old.id });
  expect((await listItemsForDate(db, '2026-10-05'))[0].status).toBe('migrated');
});

test('listMigrationCandidates: 진행 중이던 지난 할 일도 포함', async () => {
  const doing = await addItem(db, { kind: 'task', text: 'doing' }, MON);
  await advanceStatus(db, doing.id, MON);
  expect((await listMigrationCandidates(db, '2026-10-06')).map((c) => c.id)).toEqual([doing.id]);
});

test('addItem: 일정 종류는 거부한다', async () => {
  await expect(addItem(db, { kind: 'event' as never, text: 'x' }, MON)).rejects.toThrow('종류');
});
```

기존 테스트 중 `addItem: 메모와 일정은 status가 없다` 이름에서 "일정"을 빼고, 새 항목의 기대값에 `priority: false`를 추가한다.

- [ ] **Step 2: 실패 확인** — `npx jest src/items` → FAIL

- [ ] **Step 3: 구현** — `repo.ts`를 아래로 바꾼다.

```ts
import type { Db, Tx } from '../db/types';
import { addDays, logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';

export type ItemKind = 'task' | 'note';
export type TaskStatus = 'open' | 'doing' | 'done' | 'migrated';

export type Item = {
  id: string;
  date: string;
  kind: ItemKind;
  text: string;
  status: TaskStatus | null;
  priority: boolean;
  migrated_from: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ItemRow = Omit<Item, 'priority'> & { priority: number };

export const MAX_PRIORITY_PER_DAY = 3;
const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = { open: 'doing', doing: 'done', done: 'open' };
const COLUMNS = 'id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at';
// 진행 중 → 중요 → 나머지(입력 순) → 끝냄·옮김
const ORDER = `CASE WHEN status = 'doing' THEN 0 WHEN status IN ('done', 'migrated') THEN 3
  WHEN priority = 1 THEN 1 ELSE 2 END, created_at`;

const toItem = (row: ItemRow): Item => ({ ...row, priority: row.priority === 1 });

async function insertItem(tx: Tx, item: Item): Promise<void> {
  await tx.runAsync(`INSERT INTO items (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    item.id, item.date, item.kind, item.text, item.status, item.priority ? 1 : 0,
    item.migrated_from, item.created_at, item.updated_at, item.deleted_at,
  ]);
  await markDirty(tx, 'items', item.id);
}

async function requireItem(tx: Tx, id: string): Promise<Item> {
  const row = await tx.getFirstAsync<ItemRow>(`SELECT ${COLUMNS} FROM items WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new Error(`항목을 찾을 수 없습니다: ${id}`);
  return toItem(row);
}

async function update(tx: Tx, id: string, fields: { status?: TaskStatus; priority?: boolean }, now: Date) {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (fields.status !== undefined) { sets.push('status = ?'); params.push(fields.status); }
  if (fields.priority !== undefined) { sets.push('priority = ?'); params.push(fields.priority ? 1 : 0); }
  await tx.runAsync(`UPDATE items SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, now.toISOString(), id]);
  await markDirty(tx, 'items', id);
}

export async function addItem(db: Db, input: { kind: ItemKind; text: string }, now = new Date()): Promise<Item> {
  if (input.kind !== 'task' && input.kind !== 'note') throw new Error('알 수 없는 종류입니다');
  const text = input.text.trim();
  if (!text) throw new Error('내용을 입력하세요');
  const ts = now.toISOString();
  const item: Item = {
    id: newId(), date: logicalDate(now), kind: input.kind, text,
    status: input.kind === 'task' ? 'open' : null, priority: false,
    migrated_from: null, created_at: ts, updated_at: ts, deleted_at: null,
  };
  await db.transaction((tx) => insertItem(tx, item));
  return item;
}

export async function advanceStatus(db: Db, id: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    const next = item.status ? NEXT_STATUS[item.status] : undefined;
    if (!next) throw new Error('상태를 바꿀 수 없는 항목입니다');
    await update(tx, id, { status: next }, now);
  });
}

export async function setPriority(db: Db, id: string, on: boolean, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.kind !== 'task') throw new Error('메모에는 중요 표시를 할 수 없습니다');
    if (on && !item.priority) {
      const row = await tx.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM items WHERE date = ? AND priority = 1 AND deleted_at IS NULL
           AND status IN ('open', 'doing') AND id != ?`,
        [item.date, id],
      );
      if ((row?.n ?? 0) >= MAX_PRIORITY_PER_DAY) throw new Error('중요는 하루 3개까지예요');
    }
    await update(tx, id, { priority: on }, now);
  });
}

async function migrateTo(db: Db, id: string, target: (today: string) => string, now: Date): Promise<Item> {
  const ts = now.toISOString();
  return db.transaction(async (tx) => {
    const item = await requireItem(tx, id);
    if (item.status !== 'open' && item.status !== 'doing') throw new Error('끝나지 않은 할 일만 옮길 수 있습니다');
    const today = logicalDate(now);
    if (item.date >= today) throw new Error('이전 날짜의 할 일만 옮길 수 있습니다');
    await update(tx, id, { status: 'migrated' }, now);
    const created: Item = {
      ...item, id: newId(), date: target(today), status: 'open', priority: false,
      migrated_from: item.id, created_at: ts, updated_at: ts, deleted_at: null,
    };
    await insertItem(tx, created);
    return created;
  });
}

export function migrateToToday(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateTo(db, id, (today) => today, now);
}

export function migrateToTomorrow(db: Db, id: string, now = new Date()): Promise<Item> {
  return migrateTo(db, id, (today) => addDays(today, 1), now);
}

export async function deleteItem(db: Db, id: string, now = new Date()): Promise<void> {
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    await requireItem(tx, id);
    await tx.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', [ts, ts, id]);
    await markDirty(tx, 'items', id);
  });
}

export async function listItemsForDate(db: Db, date: string): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${COLUMNS} FROM items WHERE date = ? AND deleted_at IS NULL ORDER BY ${ORDER}`,
    [date],
  );
  return rows.map(toItem);
}

export async function listMigrationCandidates(db: Db, today: string): Promise<Item[]> {
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${COLUMNS} FROM items
     WHERE kind = 'task' AND status IN ('open', 'doing') AND date < ? AND deleted_at IS NULL
     ORDER BY date, created_at`,
    [today],
  );
  return rows.map(toItem);
}
```

기존 `migrateToToday` 테스트의 오류 문구 기대값은 `'열린 할 일만'`에서 `'끝나지 않은 할 일만'`으로 바꾼다.

- [ ] **Step 4: 통과 확인** — `npx jest src/items src/stats` → PASS

- [ ] **Step 5: 커밋** — `git add mobile/src/items && git commit -m "feat: 진행 중 상태, 하루 3개 중요 표시, 내일로 이월, 목록 정렬" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 5: 템플릿 정의와 사용자 템플릿

**Files:**
- Replace: `mobile/src/reflections/templates.ts`
- Create: `mobile/src/reflections/templateRepo.ts`
- Test: `mobile/src/reflections/templateRepo.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** (`templateRepo.test.ts`)

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { createTemplate, deleteTemplate, findTemplate, listTemplates, updateTemplate } from './templateRepo';

const NOW = new Date(2026, 9, 7, 21, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기본 템플릿 3개가 먼저, 사용자 템플릿은 그 뒤에', async () => {
  await createTemplate(db, { name: ' 운동한 날 ', questions: ['무슨 운동?', '', '몸은?'] }, NOW);
  const list = await listTemplates(db);
  expect(list.map((t) => t.name)).toEqual(['무기력했던 날', '감사한 날', '자유 일지', '운동한 날']);
  expect(list[3]).toMatchObject({ builtin: false, questions: [{ key: 'q1', text: '무슨 운동?' }, { key: 'q2', text: '몸은?' }] });
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'templates'", [])).toHaveLength(1);
});

test('이름이나 질문이 비면 거부, 질문은 3개까지', async () => {
  await expect(createTemplate(db, { name: ' ', questions: ['a'] }, NOW)).rejects.toThrow('이름');
  await expect(createTemplate(db, { name: 'x', questions: [' '] }, NOW)).rejects.toThrow('질문');
  await expect(createTemplate(db, { name: 'x', questions: ['a', 'b', 'c', 'd'] }, NOW)).rejects.toThrow('3개');
});

test('수정과 삭제는 사용자 템플릿만', async () => {
  const t = await createTemplate(db, { name: '운동한 날', questions: ['무슨 운동?'] }, NOW);
  await updateTemplate(db, t.id, { name: '걷기', questions: ['얼마나 걸었나요?'] }, NOW);
  expect(await findTemplate(db, t.id)).toMatchObject({ name: '걷기', questions: [{ key: 'q1', text: '얼마나 걸었나요?' }] });
  await deleteTemplate(db, t.id, NOW);
  expect(await findTemplate(db, t.id)).toBeNull();
  expect((await listTemplates(db)).map((x) => x.name)).not.toContain('걷기');
  await expect(updateTemplate(db, 'gratitude', { name: 'x', questions: ['y'] }, NOW)).rejects.toThrow('기본 템플릿');
  await expect(deleteTemplate(db, 'gratitude', NOW)).rejects.toThrow('기본 템플릿');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/reflections/templateRepo.test.ts` → `Cannot find module './templateRepo'`

- [ ] **Step 3: 구현**

`templates.ts`(교체):

```ts
export type TemplateQuestion = { key: string; text: string };
export type TemplateDef = { id: string; name: string; builtin: boolean; questions: TemplateQuestion[] };

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'lethargy', name: '무기력했던 날', builtin: true,
    questions: [
      { key: 'cause', text: '무기력의 원인으로 짐작되는 것은?' },
      { key: 'recovery', text: '오늘을 회복의 시간으로 본다면 무엇을 채웠나요?' },
    ],
  },
  { id: 'gratitude', name: '감사한 날', builtin: true, questions: [{ key: 'good', text: '오늘 좋았던 일 3가지와 그 이유' }] },
  { id: 'free', name: '자유 일지', builtin: true, questions: [{ key: 'body', text: '자유롭게 쓰기' }] },
];

// 더 이상 고를 수 없지만 지난 회고를 읽을 때 쓰는 템플릿
export const LEGACY_TEMPLATES: TemplateDef[] = [
  {
    id: 'perfectionism', name: '완벽주의가 올라온 날', builtin: true,
    questions: [
      { key: 'want', text: '무엇을 완벽하게 하고 싶었나요?' },
      { key: 'reframe', text: '"지금 완벽주의 반응이 올라온 것뿐"이라고 보면 무엇이 달라지나요?' },
    ],
  },
];

export const MAX_TEMPLATE_QUESTIONS = 3;
```

`templateRepo.ts`:

```ts
import type { Db } from '../db/types';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { BUILTIN_TEMPLATES, MAX_TEMPLATE_QUESTIONS, type TemplateDef, type TemplateQuestion } from './templates';

type TemplateRow = { id: string; name: string; questions: string; created_at: string };
export type TemplateInput = { name: string; questions: string[] };

function normalize(input: TemplateInput): { name: string; questions: TemplateQuestion[] } {
  const name = input.name.trim();
  if (!name) throw new Error('템플릿 이름을 적어 주세요');
  const texts = input.questions.map((q) => q.trim()).filter(Boolean);
  if (texts.length === 0) throw new Error('질문을 하나 이상 적어 주세요');
  if (texts.length > MAX_TEMPLATE_QUESTIONS) throw new Error('질문은 3개까지예요');
  return { name, questions: texts.map((text, i) => ({ key: `q${i + 1}`, text })) };
}

const toDef = (row: TemplateRow): TemplateDef => ({
  id: row.id, name: row.name, builtin: false, questions: JSON.parse(row.questions) as TemplateQuestion[],
});

function assertCustom(id: string) {
  if (BUILTIN_TEMPLATES.some((t) => t.id === id)) throw new Error('기본 템플릿은 바꿀 수 없어요');
}

export async function createTemplate(db: Db, input: TemplateInput, now = new Date()): Promise<TemplateDef> {
  const { name, questions } = normalize(input);
  const ts = now.toISOString();
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.runAsync(
      'INSERT INTO templates (id, name, questions, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
      [id, name, JSON.stringify(questions), ts, ts],
    );
    await markDirty(tx, 'templates', id);
  });
  return { id, name, builtin: false, questions };
}

export async function updateTemplate(db: Db, id: string, input: TemplateInput, now = new Date()): Promise<void> {
  assertCustom(id);
  const { name, questions } = normalize(input);
  await db.transaction(async (tx) => {
    const r = await tx.runAsync(
      'UPDATE templates SET name = ?, questions = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      [name, JSON.stringify(questions), now.toISOString(), id],
    );
    if (r.changes === 0) throw new Error('템플릿을 찾을 수 없습니다');
    await markDirty(tx, 'templates', id);
  });
}

export async function deleteTemplate(db: Db, id: string, now = new Date()): Promise<void> {
  assertCustom(id);
  const ts = now.toISOString();
  await db.transaction(async (tx) => {
    const r = await tx.runAsync('UPDATE templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [ts, ts, id]);
    if (r.changes === 0) throw new Error('템플릿을 찾을 수 없습니다');
    await markDirty(tx, 'templates', id);
  });
}

export async function listTemplates(db: Db): Promise<TemplateDef[]> {
  const rows = await db.getAllAsync<TemplateRow>(
    'SELECT id, name, questions, created_at FROM templates WHERE deleted_at IS NULL ORDER BY created_at',
    [],
  );
  return [...BUILTIN_TEMPLATES, ...rows.map(toDef)];
}

export async function findTemplate(db: Db, id: string): Promise<TemplateDef | null> {
  const builtin = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (builtin) return builtin;
  const row = await db.getFirstAsync<TemplateRow>(
    'SELECT id, name, questions, created_at FROM templates WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  return row ? toDef(row) : null;
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/reflections/templateRepo.test.ts` → PASS (repo.test.ts는 Task 6에서 맞춘다)

- [ ] **Step 5: 커밋** — `git add mobile/src/reflections && git commit -m "feat: 기본 템플릿 정리와 사용자 템플릿 저장소" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 6: 회고에 템플릿 스냅샷 저장

**Files:**
- Modify: `mobile/src/reflections/repo.ts`
- Test: `mobile/src/reflections/repo.test.ts`

- [ ] **Step 1: 테스트 교체** (`repo.test.ts` 전체)

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addReflection, listReflections } from './repo';
import { createTemplate, deleteTemplate } from './templateRepo';

const NOW = new Date(2026, 9, 6, 23, 0);
let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

test('기본 템플릿 답변을 정리해 저장하고 이름·질문과 함께 읽는다', async () => {
  const saved = await addReflection(db, { templateId: 'lethargy', answers: { cause: ' 잠 부족 ', recovery: '', x: '무시' } }, NOW);
  expect(saved).toMatchObject({ date: '2026-10-06', template: 'lethargy', answers: { cause: '잠 부족' } });
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '무기력했던 날', answers: { cause: '잠 부족' } });
  expect(r.questions.map((q) => q.key)).toEqual(['cause', 'recovery']);
  expect(await db.getAllAsync("SELECT row_key FROM outbox WHERE table_name = 'reflections'", [])).toEqual([{ row_key: saved.id }]);
});

test('사용자 템플릿을 지워도 지난 회고는 스냅샷으로 읽힌다', async () => {
  const t = await createTemplate(db, { name: '운동한 날', questions: ['무슨 운동?'] }, NOW);
  await addReflection(db, { templateId: t.id, answers: { q1: '달리기' } }, NOW);
  await deleteTemplate(db, t.id, NOW);
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '운동한 날', questions: [{ key: 'q1', text: '무슨 운동?' }], answers: { q1: '달리기' } });
  await expect(addReflection(db, { templateId: t.id, answers: { q1: 'x' } }, NOW)).rejects.toThrow('템플릿을 찾을 수 없');
});

test('스냅샷 없는 예전 회고(완벽주의)도 이름과 질문을 복원한다', async () => {
  await db.runAsync(
    'INSERT INTO reflections (id, date, template, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ['old', '2026-10-06', 'perfectionism', '{"want":"다 잘하고 싶었다"}', '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z'],
  );
  const [r] = await listReflections(db, '2026-10-06');
  expect(r).toMatchObject({ templateName: '완벽주의가 올라온 날', answers: { want: '다 잘하고 싶었다' } });
});

test('모든 답변이 비어 있으면 거부한다', async () => {
  await expect(addReflection(db, { templateId: 'gratitude', answers: { good: '  ' } }, NOW)).rejects.toThrow('하나 이상');
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/reflections` → FAIL

- [ ] **Step 3: 구현** — `repo.ts`를 아래로 바꾼다.

```ts
import type { Db } from '../db/types';
import { logicalDate } from '../lib/date';
import { newId } from '../lib/id';
import { markDirty } from '../sync/outbox';
import { findTemplate } from './templateRepo';
import { BUILTIN_TEMPLATES, LEGACY_TEMPLATES, type TemplateQuestion } from './templates';

type Snapshot = { name: string; questions: TemplateQuestion[] };

export type Reflection = {
  id: string;
  date: string;
  template: string;
  templateName: string;
  questions: TemplateQuestion[];
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ReflectionRow = {
  id: string; date: string; template: string; answers: string; snapshot: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

function resolveSnapshot(row: ReflectionRow): Snapshot {
  if (row.snapshot) return JSON.parse(row.snapshot) as Snapshot;
  const known = [...BUILTIN_TEMPLATES, ...LEGACY_TEMPLATES].find((t) => t.id === row.template);
  return known ? { name: known.name, questions: known.questions } : { name: '회고', questions: [] };
}

export async function addReflection(
  db: Db,
  input: { templateId: string; answers: Record<string, string> },
  now = new Date(),
): Promise<Reflection> {
  const def = await findTemplate(db, input.templateId);
  if (!def) throw new Error('템플릿을 찾을 수 없습니다');
  const answers: Record<string, string> = {};
  for (const q of def.questions) {
    const value = (input.answers[q.key] ?? '').trim();
    if (value) answers[q.key] = value;
  }
  if (Object.keys(answers).length === 0) throw new Error('답변을 하나 이상 입력하세요');

  const ts = now.toISOString();
  const snapshot: Snapshot = { name: def.name, questions: def.questions };
  const reflection: Reflection = {
    id: newId(), date: logicalDate(now), template: def.id, templateName: def.name, questions: def.questions,
    answers, created_at: ts, updated_at: ts, deleted_at: null,
  };
  await db.transaction(async (tx) => {
    await tx.runAsync(
      `INSERT INTO reflections (id, date, template, answers, snapshot, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [reflection.id, reflection.date, reflection.template, JSON.stringify(answers), JSON.stringify(snapshot), ts, ts],
    );
    await markDirty(tx, 'reflections', reflection.id);
  });
  return reflection;
}

export async function listReflections(db: Db, date: string): Promise<Reflection[]> {
  const rows = await db.getAllAsync<ReflectionRow>(
    `SELECT id, date, template, answers, snapshot, created_at, updated_at, deleted_at
     FROM reflections WHERE date = ? AND deleted_at IS NULL ORDER BY created_at`,
    [date],
  );
  return rows.map((r) => {
    const snap = resolveSnapshot(r);
    return {
      id: r.id, date: r.date, template: r.template, templateName: snap.name, questions: snap.questions,
      answers: JSON.parse(r.answers) as Record<string, string>,
      created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
    };
  });
}
```

`src/stats/recordedDays.test.ts`가 `addReflection(db, { template: 'free', ... })`를 쓰면 `{ templateId: 'free', ... }`로 바꾼다.

- [ ] **Step 4: 통과 확인** — `npx jest` (전체) → PASS. 타입 오류는 화면 두 곳만 남는다(Task 7).

- [ ] **Step 5: 커밋** — `git add mobile/src && git commit -m "feat: 회고에 템플릿 스냅샷을 저장하고 지난 회고 복원" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 7: 화면을 새 API에 연결 (최소 변경)

**Files:**
- Modify: `mobile/src/screens/TodayScreen.tsx`, `mobile/src/screens/EveningScreen.tsx`

화면 디자인은 계획 B에서 바꾼다. 여기서는 타입 체크를 통과하고 새 규칙대로 동작하게만 한다.

- [ ] **Step 1: TodayScreen**
  - import: `dropItem`, `toggleDone` 대신 `advanceStatus`, `migrateToTomorrow`, `setPriority`를 가져온다.
  - `KINDS`에서 `event` 항목을 지운다.
  - 상태 이름 함수: `event`, `dropped` 분기를 지우고 `if (item.status === 'doing') return '진행 중';`을 추가한다.
  - `symbolOf`: `event` 분기를 지우고 `doing`은 `'◐'`, `done`은 `'✓'`를 돌려준다.
  - 이월 후보의 "나중으로" 버튼은 `later` 상태 대신 `run(() => migrateToTomorrow(db, c.id))`를 부르고, 글자는 "내일로"로 바꾼다. `later` 상태와 필터는 지운다.
  - 이월 후보의 "버리기"는 "지우기"로 바꾸고, 목록의 삭제와 같은 확인 창을 거쳐 `deleteItem(db, c.id)`를 부른다.

    ```tsx
    onPress={() =>
      Alert.alert('항목 삭제', `"${c.text}"을(를) 삭제할까요?`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => run(() => deleteItem(db, c.id)) },
      ])
    }
    ```

  - 목록 행: `toggleable`은 `item.kind === 'task' && item.status !== 'migrated'`, 누르면 `run(() => advanceStatus(db, item.id))`. 접근성 상태는 `{ checked: item.status === 'done' }`.
  - 목록 행을 길게 누르면 중요 표시를 켜고 끈다(계획 B에서 ⋯ 메뉴로 바꾼다): `onLongPress={() => item.kind === 'task' && run(() => setPriority(db, item.id, !item.priority))}`. 중요한 할 일은 글자 스타일에 `backgroundColor: '#F1DE8A'`를 더한다.
  - `dropped` 스타일 분기를 지운다.

- [ ] **Step 2: EveningScreen**
  - import: `TEMPLATES`, `TEMPLATE_KEYS`, `TemplateKey` 대신 `listTemplates`(`../reflections/templateRepo`)와 `TemplateDef`(`../reflections/templates`)를 가져온다.
  - 상태: `const [templates, setTemplates] = useState<TemplateDef[]>([]);`, `template`은 `string | null`, `answers`는 `Record<string, Record<string, string>>`.
  - 불러오기 `Promise.all`에 `listTemplates(db)`를 더해 `setTemplates`로 넣는다.
  - 칩: `templates.map((t) => ...)`로 바꾸고 라벨은 `t.name`, 키는 `t.id`.
  - 질문: `templates.find((t) => t.id === template)?.questions ?? []`.
  - 저장: `addReflection(db, { templateId: template, answers: answers[template] ?? {} })`.
  - 저장된 회고 표시: `r.templateName`, `r.questions.filter((q) => r.answers[q.key])`.

- [ ] **Step 3: 확인**

```bash
npm run typecheck
npx jest
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir /tmp/nanal-export
```

Expected: 타입 오류 없음, 전체 테스트 통과, 번들 성공(출력은 커밋하지 않는다)

- [ ] **Step 4: 커밋** — `git add mobile/src/screens && git commit -m "refactor: 오늘·저녁 화면을 규칙 v2 API에 연결" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 8: Supabase 스키마 v2

**Files:**
- Create: `supabase/migrations/20261007000000_rules_v2.sql`
- Create: `supabase/tests/rules_v2.test.sql`

- [ ] **Step 1: 실패하는 pgTAP 테스트 작성** (`rules_v2.test.sql`)

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-07', 'event', 'x', null, now(), now()) $$,
  '23514', null, '일정 종류는 거부된다');
select throws_ok(
  $$ insert into public.items (id, date, kind, text, status, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000002', '2026-10-07', 'task', 'x', 'dropped', now(), now()) $$,
  '23514', null, '놓아준 일 상태는 거부된다');
select lives_ok(
  $$ insert into public.items (id, date, kind, text, status, priority, created_at, updated_at)
     values ('aaaaaaaa-0000-0000-0000-000000000003', '2026-10-07', 'task', 'x', 'doing', true, now(), now()) $$,
  '진행 중 + 중요 표시 할 일은 저장된다');
select is((select priority from public.items where id = 'aaaaaaaa-0000-0000-0000-000000000003'), true, 'priority가 저장된다');
select lives_ok(
  $$ insert into public.reflections (id, date, template, answers, snapshot, created_at, updated_at)
     values ('bbbbbbbb-0000-0000-0000-000000000001', '2026-10-07', 'cccccccc-0000-0000-0000-000000000001',
             '{"q1":"달리기"}', '{"name":"운동한 날","questions":[]}', now(), now()) $$,
  '사용자 템플릿 회고와 스냅샷이 저장된다');
insert into public.templates (id, name, questions, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', '운동한 날', '[{"key":"q1","text":"무슨 운동?"}]', now(), now());

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.templates), 0, 'B는 A의 템플릿을 못 본다');
select throws_ok(
  $$ insert into public.templates (id, user_id, name, questions, created_at, updated_at)
     values ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'x', '[]', now(), now()) $$,
  '42501', null, 'B는 A 명의로 템플릿을 쓸 수 없다');

reset role;
select ok(not has_table_privilege('anon', 'public.templates', 'select'), 'anon은 templates를 읽을 수 없다');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** (저장소 루트, Docker 실행 중)

```bash
supabase start
supabase db reset
supabase test db
```

Expected: `rules_v2.test.sql`에서 FAIL(`templates` 없음 등)

- [ ] **Step 3: 마이그레이션 작성** (`20261007000000_rules_v2.sql`)

```sql
-- 규칙 v2: 일정 → 할 일, 놓아준 일 제거, 진행 중·중요, 사용자 템플릿과 회고 스냅샷
-- 변환한 행의 updated_at은 바꾸지 않는다(앱의 로컬 마이그레이션도 같은 변환을 한다).
update public.items set kind = 'task', status = 'open' where kind = 'event';
update public.items set status = 'open', deleted_at = coalesce(deleted_at, updated_at) where status = 'dropped';

alter table public.items drop constraint if exists items_kind_check;
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_kind_check check (kind in ('task', 'note'));
alter table public.items add constraint items_status_check check (status in ('open', 'doing', 'done', 'migrated'));
alter table public.items add column priority boolean not null default false;

alter table public.reflections drop constraint if exists reflections_template_check;
alter table public.reflections add constraint reflections_template_check check (length(template) > 0);
alter table public.reflections add column snapshot jsonb;

create table public.templates (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  questions jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);
create index templates_user_synced on public.templates (user_id, synced_at);

create trigger templates_lww before insert or update on public.templates
  for each row execute function public.apply_lww();

alter table public.templates enable row level security;
create policy templates_select on public.templates for select to authenticated
  using (user_id = (select auth.uid()));
create policy templates_insert on public.templates for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy templates_update on public.templates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- RLS 외에 권한으로도 막는다.
revoke all on public.templates from anon, authenticated;
grant select, insert, update on public.templates to authenticated;
```

- [ ] **Step 4: 통과 확인**

```bash
supabase db reset
supabase test db
supabase stop
```

Expected: `rls.test.sql .. ok`, `rules_v2.test.sql .. ok`, `All tests successful.`

`items_kind_check` 등 제약 이름이 다르다는 오류가 나면 `supabase db reset` 후 `select conname from pg_constraint where conrelid = 'public.items'::regclass;`로 실제 이름을 확인해 `drop constraint` 줄을 맞춘다. 기존 `rls.test.sql`의 `insert into public.items`는 `priority` 기본값 때문에 그대로 통과해야 한다.

- [ ] **Step 5: 커밋** (저장소 루트) — `git add supabase && git commit -m "feat: Supabase 스키마 v2(진행 중·중요, 일정 통합, 사용자 템플릿)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 9: 운영 Supabase에 적용 (사용자 확인 후)

운영 DB를 바꾸는 단계라 사용자에게 확인을 받고 진행한다. 이 프로젝트는 CLI 연결 대신 SQL Editor로 첫 마이그레이션을 적용했으므로 같은 방식을 쓴다.

- [ ] **Step 1:** `pbcopy < supabase/migrations/20261007000000_rules_v2.sql`로 복사한 뒤, 사용자에게 Supabase 대시보드 → SQL Editor에 붙여 넣고 Run 하도록 안내한다.
- [ ] **Step 2: 확인** — 공개 키로 비로그인 접근이 계속 막히는지 확인한다.

```bash
K=<publishable key>; U=https://xckbdxtgfcvdacwrolvb.supabase.co
curl -s -H "apikey: $K" "$U/rest/v1/templates?select=*&limit=1"
```

Expected: `"code":"42501"` (권한 없음). 테이블이 없다는 `PGRST205`가 나오면 SQL이 적용되지 않은 것이다.

- [ ] **Step 3:** 앱을 실행해(`npx expo start --tunnel`) 오늘 화면에서 할 일 상태 전이, 길게 눌러 중요 표시, 지난 할 일 "내일로", 저녁 마무리 회고 저장이 되는지, 몇 초 뒤 Table Editor의 `items.priority`, `reflections.snapshot`에 값이 들어오는지 확인한다.

---

## 스펙 대비 확인

| 스펙 11절 | 구현 |
|---|---|
| 11.2 상태 open→doing→done, `dropped` 제거, 일정 통합 | Task 2, 4, 8 |
| 11.2 중요 하루 3개, 정렬 | Task 4 |
| 11.3 오늘 하기 / 내일로 / 지우기 | Task 1, 4, 7 |
| 11.7 데이터 모델(`priority`, `kind`, `status`) | Task 2, 3, 8 |
| 11.8 사용자 템플릿, 스냅샷, 완벽주의 제거 | Task 5, 6, 8 |
| 화면 개편(11.1, 11.4) | 계획 B |
| 말로 적기, 위젯(11.5, 11.6) | 계획 C |
