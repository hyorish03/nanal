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
];

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
