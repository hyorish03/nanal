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
