import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_GROUP, DB_DIR, DB_NAME } from '../db/location';
import { MOOD_WORDS } from '../days/moods';
import { WIDGET_SQL } from './sql';

const TARGET = join(__dirname, '../../targets/widget');
const read = (name: string) => readFileSync(join(TARGET, name), 'utf8');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

// Swift의 `static let name = """ ... """`를 읽는다.
function swiftStrings(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/static let (\w+) = """\n([\s\S]*?)\n\s*"""/g)) out[m[1]] = m[2];
  return out;
}

describe('위젯 Swift가 앱과 같은 규칙을 쓴다', () => {
  it('SharedSQL.swift의 SQL이 WIDGET_SQL과 같다', () => {
    const swift = swiftStrings(read('SharedSQL.swift'));
    expect(Object.keys(swift).sort()).toEqual(Object.keys(WIDGET_SQL).sort());
    for (const [name, sql] of Object.entries(WIDGET_SQL)) expect(normalize(swift[name])).toBe(normalize(sql));
  });

  it('App Group과 DB 경로, 기분 낱말이 같다', () => {
    const db = read('NanalDB.swift');
    expect(db).toContain(`"${APP_GROUP}"`);
    expect(db).toContain(`"${DB_DIR}/${DB_NAME}"`);
    expect(db).toContain(`[${MOOD_WORDS.map((w) => `"${w}"`).join(', ')}]`);
  });
});
