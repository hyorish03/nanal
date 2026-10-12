import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme, NavigationContainer, StackActions, type Theme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Keyboard, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
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
import { LAMP_PAPER, LAMP_SHADE } from '../ui/lamp';
import { EASE_OUT } from '../ui/motion';
import { dimPressed } from '../ui/press';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { useReduceMotion } from '../ui/useReduceMotion';
import { takePendingAction } from '../widget/pendingAction';
import { reloadWidgets } from '../widget/reload';
import { ArchiveScreen } from './ArchiveScreen';
import { EveningScreen } from './EveningScreen';
import { MonthlyReviewScreen } from './MonthlyReviewScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { TodayScreen } from './TodayScreen';

export function Main({ db, userId }: { db: Db; userId: string }) {
  const [claim, setClaim] = useState<'pending' | 'ok' | 'mismatch' | 'error'>('pending');
  const [attempt, setAttempt] = useState(0); // 다시 시도를 누를 때마다 하나씩 늘린다

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
  }, [db, userId, attempt]);

  if (claim === 'pending')
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator accessibilityLabel="불러오는 중" color={colors.navy} />
      </SafeAreaView>
    );
  if (claim === 'mismatch' || claim === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.blocked}>
          <Txt style={styles.blockedText} accessibilityRole="alert">
            {claim === 'mismatch'
              ? '이 기기에는 다른 계정의 기록이 있어요. 그 계정으로 다시 로그인해 주세요.'
              : '이 기기의 기록을 확인하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'}
          </Txt>
          <View style={styles.blockedActions}>
            <Pressable accessibilityRole="button" style={dimPressed(styles.blockedPrimary)} onPress={() => setAttempt((n) => n + 1)}>
              <Txt variant="medium" style={styles.blockedPrimaryText}>
                다시 시도
              </Txt>
            </Pressable>
            {/* 이 기기에서만 로그아웃한다(오프라인이어도 로그인 화면으로 돌아가게) */}
            <Pressable
              accessibilityRole="button"
              style={dimPressed(styles.blockedSecondary)}
              onPress={() => supabase.auth.signOut({ scope: 'local' }).catch(() => {})}
            >
              <Txt>로그아웃</Txt>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }
  return <MainContent db={db} userId={userId} />;
}

// 'today'는 오늘 → 하루 마무리·지난 기록 → 월간 돌아보기 네이티브 스택이다(밀어 넣기, 가장자리 밀어 돌아가기).
type Screen = 'onboarding' | 'today';
type StackParams = { today: undefined; evening: undefined; archive: undefined; review: { month: string } };

