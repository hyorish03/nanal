import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Keyboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { type CoverOpening, markCoverOpened, readCoverOpening } from '../lib/coverOpening';
import { consumeInitialUrl, type LinkAction, parseDeepLink } from '../lib/deepLink';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
import { supabase } from '../supabase';
import { claimOwner } from '../sync/owner';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { Cover } from '../ui/Cover';
import { FadeIn } from '../ui/FadeIn';
import { EASE_OUT } from '../ui/motion';
import { dimPressed } from '../ui/press';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';
import { reloadWidgets } from '../widget/reload';
import { ArchiveScreen } from './ArchiveScreen';
import { EveningScreen } from './EveningScreen';
import { MonthlyReviewScreen } from './MonthlyReviewScreen';
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

type Screen = 'onboarding' | 'today' | 'evening' | 'archive' | 'review';

function MainContent({ db, userId }: { db: Db; userId: string }) {
  const remote = useMemo(() => createSupabaseRemote(supabase, userId), [userId]);
  const [version, setVersion] = useState(0);
  // 화면을 다시 그릴 때 위젯도 같은 데이터로 다시 그린다(앱이 앞에 있을 때의 새로 고침은 WidgetKit 예산을 쓰지 않는다).
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    reloadWidgets();
  }, []);
  const { pending, error, requestSync } = useSync(db, remote, refresh);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [reviewMonth, setReviewMonth] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverSettled, setCoverSettled] = useState(false); // 표지가 다 펼쳐졌다(포커스, 링크 동작은 이때부터)
  const [coverOpening, setCoverOpening] = useState<CoverOpening>('turn');
  const [dayClosed, setDayClosed] = useState(false); // 저녁 마무리에서 "닫기"를 눌렀다
  const [closedShown, setClosedShown] = useState(false); // 덮기 애니메이션이 끝났다
  const [focusPending, setFocusPending] = useState(true); // 표지가 열린 뒤 입력칸 포커스는 한 번만
  const [linkAction, setLinkAction] = useState<LinkAction | null>(null);
  const screenRef = useRef<Screen | null>(null);
  screenRef.current = screen;
  const reduce = useReduceMotion();

  // 위젯·컨트롤에서 연 주소: 오늘 화면으로 가서(덮여 있으면 펼친 뒤) 동작을 넘긴다. 온보딩 중이면 화면은 그대로 둔다.
  const handleLink = useCallback((url: string | null) => {
    const link = parseDeepLink(url);
    if (!link) return;
    // 온보딩 중에 온 동작은 버린다(끝난 뒤 말로 적기가 갑자기 뜨지 않게).
    if (screenRef.current === 'onboarding') return;
    setScreen((s) => (s === null || s === 'onboarding' ? s : 'today'));
    setDayClosed(false);
    setClosedShown(false);
    setCoverOpen(true);
    setLinkAction(link.action);
  }, []);

  useEffect(() => {
    if (consumeInitialUrl()) Linking.getInitialURL().then(handleLink, () => {});
    const sub = Linking.addEventListener('url', (e) => handleLink(e.url));
    return () => sub.remove();
  }, [handleLink]);

  useEffect(() => {
    hasSeenOnboarding(AsyncStorage).then((seen) => {
      if (!seen) setLinkAction(null); // 온보딩보다 먼저 도착한 링크 동작은 버린다
      setScreen(seen ? 'today' : 'onboarding');
    });
  }, []);

  // 첫 화면이 정해지면 잠깐 표지를 보여준 뒤 펼친다(스펙 11.1).
  // 그날 처음 열 때만 표지를 넘기고, 같은 날 다시 열면 짧게 보여준 뒤 흐리게 연다.
  const ready = screen !== null;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    readCoverOpening(AsyncStorage, new Date()).then((how) => {
      if (!alive) return;
      setCoverOpening(how);
      t = setTimeout(() => setCoverOpen(true), how === 'turn' ? 450 : 200);
    });
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ready]);

  const onCoverOpened = useCallback(() => {
    setCoverSettled(true);
    markCoverOpened(AsyncStorage, new Date());
  }, []);

  // 앱을 다시 열면 날짜(새벽 4시 경계)가 바뀌었을 수 있으므로 다시 그린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Android 뒤로 가기: 저녁·지난 기록에서는 오늘로, 월간 돌아보기에서는 지난 기록으로 돌아간다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'review') {
        setScreen('archive');
        return true;
      }
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
    setCoverSettled(false);
  }, []);

  const reopen = useCallback(() => {
    setScreen('today');
    setCoverOpening('turn'); // 직접 펼칠 때는 표지를 넘긴다
    setDayClosed(false);
    setClosedShown(false);
    setFocusPending(true);
    setCoverOpen(true);
  }, []);

  return (
    <View style={styles.root}>
      <EveningBackdrop on={screen === 'evening'} />
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
        <ScreenEnter key={screen ?? 'none'} reduce={reduce}>
          {screen === 'onboarding' && <OnboardingScreen onDone={finishOnboarding} />}
          {screen === 'today' && (
            <TodayScreen
              db={db}
              version={version}
              onChanged={onChanged}
              onOpenEvening={() => setScreen('evening')}
              onOpenArchive={() => setScreen('archive')}
              focusReady={coverSettled && focusPending}
              onFocused={() => setFocusPending(false)}
              pendingAction={coverSettled ? linkAction : null}
              onActionHandled={() => setLinkAction(null)}
            />
          )}
          {screen === 'evening' && <EveningScreen db={db} version={version} onChanged={onChanged} onClose={closeDay} />}
          {screen === 'archive' && (
            <ArchiveScreen
              db={db}
              version={version}
              onClose={() => setScreen('today')}
              onOpenReview={(m) => {
                setReviewMonth(m);
                setScreen('review');
              }}
            />
          )}
          {screen === 'review' && reviewMonth && (
            <MonthlyReviewScreen
              db={db}
              month={reviewMonth}
              version={version}
              onChanged={onChanged}
              onClose={() => setScreen('archive')}
            />
          )}
        </ScreenEnter>
      </SafeAreaView>
      <Cover
        open={coverOpen}
        line={dayClosed ? '오늘도 수고했어요' : '오늘도 한 줄씩'}
        onClosed={() => setClosedShown(true)}
        onOpened={onCoverOpened}
        opening={coverOpening}
      >
        {dayClosed && closedShown && (
          <FadeIn delay={80} duration={240} rise={reduce ? 0 : 6}>
            <Pressable accessibilityRole="button" style={dimPressed(styles.reopen)} onPress={reopen}>
              <Txt style={styles.reopenText}>내일 다시 펼치기</Txt>
            </Pressable>
          </FadeIn>
        )}
      </Cover>
    </View>
  );
}

// 화면이 바뀌면 새 화면만 살짝 올라오며 나타난다(이전 화면은 바로 사라진다).
function ScreenEnter({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  return (
    <FadeIn duration={200} rise={reduce ? 0 : 6} style={styles.container}>
      {children}
    </FadeIn>
  );
}

// 저녁 마무리에서는 바탕(안전 영역 포함)이 저녁 종이색으로 천천히 바뀐다.
function EveningBackdrop({ on }: { on: boolean }) {
  const opacity = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const anim = Animated.timing(opacity, { toValue: on ? 1 : 0, duration: 250, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [on, opacity]);
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.evening, { opacity }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  evening: { backgroundColor: colors.paperEvening },
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
