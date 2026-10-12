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
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
