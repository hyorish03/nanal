export const TABLES = {
  items: {
    key: 'id',
    columns: ['id', 'date', 'kind', 'text', 'status', 'migrated_from', 'created_at', 'updated_at', 'deleted_at'],
  },
  days: {
    key: 'date',
    columns: ['date', 'mood', 'updated_at', 'deleted_at'],
  },
  reflections: {
    key: 'id',
    columns: ['id', 'date', 'template', 'answers', 'created_at', 'updated_at', 'deleted_at'],
  },
} as const;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];
