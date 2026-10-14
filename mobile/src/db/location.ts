import type { Tx } from './types';

// 앱과 위젯이 같이 쓰는 DB 위치(스펙 11.6). Swift(targets/widget/NanalDB.swift)도 같은 값을 쓴다.
export const APP_GROUP = 'group.mengle.zen';
export const DB_DIR = 'nanal';
export const DB_NAME = 'daily-log.db';
export const DB_PART_NAME = 'daily-log.db.part';

export type DbPlan = { kind: 'legacy' } | { kind: 'shared'; dir: string } | { kind: 'move'; dir: string };

export function planDbLocation(input: { sharedDir: string | null; sharedExists: boolean; legacyExists: boolean }): DbPlan {
  if (input.sharedDir === null) return { kind: 'legacy' };
  if (input.sharedExists || !input.legacyExists) return { kind: 'shared', dir: input.sharedDir };
  return { kind: 'move', dir: input.sharedDir };
}

// expo-file-system의 file:// URI → expo-sqlite가 받는 파일 경로(끝 / 없음)
export function toFsPath(uri: string): string {
  const path = uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
  return path.replace(/\/+$/, '');
}

// 복사본이 원본과 같은지: 스키마 버전과 원본의 모든 표 행 수. 복사본에 표가 없으면 쿼리가 실패하므로 false.
export async function sameContents(source: Tx, copy: Tx): Promise<boolean> {
  try {
    const version = 'PRAGMA user_version';
    const a = await source.getFirstAsync<{ user_version: number }>(version, []);
    const b = await copy.getFirstAsync<{ user_version: number }>(version, []);
    if (a?.user_version !== b?.user_version) return false;
    const tables = await source.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      [],
    );
    for (const { name } of tables) {
      const count = `SELECT COUNT(*) AS n FROM "${name}"`;
      const x = await source.getFirstAsync<{ n: number }>(count, []);
      const y = await copy.getFirstAsync<{ n: number }>(count, []);
      if (x?.n !== y?.n) return false;
    }
    return true;
  } catch {
    return false;
  }
}
