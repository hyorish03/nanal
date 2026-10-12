import { requireOptionalNativeModule } from 'expo';
import { APP_GROUP } from '../db/location';
import { type LinkAction, parsePendingAction, PENDING_ACTION_KEY } from '../lib/deepLink';

type ExtensionStorageModule = {
  get(key: string, group: string): string | null;
  remove(key: string, group: string): void;
};

const native = requireOptionalNativeModule<ExtensionStorageModule>('ExtensionStorage');

// 컨트롤이 남긴 동작을 꺼내고 지운다(한 번만 실행).
export function takePendingAction(now = Date.now()): LinkAction | null {
  try {
    const raw = native?.get(PENDING_ACTION_KEY, APP_GROUP);
    if (raw == null) return null;
    native?.remove(PENDING_ACTION_KEY, APP_GROUP);
    return parsePendingAction(raw, now);
  } catch {
    return null;
  }
}
