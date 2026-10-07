import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Db } from '../db/types';
import { createSyncEngine } from './engine';
import { pendingCount } from './outbox';
import type { Remote } from './remote';

const DEBOUNCE_MS = 2_000;
const RETRY_MS = 30_000;

/** `db`와 `remote`는 반드시 안정된(메모이즈된) 참조여야 한다. 아니면 렌더마다 effect가 다시 시작된다. */
export function useSync(db: Db, remote: Remote, onPulled: () => void) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onPulledRef = useRef(onPulled);
  onPulledRef.current = onPulled;

  const engine = useMemo(() => createSyncEngine(db, remote, () => onPulledRef.current()), [db, remote]);

  const alive = useRef(false);

  const runSync = useCallback(async () => {
    try {
      await engine.sync();
      if (alive.current) setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      try {
        const n = await pendingCount(db);
        if (alive.current) setPending(n);
      } catch {
        // 표시용 값이라 실패해도 무시한다.
      }
    }
  }, [db, engine]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSync = useCallback(() => {
    pendingCount(db)
      .then((n) => {
        if (alive.current) setPending(n);
      })
      .catch(() => undefined);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(runSync, DEBOUNCE_MS);
  }, [db, runSync]);

  useEffect(() => {
    alive.current = true;
    pendingCount(db)
      .then((n) => {
        if (alive.current) setPending(n);
      })
      .catch(() => undefined);
    runSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runSync();
    }, RETRY_MS);
    return () => {
      alive.current = false;
      sub.remove();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, runSync]);

  return { pending, error, requestSync };
}
