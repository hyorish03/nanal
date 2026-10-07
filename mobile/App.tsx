import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { openDb } from './src/db/client';
import type { Db } from './src/db/types';
import { LoginScreen } from './src/screens/LoginScreen';
import { Main } from './src/screens/Main';
import { supabase } from './src/supabase';

const LAST_USER_KEY = 'nanal.lastUserId';

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then(setDb)
      .catch((e) => setFatal(`로컬 저장소를 열 수 없습니다: ${String(e)}`));

    // 로컬 우선: 오프라인에서 액세스 토큰이 만료된 채 실행해도 로컬 데이터는 열려야 한다.
    // 네트워크 오류로 세션을 확인하지 못했고 마지막 사용자 id가 있으면 그 사용자로 연다.
    // 저장된 세션은 클라이언트가 유지하며, 온라인이 되면 자동 갱신으로 복구된다.
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (data.session) {
          setUserId(data.session.user.id);
          await AsyncStorage.setItem(LAST_USER_KEY, data.session.user.id).catch(() => {});
        } else if (error && isAuthRetryableFetchError(error)) {
          setUserId(await AsyncStorage.getItem(LAST_USER_KEY).catch(() => null));
        } else {
          setUserId(null);
        }
      })
      .catch(() => setUserId(null))
      .finally(() => setAuthReady(true));

    // 세션이 없는 이벤트(오프라인의 INITIAL_SESSION 등)는 무시하고, 명시적 SIGNED_OUT만 로그아웃으로 본다.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (s) {
        setUserId(s.user.id);
        AsyncStorage.setItem(LAST_USER_KEY, s.user.id).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        AsyncStorage.removeItem(LAST_USER_KEY).catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  let body: ReactNode;
  if (fatal)
    body = (
      <View style={styles.center}>
        <Text>{fatal}</Text>
      </View>
    );
  else if (!db || !authReady)
    body = (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="불러오는 중" />
      </View>
    );
  else if (!userId) body = <LoginScreen />;
  else body = <Main db={db} userId={userId} />;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>{body}</View>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
