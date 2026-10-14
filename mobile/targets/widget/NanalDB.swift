import Foundation
import SQLite3

// 앱과 같은 파일(src/db/location.ts의 APP_GROUP, DB_DIR, DB_NAME)
let appGroupID = "group.com.hyorish03.nanal.app"
private let dbRelativePath = "nanal/daily-log.db"
// src/days/moods.ts의 MOOD_WORDS
let moodWords = ["힘듦", "가라앉음", "보통", "괜찮음", "좋음"]

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

struct WidgetItem: Identifiable, Hashable {
  let id: String
  let text: String
  let status: String // open | doing | done
  let priority: Bool
}

struct WidgetSnapshot {
  let available: Bool // 공유 DB를 열었는지(아니면 "앱을 한 번 열면 위젯이 채워져요")
  let items: [WidgetItem] // 위젯에 그릴 앞쪽 일부(SQL의 LIMIT). 총 개수는 아래 세 값을 쓴다
  let openCount: Int
  let doingCount: Int
  let doneCount: Int
  let carried: Int
  let mood: Int?
  let recordedDays: Int

  // 잠금화면 "다음 할 일": 정렬된 목록에서 끝내지 않은 첫 항목(진행 중 → 중요 → 목록 순, pickNext와 같다)
  var next: WidgetItem? { items.first { $0.status != "done" } }
  var total: Int { openCount + doingCount + doneCount }
  var remaining: Int { openCount + doingCount }
  var moodWord: String? { mood.flatMap { (1...5).contains($0) ? moodWords[$0 - 1] : nil } }

  static let unavailable = WidgetSnapshot(available: false, items: [], openCount: 0, doingCount: 0, doneCount: 0, carried: 0, mood: nil, recordedDays: 0)
  static let sample = WidgetSnapshot(
    available: true,
    items: [
      WidgetItem(id: "1", text: "보고서 초안 마무리", status: "doing", priority: false),
      WidgetItem(id: "2", text: "엄마한테 전화하기", status: "open", priority: true),
      WidgetItem(id: "3", text: "빨래 널기", status: "open", priority: false),
      WidgetItem(id: "4", text: "아침 스트레칭 10분", status: "done", priority: false),
    ],
    openCount: 2, doingCount: 1, doneCount: 1,
    carried: 2, mood: 4, recordedDays: 12)
}

enum NanalDB {
  static var url: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
      .appendingPathComponent(dbRelativePath)
  }

  // 앱이 WAL로 열어 두므로 읽기에도 -shm을 쓸 수 있게 읽기·쓰기로 연다. 파일이 없으면 만들지 않는다(SQLITE_OPEN_CREATE 없음).
  private static func open() -> OpaquePointer? {
    guard let url, FileManager.default.fileExists(atPath: url.path) else { return nil }
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else {
      sqlite3_close(db)
      return nil
    }
    sqlite3_busy_timeout(db, 3000)
    return db
  }

  private static func prepare(_ db: OpaquePointer, _ sql: String, _ args: [String]) -> OpaquePointer? {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
    for (i, arg) in args.enumerated() { sqlite3_bind_text(stmt, Int32(i + 1), arg, -1, SQLITE_TRANSIENT) }
    return stmt
  }

  private static func rows(_ db: OpaquePointer, _ sql: String, _ args: [String], _ each: (OpaquePointer) -> Void) {
    guard let stmt = prepare(db, sql, args) else { return }
    defer { sqlite3_finalize(stmt) }
    while sqlite3_step(stmt) == SQLITE_ROW { each(stmt) }
  }

  private static func run(_ db: OpaquePointer, _ sql: String, _ args: [String]) -> Bool {
    guard let stmt = prepare(db, sql, args) else { return false }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_DONE
  }

  private static func text(_ stmt: OpaquePointer, _ col: Int32) -> String {
    sqlite3_column_text(stmt, col).map { String(cString: $0) } ?? ""
  }

  static func snapshot(now: Date = Date()) -> WidgetSnapshot {
    guard let db = open() else { return .unavailable }
    defer { sqlite3_close(db) }
    let date = logicalDate(now)
    var items: [WidgetItem] = []
    rows(db, SharedSQL.items, [date]) { s in
      items.append(WidgetItem(id: text(s, 0), text: text(s, 1), status: text(s, 2), priority: sqlite3_column_int(s, 3) == 1))
    }
    var openCount = 0, doingCount = 0, doneCount = 0
    rows(db, SharedSQL.counts, [date]) { s in
      let n = Int(sqlite3_column_int(s, 1))
      switch text(s, 0) {
      case "open": openCount = n
      case "doing": doingCount = n
      case "done": doneCount = n
      default: break
      }
    }
    var carried = 0
    rows(db, SharedSQL.carried, [date]) { carried = Int(sqlite3_column_int($0, 0)) }
    var mood: Int?
    rows(db, SharedSQL.mood, [date]) { s in
      if sqlite3_column_type(s, 0) != SQLITE_NULL { mood = Int(sqlite3_column_int(s, 0)) }
    }
    var recorded = 0
    rows(db, SharedSQL.recordedDays, [date, date, date]) { recorded = Int(sqlite3_column_int($0, 0)) }
    return WidgetSnapshot(
      available: true, items: items, openCount: openCount, doingCount: doingCount, doneCount: doneCount, carried: carried, mood: mood, recordedDays: recorded)
  }

  // 앱의 advanceStatus와 같은 규칙(widgetAdvance). 보여 준 상태와 같을 때만 바꾸고, 바뀐 행이 있을 때만 outbox에 남긴다. 동기화는 앱이 열릴 때 한다.
  @discardableResult
  static func advance(id: String, from status: String, now: Date = Date()) -> Bool {
    guard let db = open() else { return false }
    defer { sqlite3_close(db) }
    guard sqlite3_exec(db, "BEGIN IMMEDIATE", nil, nil, nil) == SQLITE_OK else { return false }
    var ok = run(db, SharedSQL.advance, [isoTimestamp(now), id, status])
    let changed = ok && sqlite3_changes(db) > 0
    if changed { ok = run(db, SharedSQL.markDirty, [id]) }
    if ok && changed && sqlite3_exec(db, "COMMIT", nil, nil, nil) == SQLITE_OK { return true }
    sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
    return false
  }
}
