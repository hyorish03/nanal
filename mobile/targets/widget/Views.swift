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

extension Font {
  // 한국어에는 .serif 디자인이 적용되지 않아 앱과 같은 고운바탕을 번들에 넣어 쓴다(Info.plist UIAppFonts).
  // relativeTo를 주면 글자 크기 설정(Dynamic Type)을 따라 커진다.
  static func batang(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
    .custom("GowunBatang-Regular", size: size, relativeTo: style)
  }
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
  item.status == "doing" ? "진행 중 · 누르면 끝내요" : (item.priority ? "중요 · 누르면 진행 중이 돼요" : "누르면 진행 중이 돼요")
}

func statusWord(_ status: String) -> String {
  switch status {
  case "doing": return "진행 중"
  case "done": return "끝낸 일"
  default: return "할 일"
  }
}

// 기호를 누르면 다음 상태로. 눈에 보이는 기호는 작아도 누르는 영역은 44pt 이상.
struct StatusButton: View {
  let item: WidgetItem
  var prominent = false

  var body: some View {
    Button(intent: AdvanceItemIntent(itemID: item.id, status: item.status)) {
      Image(systemName: statusSymbol(item.status))
        .font(prominent ? .title3 : .body)
        .widgetAccentable()
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(statusWord(item.status)) \(item.text), 눌러서 다음 상태로")
  }
}

struct ItemLine: View {
  let item: WidgetItem

  var body: some View {
    HStack(spacing: 2) {
      StatusButton(item: item).foregroundStyle(Color.navy)
      Text(item.text)
        .font(.callout)
        .foregroundStyle(item.status == "done" ? Color.inkMuted : Color.ink)
        .strikethrough(item.status == "done")
        .padding(.horizontal, item.priority ? 3 : 0)
        .background(item.priority ? Color.highlight.opacity(0.8) : Color.clear)
        .lineLimit(1)
        .privacySensitive()
      Spacer(minLength: 0)
    }
  }
}

// "+ 한 줄 적기": 줄 전체가 44pt 이상의 누르는 영역
struct NewLineLink: View {
  var body: some View {
    Link(destination: newLineURL) {
      Text("+ 한 줄 적기")
        .font(.footnote)
        .foregroundStyle(Color.navy)
        .widgetAccentable()
        .lineLimit(1)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }
  }
}

struct UnavailableView: View {
  var body: some View {
    Text("앱을 한 번 열면 위젯이 채워져요")
      .font(.footnote)
      .foregroundStyle(Color.inkMuted)
  }
}

// 잠금화면 직사각형: 다음 할 일과 상태 버튼
struct LockRectView: View {
  let s: WidgetSnapshot

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 1) {
        Text(s.total == 0 ? "나날 · 오늘" : "나날 · 오늘 \(s.doneCount)/\(s.total)").font(.caption2).opacity(0.85).lineLimit(1)
        // 아직 적은 줄이 없는 날과 다 끝낸 날을 나눠 말한다
        Text(s.next?.text ?? (s.total == 0 ? "오늘도 한 줄씩" : "다 했어요"))
          .font(.batang(15, relativeTo: .subheadline))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .widgetAccentable()
          .privacySensitive()
        Text(s.next.map(nextHint) ?? (s.total == 0 ? "아직 적은 줄이 없어요" : "오늘도 수고했어요")).font(.caption2).opacity(0.75).lineLimit(1)
      }
      Spacer(minLength: 0)
      if let next = s.next { StatusButton(item: next, prominent: true) }
    }
    .widgetURL(todayURL)
  }
}

// 잠금화면 원형: 남은 할 일
struct LockRemainingView: View {
  let s: WidgetSnapshot

