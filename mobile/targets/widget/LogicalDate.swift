import Foundation

// 앱의 logicalDate(src/lib/date.ts)와 같다: 새벽 4시 전이면 전날(달력 기준). 기기 시간대 기준.
func logicalDate(_ now: Date = Date()) -> String {
  let day = logicalDay(now)
  let c = Calendar.current.dateComponents([.year, .month, .day], from: day)
  return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

// 새벽 4시 전이면 달력으로 하루 전(서머타임 날에도 고정 4시간 빼기와 달리 앱과 같다)
private func logicalDay(_ now: Date) -> Date {
  let cal = Calendar.current
  return cal.component(.hour, from: now) < 4 ? (cal.date(byAdding: .day, value: -1, to: now) ?? now) : now
}

// 위젯 화면 제목: "10월 8일 목요일"
func longDateLabel(_ now: Date = Date()) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "ko_KR")
  f.dateFormat = "M월 d일 EEEE"
  return f.string(from: logicalDay(now))
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
