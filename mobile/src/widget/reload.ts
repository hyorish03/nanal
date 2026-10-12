import { requireOptionalNativeModule } from 'expo';

type ExtensionStorageModule = { reloadWidget(name?: string): void };

// @bacons/apple-targets의 ExtensionStorage(WidgetCenter.reloadAllTimelines). Expo Go에는 없으니 있을 때만 부른다.
const native = requireOptionalNativeModule<ExtensionStorageModule>('ExtensionStorage');

export function reloadWidgets(): void {
  try {
    native?.reloadWidget();
  } catch {
    // 위젯 새로 고침 실패는 앱 동작에 영향을 주지 않는다
  }
}
