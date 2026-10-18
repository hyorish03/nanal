export const TABLES = {
  items: {
    key: 'id',
    // position: 끌어서 바꾼 줄 순서. 서버 마이그레이션 20261016000000_item_position 전에는 서버가 이 열을 몰라
    // items·someday를 올리지 못하고 outbox에 남는다(다른 표는 그대로 오간다)
    // delay_reason: 월초 정리에서 고른 밀린 사유. 서버 마이그레이션 20261019000000_delay_reason 전에는 마찬가지로 items를 올리지 못한다
    columns: ['id', 'date', 'kind', 'text', 'status', 'priority', 'migrated_from', 'delay_reason', 'position', 'created_at', 'updated_at', 'deleted_at'],
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
  monthly_reviews: {
    key: 'month',
    columns: ['month', 'content', 'model', 'created_at', 'updated_at', 'deleted_at'],
  },
  // 언젠가 목록(날짜 없는 할 일). 서버 마이그레이션 20261015000000_someday 전에는 이 표만 올리지 못하고 outbox에 남는다
  someday: {
    key: 'id',
    columns: ['id', 'text', 'status', 'priority', 'migrated_to', 'position', 'created_at', 'updated_at', 'deleted_at'],
  },
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
