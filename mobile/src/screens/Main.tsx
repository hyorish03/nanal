import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
import { supabase } from '../supabase';
import { claimOwner } from '../sync/owner';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { Cover } from '../ui/Cover';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { ArchiveScreen } from './ArchiveScreen';
import { EveningScreen } from './EveningScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { TodayScreen } from './TodayScreen';

export function Main({ db, userId }: { db: Db; userId: string }) {
  const [claim, setClaim] = useState<'pending' | 'ok' | 'mismatch' | 'error'>('pending');

  useEffect(() => {
    let alive = true;
    setClaim('pending');
    claimOwner(db, userId).then(
      (result) => {
        if (alive) setClaim(result);
      },
      () => {
        if (alive) setClaim('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [db, userId]);

  if (claim === 'pending') return <SafeAreaView style={styles.container} />;
  if (claim === 'mismatch' || claim === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.blocked} accessibilityRole="alert">
          {claim === 'mismatch'
            ? '이 기기에는 다른 계정의 기록이 있습니다. 같은 계정으로 로그인하세요.'
            : '기기 데이터를 확인하지 못했습니다. 앱을 다시 실행하세요.'}
        </Text>
      </SafeAreaView>
    );
  }
  return <MainContent db={db} userId={userId} />;
}

type Screen = 'onboarding' | 'today' | 'evening' | 'archive';

function MainContent({ db, userId }: { db: Db; userId: string }) {
  const remote = useMemo(() => createSupabaseRemote(supabase, userId), [userId]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const { pending, error, requestSync } = useSync(db, remote, refresh);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [dayClosed, setDayClosed] = useState(false); // 저녁 마무리에서 "닫기"를 눌렀다
  const [closedShown, setClosedShown] = useState(false); // 덮기 애니메이션이 끝났다
  const [focusPending, setFocusPending] = useState(true); // 표지가 열린 뒤 입력칸 포커스는 한 번만

  useEffect(() => {
    hasSeenOnboarding(AsyncStorage).then((seen) => setScreen(seen ? 'today' : 'onboarding'));
  }, []);

  // 첫 화면이 정해지면 잠깐 표지를 보여준 뒤 펼친다(스펙 11.1).
  const ready = screen !== null;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setCoverOpen(true), 450);
    return () => clearTimeout(t);
  }, [ready]);

  // 앱을 다시 열면 날짜(새벽 4시 경계)가 바뀌었을 수 있으므로 다시 그린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Android 뒤로 가기: 저녁·지난 기록에서는 오늘로 돌아간다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'evening' || screen === 'archive') {
        setScreen('today');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  const finishOnboarding = useCallback(() => {
    markOnboardingSeen(AsyncStorage);
    setScreen('today');
  }, []);

  const closeDay = useCallback(() => {
    Keyboard.dismiss();
    setDayClosed(true);
    setCoverOpen(false);
  }, []);

  const reopen = useCallback(() => {
    setScreen('today');
    setDayClosed(false);
    setClosedShown(false);
    setFocusPending(true);
    setCoverOpen(true);
  }, []);

  const background = screen === 'evening' ? colors.paperEvening : colors.paper;
  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <SafeAreaView style={styles.container}>
        {(pending > 0 || error) && (
          <Txt style={styles.syncBar} accessibilityLiveRegion="polite">
            {error
              ? pending > 0
                ? `동기화 실패, 자동으로 다시 시도합니다 (${pending}건 대기)`
                : '동기화 실패, 자동으로 다시 시도합니다'
              : `동기화 대기 ${pending}건`}
          </Txt>
        )}
        {screen === 'onboarding' && <OnboardingScreen onDone={finishOnboarding} />}
        {screen === 'today' && (
          <TodayScreen
            db={db}
            version={version}
            onChanged={onChanged}
            onOpenEvening={() => setScreen('evening')}
            onOpenArchive={() => setScreen('archive')}
            focusReady={coverOpen && focusPending}
            onFocused={() => setFocusPending(false)}
          />
        )}
        {screen === 'evening' && <EveningScreen db={db} version={version} onChanged={onChanged} onClose={closeDay} />}
        {screen === 'archive' && <ArchiveScreen db={db} version={version} onClose={() => setScreen('today')} />}
      </SafeAreaView>
      <Cover
        open={coverOpen}
        line={dayClosed ? '오늘도 수고했어요' : '오늘도 한 줄씩'}
        onClosed={() => setClosedShown(true)}
      >
        {dayClosed && closedShown && (
          <Pressable accessibilityRole="button" style={styles.reopen} onPress={reopen}>
            <Txt style={styles.reopenText}>내일 다시 펼치기</Txt>
          </Pressable>
        )}
      </Cover>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 }, // 배경은 root와 각 화면이 칠한다(저녁은 paperEvening)
  blocked: { padding: 24, fontSize: 16, lineHeight: 24, color: colors.ink },
  syncBar: { backgroundColor: colors.postit, color: colors.postitText, paddingVertical: 6, paddingHorizontal: 16, fontSize: 13 },
  reopen: {
    marginTop: 120,
    width: 164,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 223, 200, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reopenText: { color: colors.coverText, fontSize: 15 },
});
