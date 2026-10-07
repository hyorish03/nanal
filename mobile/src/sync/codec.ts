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
    else if (TIMESTAMP_COLUMNS.has(column)) {
      const str = String(value);
      // 타임존 오프셋을 제거하고 밀리초를 3자리로 정규화한다.
      const match = str.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?/);
      if (match) {
        const [, dateTime, ms] = match;
        const milliseconds = (ms ?? '0').padEnd(3, '0').substring(0, 3);
        out[column] = `${dateTime}.${milliseconds}Z`;
      } else {
        out[column] = new Date(str).toISOString();
      }
    } else if (JSON_COLUMNS.has(column)) out[column] = JSON.stringify(value);
    else out[column] = value as SqlParam;
  }
  return out;
}
