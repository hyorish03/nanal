import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ON_MAC, MAC_CONTENT_WIDTH } from './src/ui/desktop';
import { KeyboardResize } from './src/ui/KeyboardResize';
import { userMessage } from './src/lib/userError';
import { openDb } from './src/db/client';
import type { Db } from './src/db/types';
import { LoginScreen } from './src/screens/LoginScreen';
import { Main } from './src/screens/Main';
import { supabase } from './src/supabase';
import { colors } from './src/ui/theme';

const LAST_USER_KEY = 'nanal.lastUserId';
const DB_OPEN_FAILED = '이 기기에 저장한 기록을 열지 못했어요. 앱을 껐다가 다시 켜 주세요';

// 남색 시작 화면을 불러오기가 끝날 때까지 붙들어, 표지가 뜨기 전에 크림색 로딩 화면이 깜빡이지 않게 한다.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 200 });

export default function App() {
  // 글꼴은 app.json의 expo-font 플러그인으로 앱에 들어 있어 기다리지 않는다(theme.ts의 fonts).
  const [db, setDb] = useState<Db | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then(setDb)
      // 원문 오류는 화면에 띄우지 않고 기록만 남긴다(userMessage가 console.warn으로 남긴다)
      .catch((e) => setFatal(userMessage(e, DB_OPEN_FAILED)));

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

  const loading = !fatal && (!db || !authReady);
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

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
        <ActivityIndicator accessibilityLabel="불러오는 중" color={colors.navy} />
      </View>
    );
  else if (!userId) body = <LoginScreen />;
  else body = <Main db={db} userId={userId} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.root}>
        {/* Mac의 넓은 창에서는 종이 한 장 폭으로 가운데 모은다 */}
        <View style={ON_MAC ? styles.macColumn : styles.fill}>
          <KeyboardResize>{body}</KeyboardResize>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  macColumn: { flex: 1, width: '100%', maxWidth: MAC_CONTENT_WIDTH, alignSelf: 'center' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