const Stack = createNativeStackNavigator<StackParams>();
// 화면 사이에 흰 바탕이 비치지 않게 종이색으로 칠한다.
const navTheme: Theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.paper } };

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
  const nav = useNavigationContainerRef<StackParams>();
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverSettled, setCoverSettled] = useState(false); // 표지가 다 펼쳐졌다(포커스, 링크 동작은 이때부터)
  const [coverOpening, setCoverOpening] = useState<CoverOpening>('turn');
  const [focusPending, setFocusPending] = useState(true); // 표지가 열린 뒤 입력칸 포커스는 한 번만
  const [linkAction, setLinkAction] = useState<LinkAction | null>(null);
  const screenRef = useRef<Screen | null>(null);
  screenRef.current = screen;
  const [route, setRoute] = useState<keyof StackParams>('today'); // 저녁 바탕을 켤지 정하려고 맨 위 화면을 따라간다
  const reduce = useReduceMotion();

  // 위젯·컨트롤에서 열면 오늘 화면으로 가서(표지가 아직 덮여 있으면 펼친 뒤) 동작을 넘긴다. 온보딩 중이면 화면은 그대로 둔다.
  const runAction = useCallback((action: LinkAction | null) => {
    // 온보딩 중에 온 동작은 버린다(끝난 뒤 말로 적기가 갑자기 뜨지 않게).
    if (screenRef.current === 'onboarding') return;
    // 하루 마무리·지난 기록·월간 돌아보기에 있었으면 오늘까지 꺼낸다
    if (nav.isReady() && nav.canGoBack()) nav.dispatch(StackActions.popToTop());
    setCoverOpen(true);
    if (action === 'voice') setFocusPending(false); // 말로 적기 시트 뒤에서 키보드가 뜨지 않게
    setLinkAction(action);
  }, [nav]);

  const handleLink = useCallback((url: string | null) => {
    const link = parseDeepLink(url);
    if (link) runAction(link.action);
  }, [runAction]);

  useEffect(() => {
    if (consumeInitialUrl()) Linking.getInitialURL().then(handleLink, () => {});
    const sub = Linking.addEventListener('url', (e) => handleLink(e.url));
    return () => sub.remove();
  }, [handleLink]);

  // 컨트롤(iOS 18)은 주소 대신 App Group에 동작을 남기고 앱을 연다. 열릴 때 꺼내 같은 길로 보낸다.
  // 인텐트가 앱이 앞에 나온 직후에 실행되기도 해서 잠시 뒤 한 번 더 본다.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const action = takePendingAction();
      if (action) runAction(action);
    };
    const checkSoon = () => {
      check();
      clearTimeout(t);
      t = setTimeout(check, 600);
    };
    checkSoon();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSoon();
    });
    return () => {
      sub.remove();
      clearTimeout(t);
    };
  }, [runAction]);

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

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  const finishOnboarding = useCallback(() => {
    markOnboardingSeen(AsyncStorage);
    setScreen('today');
  }, []);

  return (
    <View style={styles.root}>
      {/* 남색 표지가 보이는 동안은 밝은 상태 막대 */}
      <StatusBar style={coverSettled ? 'dark' : 'light'} animated />
      <EveningBackdrop on={screen === 'today' && route === 'evening'} />
      <Paper />
      <SafeAreaView style={styles.container}>
        <ScreenEnter key={screen ?? 'none'} reduce={reduce}>
          {screen === 'onboarding' && <OnboardingScreen onDone={finishOnboarding} />}
          {screen === 'today' && (
            <NavigationContainer
              ref={nav}
              theme={navTheme}
              onStateChange={() => setRoute(nav.getCurrentRoute()?.name ?? 'today')}
            >
              <Stack.Navigator
                screenOptions={{
                  headerShown: false,
                  animation: reduce ? 'fade' : 'default',
                  contentStyle: styles.page,
                }}
              >
                <Stack.Screen name="today">
                  {({ navigation }) => (
                    <TodayScreen
                      db={db}
                      version={version}
                      onChanged={onChanged}
                      onOpenEvening={() => {
                        Keyboard.dismiss(); // 오늘은 스택 아래에 남아 있으니 키보드를 직접 내린다
                        navigation.navigate('evening');
                      }}
                      onOpenArchive={() => {
                        Keyboard.dismiss(); // 오늘은 스택 아래에 남아 있으니 키보드를 직접 내린다
                        navigation.navigate('archive');
                      }}
                      focusReady={coverSettled && focusPending}
                      onFocused={() => setFocusPending(false)}
                      pendingAction={coverSettled ? linkAction : null}
                      onActionHandled={() => setLinkAction(null)}
                    />
                  )}
                </Stack.Screen>
                {/* 하루 마무리는 등잔 불빛 종이를 깔고 밀려 들어온다. 닫으면(가장자리 밀기 포함) 오늘로 돌아가고 키보드는 올리지 않는다 */}
                <Stack.Screen
                  name="evening"
                  options={{ contentStyle: styles.evening }}
                  listeners={{ beforeRemove: () => Keyboard.dismiss() }}
                >
                  {({ navigation }) => (
                    <>
                      <LampShade />
                      <EveningScreen db={db} version={version} onChanged={onChanged} onClose={() => navigation.goBack()} />
                    </>
                  )}
                </Stack.Screen>
                <Stack.Screen name="archive">
                  {({ navigation }) => (
                    <ArchiveScreen
                      db={db}
                      version={version}
                      onClose={() => navigation.goBack()}
                      onOpenReview={(month) => navigation.navigate('review', { month })}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen name="review">
                  {({ navigation, route }) => (
                    <MonthlyReviewScreen
                      db={db}
                      month={route.params.month}
                      version={version}
                      onChanged={onChanged}
                      onClose={() => navigation.goBack()}
                    />
                  )}
                </Stack.Screen>
              </Stack.Navigator>
            </NavigationContainer>
          )}
        </ScreenEnter>
      </SafeAreaView>
      <SyncBar pending={pending} error={error} />
      <Cover
        open={coverOpen}
        line="오늘도 한 줄씩"
        onOpened={onCoverOpened}
        opening={coverOpening}
      >
      </Cover>
    </View>
  );
}

// 온보딩·오늘이 바뀌면 새 화면만 살짝 올라오며 나타난다(이전 화면은 바로 사라진다). 오늘 아래 화면은 스택이 밀어 넣는다.
function ScreenEnter({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  return (
    <FadeIn duration={200} rise={reduce ? 0 : 6} style={styles.container}>
      {children}
    </FadeIn>
  );
}

// 동기화 상태는 화면 위에 얹는다(나타나고 사라질 때 아래 글이 밀리지 않게).
// 대기는 2초 넘게 이어질 때만 보이고(적자마자 깜빡이지 않게), 실패는 바로 보인다.
const SYNC_LATE_MS = 2_000;
function SyncBar({ pending, error }: { pending: number; error: string | null }) {
  const insets = useSafeAreaInsets();
  const waiting = pending > 0;
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!waiting) return;
    const t = setTimeout(() => setLate(true), SYNC_LATE_MS);
    return () => clearTimeout(t);
  }, [waiting]);
  if (!error && !(waiting && late)) return null;
  return (
    <View pointerEvents="none" style={[styles.syncBar, { top: insets.top }]}>
      <Txt style={styles.syncText} accessibilityLiveRegion="polite">
        {error ? '아직 올리지 못했어요. 자동으로 다시 시도할게요 (기록은 이 기기에 안전해요)' : `${pending}개를 올리는 중이에요`}
      </Txt>
    </View>
  );
}

