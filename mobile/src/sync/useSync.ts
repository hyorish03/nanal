import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Db } from '../db/types';
import { createSyncEngine } from './engine';
import { pendingCount } from './outbox';
import type { Remote } from './remote';

const DEBOUNCE_MS = 2_000;
const RETRY_MS = 30_000;

export function useSync(db: Db, remote: Remote, onPulled: () => void) {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onPulledRef = useRef(onPulled);
  onPulledRef.current = onPulled;

  const engine = useMemo(() => createSyncEngine(db, remote, () => onPulledRef.current()), [db, remote]);

  const runSync = useCallback(async () => {
    try {
      await engine.sync();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(await pendingCount(db));
    }
  }, [db, engine]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSync = useCallback(() => {
    pendingCount(db).then(setPending);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(runSync, DEBOUNCE_MS);
  }, [db, runSync]);

  useEffect(() => {
    runSync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') runSync();
    }, RETRY_MS);
    return () => {
      sub.remove();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runSync]);

  return { pending, error, requestSync };
}
