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
  `
  CREATE TABLE monthly_reviews (
    month TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  `,
  // v4: 안 하기(dropped). SQLite는 CHECK를 고칠 수 없어 items를 새로 만들어 옮긴다(행·색인 그대로).
  `
  CREATE TABLE items_v4 (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('task', 'note')),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    status TEXT CHECK (status IN ('open', 'doing', 'done', 'migrated', 'dropped')),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
    migrated_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK ((kind = 'task') = (status IS NOT NULL))
  );
  INSERT INTO items_v4 (id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at)
  SELECT id, date, kind, text, status, priority, migrated_from, created_at, updated_at, deleted_at FROM items;
  DROP TABLE items;
  ALTER TABLE items_v4 RENAME TO items;
  CREATE INDEX items_date ON items (date);
  `,
  // v5: 언젠가(날짜 없는 할 일 한 목록). 오늘 할 일로 옮기면 지우지 않고 migrated로 남기고, 만든 할 일의 id를 migrated_to에 적는다
  `
  CREATE TABLE someday (
    id TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    status TEXT NOT NULL CHECK (status IN ('open', 'done', 'migrated', 'dropped')),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1)),
    migrated_to TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  `,
  // v6: 끌어서 바꾼 줄 순서(position, 분수 순서). 이미 있는 줄은 적은 순서(created_at, id)대로 1, 2, 3…을 매긴다.
  // 오늘 장은 날짜마다, 언젠가는 한 목록 전체에서. 지운 줄도 같이 센다(서버 마이그레이션과 같은 규칙이라 값이 맞는다)
  `
  ALTER TABLE items ADD COLUMN position REAL;
  UPDATE items SET position = (
    SELECT COUNT(*) FROM items AS o
    WHERE o.date = items.date AND (o.created_at < items.created_at OR (o.created_at = items.created_at AND o.id <= items.id))
  );
  ALTER TABLE someday ADD COLUMN position REAL;
  UPDATE someday SET position = (
    SELECT COUNT(*) FROM someday AS o
    WHERE o.created_at < someday.created_at OR (o.created_at = someday.created_at AND o.id <= someday.id)
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
