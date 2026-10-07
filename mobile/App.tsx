import 'react-native-get-random-values';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { openDb } from './src/db/client';
import type { Db } from './src/db/types';
import { LoginScreen } from './src/screens/LoginScreen';
import { Main } from './src/screens/Main';
import { supabase } from './src/supabase';

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then(setDb)
      .catch((e) => setFatal(`로컬 저장소를 열 수 없습니다: ${String(e)}`));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  let body: ReactNode;
  if (fatal) body = <Text style={styles.center}>{fatal}</Text>;
  else if (!db || !authReady) body = <ActivityIndicator style={styles.center} />;
  else if (!session) body = <LoginScreen />;
  else body = <Main db={db} userId={session.user.id} />;

  return (
    <SafeAreaProvider>
      <View style={styles.root}>{body}</View>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, textAlign: 'center', textAlignVertical: 'center', marginTop: 120 },
});
