import AppIntents
import SwiftUI
import WidgetKit

// 컨트롤의 인텐트는 _shared/OpenAppIntents.swift에 있다(앱 타깃에도 있어야 앱이 열린다).
@available(iOS 18.0, *)
struct NanalVoiceControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "NanalVoiceControl") {
      ControlWidgetButton(action: OpenNanalVoiceIntent()) {
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
      ControlWidgetButton(action: OpenNanalLineIntent()) {
        Label("한 줄 적기", systemImage: "pencil")
      }
    }
    .displayName("나날 한 줄 적기")
  }
}
