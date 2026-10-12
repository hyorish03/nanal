import AppIntents
import SwiftUI
import WidgetKit

extension Color {
  static let paper = Color(red: 0xF6 / 255, green: 0xF0 / 255, blue: 0xE4 / 255)
  static let ink = Color(red: 0x2A / 255, green: 0x25 / 255, blue: 0x20 / 255)
  static let inkMuted = Color(red: 0x6E / 255, green: 0x64 / 255, blue: 0x56 / 255)
  static let navy = Color(red: 0x1E / 255, green: 0x2F / 255, blue: 0x4D / 255)
  static let highlight = Color(red: 0xF1 / 255, green: 0xDE / 255, blue: 0x8A / 255)
  static let chip = Color(red: 0xED / 255, green: 0xE4 / 255, blue: 0xD2 / 255)
}

let todayURL = URL(string: "nanal://today")!
let newLineURL = URL(string: "nanal://today?focus=1")!

// 상태 기호(스펙 11.2): • 할 일, ◐ 진행 중, ●✓ 끝낸 일
func statusSymbol(_ status: String) -> String {
  switch status {
  case "doing": return "circle.lefthalf.filled"
  case "done": return "checkmark.circle.fill"
  default: return "circle"
  }
}

func nextHint(_ item: WidgetItem) -> String {
  item.status == "doing" ? "진행 중 · 눌러서 완료" : (item.priority ? "중요 · 눌러서 진행 중으로" : "눌러서 진행 중으로")
}

func statusWord(_ status: String) -> String {
  switch status {
  case "doing": return "진행 중"
  case "done": return "끝낸 일"
  default: return "할 일"
  }
}

// 기호를 누르면 다음 상태로
struct StatusButton: View {
  let item: WidgetItem
  var size: CGFloat = 18

  var body: some View {
    Button(intent: AdvanceItemIntent(itemID: item.id)) {
      Image(systemName: statusSymbol(item.status))
        .font(.system(size: size))
        .frame(width: 30, height: 30)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(statusWord(item.status)) \(item.text), 눌러서 다음 상태로")
  }
}

struct ItemLine: View {
  let item: WidgetItem

  var body: some View {
    HStack(spacing: 6) {
      StatusButton(item: item).foregroundStyle(Color.navy)
      Text(item.text)
        .font(.system(size: 14))
        .foregroundStyle(item.status == "done" ? Color.inkMuted : Color.ink)
        .strikethrough(item.status == "done")
        .padding(.horizontal, item.priority ? 3 : 0)
        .background(item.priority ? Color.highlight.opacity(0.8) : Color.clear)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}

struct UnavailableView: View {
  var body: some View {
    Text("나날 앱을 한 번 열어 주세요")
      .font(.system(size: 13))
      .foregroundStyle(Color.inkMuted)
  }
}

// 잠금화면 직사각형: 다음 할 일과 상태 버튼
struct LockRectView: View {
  let s: WidgetSnapshot

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 1) {
        Text("나날 · 오늘 \(s.doneCount)/\(s.items.count)").font(.caption2).opacity(0.85)
        Text(s.next?.text ?? "오늘 할 일을 다 했어요").font(.headline).lineLimit(1)
        Text(s.next.map(nextHint) ?? "오늘도 한 줄씩").font(.caption2).opacity(0.75).lineLimit(1)
      }
      Spacer(minLength: 0)
      if let next = s.next { StatusButton(item: next, size: 22) }
    }
    .widgetURL(todayURL)
  }
}

// 잠금화면 원형: 남은 할 일
struct LockRemainingView: View {
  let s: WidgetSnapshot

  var body: some View {
    Gauge(value: Double(s.doneCount), in: 0...Double(max(s.items.count, 1))) {
      Text("남음")
    } currentValueLabel: {
      Text("\(s.remaining)")
    }
    .gaugeStyle(.accessoryCircular)
    .accessibilityLabel("남은 할 일 \(s.remaining)개")
    .widgetURL(todayURL)
  }
}

// 잠금화면 원형: 오늘 기분
struct LockMoodView: View {
  let s: WidgetSnapshot

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 1) {
        Image(systemName: s.mood == nil ? "drop" : "drop.fill").font(.system(size: 16))
        Text(s.moodWord ?? "기분").font(.system(size: 10))
      }
    }
    .accessibilityLabel(s.moodWord.map { "오늘 기분 \($0)" } ?? "오늘 기분 아직 없음")
    .widgetURL(todayURL)
  }
}

// 홈 작은: 기분과 기록한 날
struct HomeSmallView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("오늘 기분").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      Text(s.moodWord ?? "—").font(.system(size: 22, design: .serif)).foregroundStyle(Color.navy)
      Spacer(minLength: 0)
      Text("기록한 날").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      Text("\(s.recordedDays)일째").font(.system(size: 18, design: .serif)).foregroundStyle(Color.ink)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(todayURL)
  }
}

// 홈 중간: 오늘 할 일 3개와 체크
struct HomeMediumView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(longDateLabel()).font(.system(size: 15, design: .serif)).foregroundStyle(Color.ink)
        Spacer()
        Text("\(s.doneCount)/\(s.items.count)").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      }
      if s.items.isEmpty {
        Text("오늘도 한 줄씩").font(.system(size: 14)).foregroundStyle(Color.inkMuted)
      }
      ForEach(s.items.prefix(3)) { ItemLine(item: $0) }
      Spacer(minLength: 0)
      Link(destination: newLineURL) {
        Text("+ 한 줄").font(.system(size: 13)).foregroundStyle(Color.navy)
      }
    }
  }
}

// 홈 큰: 상태 칩과 목록
struct HomeLargeView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(longDateLabel()).font(.system(size: 17, design: .serif)).foregroundStyle(Color.ink)
      HStack(spacing: 6) {
        chip("밀린 일", s.carried)
        chip("할 일", s.openCount)
        chip("진행 중", s.doingCount)
        chip("한 일", s.doneCount)
      }
      Text("상태를 눌러 바꿔요").font(.system(size: 11)).foregroundStyle(Color.inkMuted)
      ForEach(s.items.prefix(7)) { ItemLine(item: $0) }
      Spacer(minLength: 0)
      Link(destination: newLineURL) {
        Text("+ 한 줄").font(.system(size: 13)).foregroundStyle(Color.navy)
      }
    }
  }

  private func chip(_ label: String, _ count: Int) -> some View {
    Text("\(label) \(count)")
      .font(.system(size: 11))
      .foregroundStyle(Color.ink)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(Capsule().fill(Color.chip))
  }
}
