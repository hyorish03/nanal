import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, DefaultTheme, NavigationContainer, StackActions, type Theme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Keyboard, LayoutAnimation, Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Db } from '../db/types';
import { type CoverOpening, markCoverOpened, readCoverOpening } from '../lib/coverOpening';
import { consumeInitialUrl, type LinkAction, parseDeepLink } from '../lib/deepLink';
import { logicalDate } from '../lib/date';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
import { isTourDue, markTourDue, markTourSeen } from '../lib/todayTour';
import { listMonthLeftovers, markMonthRitual, readMonthRitualDue } from '../monthly/ritual';
import { useNotificationOpen, useNotificationSchedule } from '../notifications/scheduler';
import { supabase } from '../supabase';
import { claimOwner } from '../sync/owner';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { Cover } from '../ui/Cover';
import { confirmStartFresh, useDeletingAccount } from '../lib/account';
import { DeletingAccountOverlay } from '../ui/DeletingAccountOverlay';
import { FadeIn } from '../ui/FadeIn';
import { LAMP_PAPER, LAMP_SHADE } from '../ui/lamp';
import { EASE_IN_OUT, EASE_OUT } from '../ui/motion';
import { dimPressed } from '../ui/press';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { type Pane, PaneContext } from '../ui/pane';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { Sidebar, SidebarOpenButton, type SidebarKey } from '../ui/Sidebar';
import { useReduceMotion } from '../ui/useReduceMotion';
import { takePendingAction } from '../widget/pendingAction';
import { reloadWidgets } from '../widget/reload';
import { ArchiveScreen } from './ArchiveScreen';
import { EveningScreen } from './EveningScreen';
import { MonthlyReviewScreen } from './MonthlyReviewScreen';
import { MonthRitualSheet } from './MonthRitualSheet';
import { OnboardingScreen } from './OnboardingScreen';
import { SettingsScreen } from './SettingsScreen';
import { TodayScreen } from './TodayScreen';

