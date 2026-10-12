import { Directory, File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { APP_GROUP, DB_DIR, DB_NAME, DB_PART_NAME, planDbLocation, sameContents, toFsPath } from './location';
import { migrate } from './schema';
import { serialize } from './serialize';
import type { Db } from './types';

export async function openDb(): Promise<Db> {
  const raw = await openRaw();
  // 위젯이 같은 파일을 읽고 쓰므로 WAL로 읽기와 쓰기가 서로 막지 않게 하고, 잠겨 있으면 잠깐 기다린다.
  await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const db = serialize(raw);
  await migrate(db);
  return db;
}

function sharedDir(): Directory | null {
  const container = Paths.appleSharedContainers?.[APP_GROUP];
  return container ? new Directory(container, DB_DIR) : null;
}

async function openRaw(): Promise<SQLiteDatabase> {
  let dir: Directory | null = null;
  try {
    dir = sharedDir();
    const plan = planDbLocation({
      sharedDir: dir ? toFsPath(dir.uri) : null,
      sharedExists: dir ? new File(dir, DB_NAME).exists : false,
      legacyExists: new File(Paths.document, 'SQLite', DB_NAME).exists,
    });
    if (plan.kind === 'legacy' || !dir) {
      console.log('[db] App Group 폴더 없음, 원래 위치 사용');
      return await openDatabaseAsync(DB_NAME);
    }
    dir.create({ intermediates: true, idempotent: true });
    if (plan.kind === 'move' && !(await moveToShared(dir, plan.dir))) {
      console.log('[db] 공유 폴더로 옮기지 못함, 원래 위치 사용');
      return await openDatabaseAsync(DB_NAME); // 다음 실행에 다시 시도한다
    }
    return await openDatabaseAsync(DB_NAME, undefined, plan.dir);
  } catch (e) {
    // 공유 폴더 쪽에서 무엇이 실패하든 원래 위치로 돌아간다(원본은 건드리지 않았다)
    console.log('[db] 공유 폴더 사용 실패, 원래 위치 사용', e instanceof Error ? e.message : '');
    return openDatabaseAsync(DB_NAME);
  }
}

// 원래 DB를 공유 폴더에 임시 이름으로 복사하고, 같은지 확인한 뒤에만 제 이름으로 바꾼다. 원래 파일은 지우지 않는다.
async function moveToShared(dir: Directory, dirPath: string): Promise<boolean> {
  const part = new File(dir, DB_PART_NAME);
  let ok = false;
  let source: SQLiteDatabase | null = null;
  let copy: SQLiteDatabase | null = null;
  try {
    if (part.exists) part.delete(); // 지난번에 중간에 끊긴 복사본
    source = await openDatabaseAsync(DB_NAME);
    copy = await openDatabaseAsync(DB_PART_NAME, undefined, dirPath);
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: copy });
    ok = await sameContents(source, copy);
  } catch {
    ok = false;
  } finally {
    await copy?.closeAsync().catch(() => undefined);
    await source?.closeAsync().catch(() => undefined);
  }
  try {
    if (!ok) {
      if (part.exists) part.delete();
      return false;
    }
    part.move(new File(dir, DB_NAME));
    return true;
  } catch {
    return false;
  }
}
