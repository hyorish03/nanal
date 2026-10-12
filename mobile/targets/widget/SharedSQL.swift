// 앱의 mobile/src/widget/sql.ts(WIDGET_SQL)와 같은 SQL이다. 하나를 바꾸면 다른 하나도 바꾼다(swiftParity.test.ts가 비교한다).
enum SharedSQL {
  static let items = """
    SELECT id, text, status, priority FROM items
    WHERE date = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
    ORDER BY CASE WHEN status = 'doing' THEN 1 - priority WHEN status IN ('done', 'migrated') THEN 4
    ELSE 3 - priority END, created_at
    """

  static let carried = """
    SELECT COUNT(*) AS n FROM items
    WHERE date < ? AND kind = 'task' AND status IN ('open', 'doing') AND deleted_at IS NULL
    """

  static let mood = """
    SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL
    """

  static let recordedDays = """
    SELECT COUNT(*) AS n FROM (
    SELECT date FROM items WHERE deleted_at IS NULL
    UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
    UNION SELECT date FROM reflections WHERE deleted_at IS NULL
    )
    """

  static let advance = """
    UPDATE items
    SET status = CASE status WHEN 'open' THEN 'doing' WHEN 'doing' THEN 'done' ELSE 'open' END, updated_at = ?
    WHERE id = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done') AND status = ?
    """

  static let markDirty = """
    INSERT INTO outbox (table_name, row_key) VALUES ('items', ?)
    ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1
    """
}