// 하루 마무리에서는 바탕(안전 영역 포함)이 등잔 불빛 아래 종이처럼 바뀐다. 가운데는 밝고 가장자리는 옅게 그늘진다.
function EveningBackdrop({ on }: { on: boolean }) {
  const opacity = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const anim = Animated.timing(opacity, { toValue: on ? 1 : 0, duration: 250, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [on, opacity]);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.evening, { opacity }]}>
      <LampShade />
    </Animated.View>
  );
}

// 안전 영역 안쪽은 하루 마무리 화면이 같은 종이(LAMP_PAPER + 이 그늘)를 깔고 밀려 들어온다(아래 오늘 화면이 비치지 않게).
function LampShade() {
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="lamp" cx="50%" cy="42%" rx="75%" ry="65%">
            <Stop offset="0.5" stopColor={LAMP_SHADE} stopOpacity={0} />
            <Stop offset="1" stopColor={LAMP_SHADE} stopOpacity={0.04} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#lamp)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  evening: { backgroundColor: LAMP_PAPER },
  container: { flex: 1 }, // 배경은 root와 각 화면이 칠한다(저녁은 EveningBackdrop과 하루 마무리 화면이 칠한다)
  page: { backgroundColor: colors.paper },
  center: { justifyContent: 'center', alignItems: 'center' },
  blocked: { padding: 24, gap: 20 },
  blockedText: { fontSize: 16, lineHeight: 24 },
  blockedActions: { gap: 10 },
  blockedPrimary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  blockedPrimaryText: { color: colors.onDark },
  blockedSecondary: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  syncBar: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.postit, paddingVertical: 6, paddingHorizontal: 16 },
  syncText: { color: colors.postitText, fontSize: 13 },
});
