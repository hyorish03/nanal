import { openTestDb } from '../../test/sqlite';
import { migrate } from './schema';
import { planDbLocation, sameContents, toFsPath } from './location';

describe('toFsPath', () => {
  it('file:// URI를 SQLite가 받는 경로로 바꾼다', () => {
    expect(toFsPath('file:///private/var/group/nanal/')).toBe('/private/var/group/nanal');
    expect(toFsPath('file:///var/a%20b/nanal')).toBe('/var/a b/nanal');
    expect(toFsPath('/already/path/')).toBe('/already/path');
  });
});

describe('planDbLocation', () => {
  it('공유 폴더가 없으면 원래 자리', () => {
    expect(planDbLocation({ sharedDir: null, sharedExists: false, legacyExists: true })).toEqual({ kind: 'legacy' });
  });
  it('공유 폴더에 이미 있으면 그것을 연다(원래 파일이 남아 있어도)', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: true, legacyExists: true })).toEqual({ kind: 'shared', dir: '/g' });
  });
  it('원래 자리에만 있으면 옮긴다', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: false, legacyExists: true })).toEqual({ kind: 'move', dir: '/g' });
  });
  it('처음 설치면 공유 폴더에 새로 만든다', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: false, legacyExists: false })).toEqual({ kind: 'shared', dir: '/g' });
  });
});

describe('sameContents', () => {
  async function seeded() {
    const db = openTestDb();
    await migrate(db);
    await db.runAsync(
      "INSERT INTO items (id, date, kind, text, status, priority, created_at, updated_at) VALUES ('a', '2026-10-08', 'task', 'x', 'open', 0, 't', 't')",
      [],
    );
    await db.runAsync("INSERT INTO outbox (table_name, row_key) VALUES ('items', 'a')", []);
    return db;
  }

  it('모든 표의 행 수와 스키마 버전이 같으면 true', async () => {
    expect(await sameContents(await seeded(), await seeded())).toBe(true);
  });

  it('행이 하나라도 다르면 false', async () => {
    const dest = await seeded();
    await dest.runAsync('DELETE FROM outbox', []);
    expect(await sameContents(await seeded(), dest)).toBe(false);
  });

  it('스키마 버전이 다르거나 표가 없으면 false', async () => {
    const empty = openTestDb();
    expect(await sameContents(await seeded(), empty)).toBe(false);
    const older = openTestDb();
    await migrate(older, 1);
    expect(await sameContents(await seeded(), older)).toBe(false);
  });
});
