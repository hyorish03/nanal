import AppIntents
import WidgetKit

// 위젯 안 상태 버튼: 앱을 열지 않고 ○ → ◐ → ●✓ → ○ 로 바꾼다. 끝나면 WidgetKit이 타임라인을 다시 읽는다.
struct AdvanceItemIntent: AppIntent {
  static var title: LocalizedStringResource = "할 일 상태 바꾸기"
  static var isDiscoverable = false

  @Parameter(title: "할 일") var itemID: String

  @Parameter(title: "현재 상태") var status: String

  init() {}
  init(itemID: String, status: String) {
    self.itemID = itemID
    self.status = status
  }

  func perform() async throws -> some IntentResult {
    // 그 사이 상태가 바뀌었으면 아무것도 안 하고, 어느 쪽이든 모든 위젯을 새로 그린다.
    NanalDB.advance(id: itemID, from: status)
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