const SIDEBAR_KEY = 'nanal.sidebarCollapsed';
const SIDEBAR_MS = 260;

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
    const mismatch = claim === 'mismatch';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.blocked}>
          <Txt style={styles.blockedText} accessibilityRole="alert">
            {mismatch
              ? '이 기기에는 다른 계정의 기록이 있어요. 그 계정으로 다시 로그인하거나, 이 기기의 기록을 지우고 지금 계정으로 시작할 수 있어요'
              : '이 기기의 기록을 확인하지 못했어요. 잠시 뒤에 다시 해 주세요'}
          </Txt>
          <View style={styles.blockedActions}>
            {mismatch ? (
              // 기록이 섞이지 않게 이전 계정 기록을 비우고 지금 계정을 주인으로 둔다(서버에 올라간 것은 남는다)
              <Pressable
                accessibilityRole="button"
                style={dimPressed(styles.blockedPrimary)}
                onPress={() => void confirmStartFresh(db, userId, () => setAttempt((n) => n + 1))}
              >
                <Txt variant="medium" style={styles.blockedPrimaryText}>
                  기록 지우고 이 계정으로 시작
                </Txt>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" style={dimPressed(styles.blockedPrimary)} onPress={() => setAttempt((n) => n + 1)}>
                <Txt variant="medium" style={styles.blockedPrimaryText}>
                  다시 시도
                </Txt>
              </Pressable>
            )}
            {/* 이 기기에서만 로그아웃한다(오프라인이어도 로그인 화면으로 돌아가게) */}
            <Pressable
              accessibilityRole="button"
              style={dimPressed(styles.blockedSecondary)}
              onPress={() => supabase.auth.signOut({ scope: 'local' }).catch(() => {})}
            >
              <Txt>{mismatch ? '로그아웃하고 이전 계정으로' : '로그아웃'}</Txt>
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
type StackParams = { today: undefined; evening: undefined; archive: undefined; review: { month: string }; settings: undefined };

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
  const linkActionRef = useRef<LinkAction | null>(null);
  linkActionRef.current = linkAction;
  const [ritualOpen, setRitualOpen] = useState(false); // 월초 정리 시트
  const [tourDue, setTourDue] = useState(false); // 온보딩 뒤 오늘 장 코치마크를 아직 안 봤다(그동안 입력칸 키보드를 올리지 않는다)
  const sidebarArchiveRef = useRef<View>(null); // 넓은 배치에서 코치마크가 가리키는 사이드바 '지난 기록'
  const [ritualChecked, setRitualChecked] = useState(false); // 첫 실행에 월초 정리를 따져 봤다(그 전에는 입력칸 키보드를 올리지 않는다)
  const [resumeTick, setResumeTick] = useState(0); // 앱이 다시 앞으로 나올 때마다 하나씩(새 달이 됐을 수 있다)
  const screenRef = useRef<Screen | null>(null);
  screenRef.current = screen;
  const [route, setRoute] = useState<keyof StackParams>('today'); // 저녁 바탕을 켤지 정하려고 맨 위 화면을 따라간다
  const reduce = useReduceMotion();
  // 아이패드·Mac(넓은 배치)에서는 왼쪽 사이드바가 오늘·하루 마무리·지난 기록을 바꾼다. 온보딩에는 없다.
  const wide = useLayoutClass() !== 'compact';
  // 아이패드·Mac에서 사이드바를 접어 둘 수 있다. 접은 상태는 기기에 기억한다(읽기 실패면 펼친 채로).
  // 접고 펼 때 사이드바가 왼쪽으로 미끄러지며 칸 폭이 줄고(본문이 그만큼 부드럽게 넓어진다), 펼 때는 거꾸로.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(true); // 접히는 동안에도 그려 둔다(다 접힌 뒤 뺀다)
  const sidebarOpen = useRef(new Animated.Value(1)).current; // 1 펼침, 0 접힘
  useEffect(() => {
    AsyncStorage.getItem(SIDEBAR_KEY)
      .then((v) => {
        const collapsed = v === '1';
        sidebarOpen.setValue(collapsed ? 0 : 1);
        setSidebarMounted(!collapsed);
        setSidebarCollapsed(collapsed);
      })
      .catch(() => {});
  }, [sidebarOpen]);
  const toggleSidebar = useCallback(() => {
    const collapse = !sidebarCollapsed;
    AsyncStorage.setItem(SIDEBAR_KEY, collapse ? '1' : '0').catch(() => {});
    sidebarOpen.stopAnimation();
    if (collapse) {
      // 다 접힌 뒤에 상태를 바꾼다: 본문 칸 폭(pane)과 안전 여백이 그때 한 번만 바뀐다
      const done = () => {
        setSidebarCollapsed(true);
        setSidebarMounted(false);
      };
      if (reduce) {
        sidebarOpen.setValue(0);
        done();
      } else Animated.timing(sidebarOpen, { toValue: 0, duration: SIDEBAR_MS, easing: EASE_IN_OUT, useNativeDriver: false }).start(done);
    } else {
      setSidebarCollapsed(false);
      setSidebarMounted(true);
      if (reduce) sidebarOpen.setValue(1);
      else Animated.timing(sidebarOpen, { toValue: 1, duration: SIDEBAR_MS, easing: EASE_IN_OUT, useNativeDriver: false }).start();
    }
  }, [reduce, sidebarCollapsed, sidebarOpen]);
  const sidebar = wide && screen === 'today' && !sidebarCollapsed;
  const sidebarDrawn = wide && screen === 'today' && sidebarMounted;
  const canReopenSidebar = wide && screen === 'today' && sidebarCollapsed;
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  const pane = useMemo<Pane>(
    () => ({ sidebar, width: windowW - insets.left - insets.right - (sidebar ? WIDE.sidebarWidth : 0) }),
    [sidebar, windowW, insets.left, insets.right],
  );

  // 위젯·컨트롤에서 열면 오늘 화면으로 가서(표지가 아직 덮여 있으면 펼친 뒤) 동작을 넘긴다. 온보딩 중이면 화면은 그대로 둔다.
  const runAction = useCallback((action: LinkAction | null) => {
    // 온보딩 중에 온 동작은 버린다(끝난 뒤 말로 적기가 갑자기 뜨지 않게).
    if (screenRef.current === 'onboarding') return;
    // 하루 마무리·지난 기록·월간 돌아보기에 있었으면 오늘까지 꺼낸다
    if (nav.isReady() && nav.canGoBack()) nav.dispatch(StackActions.popToTop());
    setRitualOpen(false); // 월초 정리 시트가 떠 있으면 내린다(포스트잇에 그대로 남는다)
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
    hasSeenOnboarding(AsyncStorage).then(async (seen) => {
      if (!seen) setLinkAction(null); // 온보딩보다 먼저 도착한 링크 동작은 버린다
      // 온보딩을 마치고 코치마크를 끝내기 전에 앱을 껐으면 이번에 이어서 본다
      if (seen) setTourDue(await isTourDue(AsyncStorage));
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
      // 처음 여는 날(온보딩)에는 온보딩의 책 펼치기가 여는 장면이라, 남색 표지는 기다리지 않고 짧게 흐려지며 비켜선다
      if (screenRef.current === 'onboarding') {
        setCoverOpening('fade');
        setCoverOpen(true);
        return;
      }
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
      if (state === 'active') {
        refresh();
        setResumeTick((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [refresh]);

  // 월초 정리(스펙 11.10): 새 달에 처음 표지가 다 펼쳐진 뒤, 지난달까지 끝내지 못한 일이 있으면 한 번 띄운다.
  // 온보딩 중·표지가 펼쳐지기 전·위젯 동작(말로 적기 등)을 처리하는 중에는 따지지 않는다(다음 기회에 본다).
  // 따져 본 달은 일이 없어도 남긴다. 그달 중간에 동기화로 지난 일이 내려와도 갑자기 뜨지 않게.
  const onToday = screen === 'today';
  useEffect(() => {
    if (!onToday || !coverSettled) return;
    if (linkActionRef.current) {
      setRitualChecked(true);
      return;
    }
    let alive = true;
    const now = new Date();
    readMonthRitualDue(AsyncStorage, now)
      .then(async (due) => {
        if (!due || !alive) return;
        const leftovers = await listMonthLeftovers(db, logicalDate(now));
        if (!alive) return;
        await markMonthRitual(AsyncStorage, now);
        if (!alive || leftovers.length === 0 || linkActionRef.current) return;
        Keyboard.dismiss(); // 오늘 입력칸에 올라온 키보드가 시트 뒤에 남지 않게
        setFocusPending(false); // 시트를 닫은 뒤 키보드가 저절로 올라오지 않게
        setRitualOpen(true);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setRitualChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [onToday, coverSettled, resumeTick, db]);

  const openMonthRitual = useCallback(() => {
    Keyboard.dismiss();
    setRitualOpen(true);
  }, []);
  const closeMonthRitual = useCallback(() => setRitualOpen(false), []);
  const openReviewFromRitual = useCallback(
    (month: string) => {
      if (nav.isReady()) nav.navigate('review', { month });
    },
    [nav],
  );

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  // 사이드바에서 고르면 밀어 넣지 않고 칸만 바꾼다(넓은 배치의 스택은 애니메이션이 없다).
  // 오늘은 늘 스택 맨 아래에 두어(입력하던 글·스크롤이 그대로) 그 위에 고른 화면 하나만 얹는다.
  const selectSection = useCallback((key: SidebarKey) => {
    if (!nav.isReady()) return;
    Keyboard.dismiss();
    const state = nav.getRootState();
    if (!state) return;
    if (key === 'today') {
      if (nav.canGoBack()) nav.dispatch(StackActions.popToTop());
      return;
    }
    // 이미 그 화면이 오늘 바로 위에 있으면(월간 돌아보기를 연 지난 기록 등) 그 화면까지만 꺼낸다
    if (state.routes[1]?.name === key) {
      if (state.index > 1) nav.dispatch(StackActions.pop(state.index - 1));
      return;
    }
    const base = state.routes[0]; // 오늘(같은 key라 다시 마운트되지 않는다)
    nav.dispatch(CommonActions.reset({ index: 1, routes: [{ key: base.key, name: base.name }, { name: key }] }));
  }, [nav]);

  // 기록이 바뀔 때마다 앞으로 7일 치 알림을 다시 짠다(스펙 "알림")
  useNotificationSchedule(db, version);

  // 하루 마무리 알림을 눌러 열면 표지가 다 펼쳐진 뒤 하루 마무리로 간다. 온보딩·코치마크 중이면 오늘 장에 둔다.
  const [notifyScreen, setNotifyScreen] = useState<'evening' | null>(null);
  useNotificationOpen(
    useCallback((target: 'evening' | null) => {
      if (!target) return;
      setFocusPending(false); // 오늘 입력칸 키보드가 올라오지 않게
      setNotifyScreen(target);
    }, []),
  );
  useEffect(() => {
    if (!notifyScreen || !coverSettled || screen === null) return;
    setNotifyScreen(null);
    if (screen !== 'today' || tourDue) return;
    setRitualOpen(false);
    selectSection(notifyScreen);
  }, [notifyScreen, coverSettled, screen, tourDue, selectSection]);

  const deletingAccount = useDeletingAccount();

  // 끝내도 건너뛰어도 오늘 장에서 코치마크를 한 번 본다(이 기기에서 온보딩을 거친 사람만)
  const finishOnboarding = useCallback(() => {
    markOnboardingSeen(AsyncStorage);
    void markTourDue(AsyncStorage);
    setTourDue(true);
    setScreen('today');
  }, []);
  const finishTour = useCallback(() => {
    void markTourSeen(AsyncStorage);
    setTourDue(false); // 이제 입력칸에 포커스가 간다
  }, []);
  // 표지가 펼쳐지고 월초 정리를 따져 본 뒤, 시트·위젯 동작·다른 화면이 없을 때만 띄운다(있으면 닫힐 때까지 미룬다)
  const tourReady = tourDue && coverSettled && ritualChecked && !ritualOpen && route === 'today' && !linkAction && !deletingAccount;

  return (
    <View style={styles.root}>
      {/* 남색 표지가 화면을 덮는 동안은 밝은 상태 막대(넓은 창에서는 표지가 종이 책상 가운데 놓여 늘 어둡게) */}
      <StatusBar style={coverSettled || wide ? 'dark' : 'light'} animated />
      <EveningBackdrop on={screen === 'today' && route === 'evening'} />
      <Paper />
      <View style={styles.shell}>
        {sidebarDrawn && (
          <Animated.View
            style={{
              width: sidebarOpen.interpolate({ inputRange: [0, 1], outputRange: [0, WIDE.sidebarWidth + insets.left] }),
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={{
                flex: 1,
                flexDirection: 'row', // 사이드바가 칸 높이 끝까지 늘어나게(가로 줄의 자식으로 둔다)
                width: WIDE.sidebarWidth + insets.left,
                opacity: sidebarOpen.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                transform: [{ translateX: sidebarOpen.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }) }],
              }}
            >
              <Sidebar
                current={route === 'review' ? 'archive' : route}
                onSelect={selectSection}
                onCollapse={toggleSidebar}
                archiveRef={sidebarArchiveRef}
              />
            </Animated.View>
          </Animated.View>
        )}
        {/* 사이드바를 접으면 왼쪽 위에 펴기 버튼이 뜬다. 화면 머리(계정·'‹ 오늘')를 덮지 않게 그만큼 아래로 내린다 */}
        <SafeAreaView
          style={[styles.container, canReopenSidebar && styles.belowOpenButton]}
          edges={sidebar ? ['top', 'bottom', 'right'] : undefined}
        >
          <SyncBar pending={pending} error={error} reduce={reduce} />
          <ScreenEnter key={screen ?? 'none'} reduce={reduce}>
            {screen === 'onboarding' && (
              // 넓은 창에서는 휴대폰 한 장 폭으로 가운데에 모은다(늘어난 온보딩이 되지 않게)
              <View style={wide ? styles.onboardingWide : styles.container}>
                <OnboardingScreen onDone={finishOnboarding} />
              </View>
            )}
            {screen === 'today' && (
              <PaneContext.Provider value={pane}>
                <NavigationContainer
                  ref={nav}
                  theme={navTheme}
                  onStateChange={() => setRoute(nav.getCurrentRoute()?.name ?? 'today')}
                >
                  <Stack.Navigator
                    screenOptions={{
                      headerShown: false,
                      // 넓은 배치는 사이드바로 칸을 바꾸므로 밀어 넣지 않고 바로 바뀐다
                      animation: wide ? 'none' : reduce ? 'fade' : 'default',
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
                          onOpenSettings={() => {
                            Keyboard.dismiss();
                            navigation.navigate('settings');
                          }}
                          focusReady={coverSettled && ritualChecked && focusPending && !tourDue}
                          onFocused={() => setFocusPending(false)}
                          pendingAction={coverSettled ? linkAction : null}
                          onActionHandled={() => setLinkAction(null)}
                          tourReady={tourReady}
                          onTourDone={finishTour}
                          sidebarArchiveRef={sidebarArchiveRef}
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
                          onOpenMonthRitual={openMonthRitual}
                          onChanged={onChanged}
                        />
                      )}
                    </Stack.Screen>
                    <Stack.Screen name="settings">
                      {({ navigation }) => <SettingsScreen db={db} onClose={() => navigation.goBack()} />}
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
                <MonthRitualSheet
                  db={db}
                  visible={ritualOpen}
                  onClose={closeMonthRitual}
                  onChanged={onChanged}
                  onOpenReview={openReviewFromRitual}
                />
              </PaneContext.Provider>
            )}
          </ScreenEnter>
        </SafeAreaView>
        {canReopenSidebar && <SidebarOpenButton onPress={toggleSidebar} />}
      </View>
      <Cover
        open={coverOpen}
        line="오늘도 한 줄씩"
        onOpened={onCoverOpened}
        opening={coverOpening}
      >
      </Cover>
      <DeletingAccountOverlay visible={deletingAccount} />
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

// 동기화 상태는 안전 영역 바로 아래 한 줄로 끼워 넣는다. 위에 얹으면 화면 맨 위 '‹ 오늘'·계정 버튼을 덮어서,
// 보일 때만 화면을 한 줄 아래로 민다(나타나고 사라질 때 부드럽게).
// 대기는 2초 넘게 이어질 때만 보이고(적자마자 깜빡이지 않게), 실패는 바로 보인다.
const SYNC_LATE_MS = 2_000;
function SyncBar({ pending, error, reduce }: { pending: number; error: string | null; reduce: boolean }) {
  const waiting = pending > 0;
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!waiting) return;
    const t = setTimeout(() => setLate(true), SYNC_LATE_MS);
    return () => clearTimeout(t);
  }, [waiting]);
  const shown = !!error || (waiting && late);
  const prevShown = useRef(shown);
  if (prevShown.current !== shown) {
    prevShown.current = shown;
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
  }
  if (!shown) return null;
  return (
    <View pointerEvents="none" style={styles.syncBar}>
      <Txt style={styles.syncText} accessibilityLiveRegion="polite">
        {error ? '아직 올리지 못했어요. 기록은 이 기기에 있고, 곧 다시 올릴게요' : `${pending}개를 올리는 중이에요`}
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

const ONBOARDING_MAX_W = 560;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  evening: { backgroundColor: LAMP_PAPER },
  shell: { flex: 1, flexDirection: 'row' },
  onboardingWide: { flex: 1, width: '100%', maxWidth: ONBOARDING_MAX_W, alignSelf: 'center' },
  container: { flex: 1 },
  belowOpenButton: { paddingTop: 40 }, // 배경은 root와 각 화면이 칠한다(저녁은 EveningBackdrop과 하루 마무리 화면이 칠한다)
  page: { backgroundColor: colors.paper },
  center: { justifyContent: 'center', alignItems: 'center' },
  blocked: { padding: 24, gap: 20 },
  blockedText: { fontSize: 16, lineHeight: 24 },
  blockedActions: { gap: 10 },
  blockedPrimary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  blockedPrimaryText: { color: colors.onDark },
  blockedSecondary: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  syncBar: { backgroundColor: colors.postit, paddingVertical: 6, paddingHorizontal: 16 },
  syncText: { color: colors.postitText, fontSize: 13 },
});
