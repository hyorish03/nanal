import Foundation

// 앱의 logicalDate(src/lib/date.ts)와 같다: 새벽 4시 전이면 전날. 기기 시간대 기준.
func logicalDate(_ now: Date = Date()) -> String {
  let shifted = now.addingTimeInterval(-4 * 3600)
  let c = Calendar.current.dateComponents([.year, .month, .day], from: shifted)
  return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

// 위젯 화면 제목: "10월 8일 목요일"
func longDateLabel(_ now: Date = Date()) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "ko_KR")
  f.dateFormat = "M월 d일 EEEE"
  return f.string(from: now.addingTimeInterval(-4 * 3600))
}

// 앱의 toISOString()과 같은 모양(UTC, 밀리초): 2026-10-08T00:00:00.000Z
func isoTimestamp(_ now: Date = Date()) -> String {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  f.timeZone = TimeZone(identifier: "UTC")
  return f.string(from: now)
}

// 30분 뒤와 다음 새벽 4시 중 빠른 때
func nextRefresh(after now: Date) -> Date {
  let cal = Calendar.current
  var boundary = cal.date(bySettingHour: 4, minute: 0, second: 0, of: now) ?? now.addingTimeInterval(1800)
  if boundary <= now { boundary = cal.date(byAdding: .day, value: 1, to: boundary) ?? now.addingTimeInterval(1800) }
  return min(now.addingTimeInterval(30 * 60), boundary)
}
