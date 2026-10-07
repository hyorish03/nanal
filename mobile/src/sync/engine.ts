import type { Db } from '../db/types';
import { pull } from './pull';
import { push } from './push';
import type { Remote } from './remote';

export function createSyncEngine(db: Db, remote: Remote, onPulled?: () => void) {
  let running: Promise<void> | null = null;
  return {
    sync(): Promise<void> {
      if (!running) {
        running = (async () => {
          await push(db, remote);
          if (await pull(db, remote)) onPulled?.();
        })().finally(() => {
          running = null;
        });
      }
      return running;
    },
  };
}
