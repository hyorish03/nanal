import AppIntents
import Foundation

// 컨트롤이 앱을 열며 넘기는 동작. iOS 18은 컨트롤에서 앱의 URL 스킴을 열어 주지 않으므로
// 앱을 여는 인텐트(openAppWhenRun)가 동작을 App Group에 남기고, 앱이 열릴 때 읽고 지운다.
// 앱 타깃에도 들어가야 앱을 열 수 있어서 _shared에 둔다(@bacons/apple-targets가 양쪽에 링크).
enum PendingAction {
  static let key = "pendingAction"

  // "동작|기록한 시각(ms)": 오래된 동작은 앱이 버린다
  static func store(_ action: String) {
    let now = Int(Date().timeIntervalSince1970 * 1000)
    UserDefaults(suiteName: "group.mengle.zen")?.set("\(action)|\(now)", forKey: key)
  }
}

@available(iOS 18.0, *)
struct OpenNanalVoiceIntent: AppIntent {
  static let title: LocalizedStringResource = "나날 말로 적기"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    PendingAction.store("voice")
    return .result()
  }
}

@available(iOS 18.0, *)
struct OpenNanalLineIntent: AppIntent {
  static let title: LocalizedStringResource = "나날 한 줄 적기"
  static let isDiscoverable = false
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    PendingAction.store("focus")
    return .result()
  }
}
