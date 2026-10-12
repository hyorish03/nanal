import AppIntents
import WidgetKit

// 위젯 안 상태 버튼: 앱을 열지 않고 • → ◐ → ●✓ → • 로 바꾼다. 끝나면 WidgetKit이 타임라인을 다시 읽는다.
struct AdvanceItemIntent: AppIntent {
  static var title: LocalizedStringResource = "할 일 상태 바꾸기"
  static var isDiscoverable = false

  @Parameter(title: "항목") var itemID: String

  init() {}
  init(itemID: String) { self.itemID = itemID }

  func perform() async throws -> some IntentResult {
    NanalDB.advance(id: itemID)
    return .result()
  }
}
