import type { Row, SqlParam } from '../db/types';
import type { RemoteRow } from './remote';
import { TABLES, type TableName } from './tables';
import { normalizeTimestamp } from './timestamp';

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at']);
const JSON_COLUMNS = new Set(['answers', 'questions', 'snapshot', 'content']);
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
