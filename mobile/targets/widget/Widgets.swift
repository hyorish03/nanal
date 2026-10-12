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

struct NanalHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalHome", provider: NanalProvider()) { entry in
      Text(entry.snapshot.available ? (entry.snapshot.next?.text ?? "오늘도 한 줄씩") : "앱을 한 번 열어 주세요")
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("나날")
    .description("오늘 할 일")
    .supportedFamilies([.systemSmall])
  }
}

@main
struct NanalWidgets: WidgetBundle {
  var body: some Widget {
    NanalHomeWidget()
  }
}
