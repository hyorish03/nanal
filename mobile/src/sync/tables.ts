export const TABLES = {
  items: {
    key: 'id',
    columns: ['id', 'date', 'kind', 'text', 'status', 'priority', 'migrated_from', 'created_at', 'updated_at', 'deleted_at'],
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
    columns: ['id', 'text', 'status', 'priority', 'migrated_to', 'created_at', 'updated_at', 'deleted_at'],
  },
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
