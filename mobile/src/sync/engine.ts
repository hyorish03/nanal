import type { Db } from '../db/types';
import { pull } from './pull';
import { push } from './push';
import type { Remote } from './remote';

export function createSyncEngine(db: Db, remote: Remote, onPulled?: () => void) {
  let running: Promise<void> | null = null;
  let rerun = false;

  async function loop(): Promise<void> {
    try {
      do {
        rerun = false;
        let pushError: unknown;
        let pushFailed = false;
        try {
          await push(db, remote);
        } catch (e) {
          pushFailed = true;
          pushError = e;
        }
        // push가 실패해도 서버의 변경은 받아 둔다. 오류는 pull 뒤에 다시 던진다.
        try {
          if (await pull(db, remote)) onPulled?.();
        } catch (e) {
          if (!pushFailed) throw e;
          console.warn('pull failed after push failure', e);
        }
        if (pushFailed) throw pushError;
      } while (rerun);
    } finally {
      // 마지막 검사와 같은 틱에서 초기화해, 그 사이에 들어온 호출이 놓치지 않게 한다.
      running = null;
      rerun = false;
    }
  }

  return {
    sync(): Promise<void> {
      if (running) {
        // 실행 중인 push는 이미 outbox를 읽었으므로, 끝난 뒤 한 번 더 돈다.
        rerun = true;
        return running;
      }
      running = loop();
      return running;
    },
  };
}