  var body: some View {
    Gauge(value: Double(s.doneCount), in: 0...Double(max(s.total, 1))) {
      Text("남은 할 일")
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
        // 앱의 잉크병(Inkwell.tsx) 모양 템플릿 이미지: 기분이 있으면 잉크가 찬 병
        Image(s.mood == nil ? "InkwellEmpty" : "InkwellFilled")
          .renderingMode(.template)
          .resizable()
          .scaledToFit()
          .frame(width: 24, height: 18)
          .widgetAccentable()
        Text(s.moodWord ?? "기분").font(.caption2).lineLimit(1).minimumScaleFactor(0.7)
      }
      .privacySensitive()
    }
    .accessibilityLabel(s.moodWord.map { "오늘 기분 \($0)" } ?? "오늘 기분을 아직 안 남겼어요")
    .widgetURL(todayURL)
  }
}

// 홈 작은: 기분과 기록한 날
struct HomeSmallView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("오늘 기분").font(.caption).foregroundStyle(Color.inkMuted).lineLimit(1)
      Text(s.moodWord ?? "—")
        .font(.batang(22, relativeTo: .title3))
        .foregroundStyle(Color.navy)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .widgetAccentable()
        .privacySensitive()
      Spacer(minLength: 0)
      Text("기록한 날 \(s.recordedDays)일")
        .font(.batang(16, relativeTo: .subheadline))
        .foregroundStyle(Color.ink)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(todayURL)
  }
}

// 홈 중간: 오늘 할 일 2개와 체크. 글자가 커져 모자라면 줄 수를 줄여 "+ 한 줄 적기"가 잘리지 않게 한다.
struct HomeMediumView: View {
  let s: WidgetSnapshot

  var body: some View {
    ViewThatFits(in: .vertical) {
      content(rows: 2)
      content(rows: 1)
      content(rows: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading) // 목록이 비어도 가운데로 몰리지 않게
  }

  private func content(rows: Int) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text(longDateLabel()).font(.batang(15, relativeTo: .subheadline)).foregroundStyle(Color.ink).lineLimit(1)
        Spacer()
        Text("\(s.doneCount)/\(s.total)").font(.caption).foregroundStyle(Color.inkMuted)
      }
      if s.items.isEmpty {
        Text("오늘도 한 줄씩").font(.callout).foregroundStyle(Color.inkMuted).padding(.vertical, 4)
      }
      ForEach(s.items.prefix(rows)) { ItemLine(item: $0) }
      Spacer(minLength: 0)
      NewLineLink()
    }
  }
}

// 홈 큰: 상태 칩과 목록
struct HomeLargeView: View {
  let s: WidgetSnapshot

  var body: some View {
    ViewThatFits(in: .vertical) {
      content(rows: 5)
      content(rows: 4)
      content(rows: 3)
      content(rows: 2)
      content(rows: 1)
    }
    .frame(maxWidth: .infinity, alignment: .leading) // 목록이 비어도 가운데로 몰리지 않게
  }

  private func content(rows: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(longDateLabel()).font(.batang(17, relativeTo: .headline)).foregroundStyle(Color.ink).lineLimit(1)
      HStack(spacing: 6) {
        chip("넘어온 일", s.carried)
        chip("할 일", s.openCount)
        chip("진행 중", s.doingCount)
        chip("끝낸 일", s.doneCount)
      }
      if s.items.isEmpty {
        Text("오늘도 한 줄씩").font(.callout).foregroundStyle(Color.inkMuted)
      } else {
        Text("상태를 눌러 바꿔요").font(.caption2).foregroundStyle(Color.inkMuted)
      }
      VStack(alignment: .leading, spacing: 0) {
        ForEach(s.items.prefix(rows)) { ItemLine(item: $0) }
      }
      Spacer(minLength: 0)
      NewLineLink()
    }
  }

  private func chip(_ label: String, _ count: Int) -> some View {
    Text("\(label) \(count)")
      .font(.caption2)
      .foregroundStyle(Color.ink)
      .lineLimit(1)
      .minimumScaleFactor(0.7)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(Capsule().fill(Color.chip))
  }
}
