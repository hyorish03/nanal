import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { supabase } from '../supabase';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { EveningScreen } from './EveningScreen';
import { TodayScreen } from './TodayScreen';

export function Main({ db, userId }: { db: Db; userId: string }) {
  const remote = useMemo(() => createSupabaseRemote(supabase, userId), [userId]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const { pending, error, requestSync } = useSync(db, remote, refresh);
  const [screen, setScreen] = useState<'today' | 'evening'>('today');

  // 앱을 다시 열면 날짜(새벽 4시 경계)가 바뀌었을 수 있으므로 다시 그린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  return (
    <SafeAreaView style={styles.container}>
      {(pending > 0 || error) && (
        <Text style={styles.syncBar} accessibilityLiveRegion="polite">
          {error ? `동기화 실패, 자동으로 다시 시도합니다 (${pending}건 대기)` : `동기화 대기 ${pending}건`}
        </Text>
      )}
      {screen === 'today' ? (
        <TodayScreen db={db} version={version} onChanged={onChanged} onOpenEvening={() => setScreen('evening')} />
      ) : (
        <EveningScreen db={db} version={version} onChanged={onChanged} onClose={() => setScreen('today')} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  syncBar: { backgroundColor: '#fff4d6', color: '#5c4400', paddingVertical: 6, paddingHorizontal: 16, fontSize: 13 },
});
