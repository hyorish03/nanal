import SwiftUI
import WidgetKit

struct NanalEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

struct NanalProvider: TimelineProvider {
  func placeholder(in context: Context) -> NanalEntry { NanalEntry(date: Date(), snapshot: .sample) }

  func getSnapshot(in context: Context, completion: @escaping (NanalEntry) -> Void) {
    completion(NanalEntry(date: Date(), snapshot: context.isPreview ? .sample : NanalDB.snapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NanalEntry>) -> Void) {
    let now = Date()
    let entry = NanalEntry(date: now, snapshot: NanalDB.snapshot(now: now))
    completion(Timeline(entries: [entry], policy: .after(nextRefresh(after: now))))
  }
}

struct NanalLockWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalLock", provider: NanalProvider()) { entry in
      LockEntryView(entry: entry).containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("나날 오늘 할 일")
    .description("다음 할 일과 남은 수")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular])
  }
}

struct LockEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NanalEntry

  var body: some View {
    if !entry.snapshot.available {
      UnavailableView()
    } else if family == .accessoryCircular {
      LockRemainingView(s: entry.snapshot)
    } else {
      LockRectView(s: entry.snapshot)
    }
  }
}

struct NanalMoodWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalMood", provider: NanalProvider()) { entry in
      LockMoodView(s: entry.snapshot).containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("나날 오늘 기분")
    .description("저녁 마무리에서 고른 기분")
    .supportedFamilies([.accessoryCircular])
  }
}

struct NanalHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalHome", provider: NanalProvider()) { entry in
      HomeEntryView(entry: entry).containerBackground(Color.paper, for: .widget)
    }
    .configurationDisplayName("나날")
    .description("오늘 할 일과 기분")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HomeEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NanalEntry

  var body: some View {
    if !entry.snapshot.available {
      UnavailableView()
    } else {
      switch family {
      case .systemSmall: HomeSmallView(s: entry.snapshot)
      case .systemLarge: HomeLargeView(s: entry.snapshot)
      default: HomeMediumView(s: entry.snapshot)
      }
    }
  }
}

@main
struct NanalWidgets: WidgetBundle {
  var body: some Widget {
    NanalLockWidget()
    NanalMoodWidget()
    NanalHomeWidget()
    if #available(iOS 18.0, *) {
      NanalVoiceControl()
      NanalLineControl()
    }
  }
}
