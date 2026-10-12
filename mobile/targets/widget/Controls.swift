import AppIntents
import SwiftUI
import WidgetKit

// 컨트롤에서 앱을 특정 화면으로 연다(iOS 18 OpenURLIntent).
@available(iOS 18.0, *)
struct OpenNanalIntent: AppIntent {
  static var title: LocalizedStringResource = "나날 열기"
  static var isDiscoverable = false

  @Parameter(title: "주소") var target: String

  init() {}
  init(target: String) { self.target = target }

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: target) ?? todayURL))
  }
}

@available(iOS 18.0, *)
struct NanalVoiceControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "NanalVoiceControl") {
      ControlWidgetButton(action: OpenNanalIntent(target: "nanal://voice")) {
        Label("말로 적기", systemImage: "mic")
      }
    }
    .displayName("나날 말로 적기")
  }
}

@available(iOS 18.0, *)
struct NanalLineControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "NanalLineControl") {
      ControlWidgetButton(action: OpenNanalIntent(target: newLineURL.absoluteString)) {
        Label("한 줄 적기", systemImage: "pencil")
      }
    }
    .displayName("나날 한 줄 적기")
  }
}
