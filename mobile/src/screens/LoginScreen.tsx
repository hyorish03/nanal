import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { useLayoutClass } from '../ui/responsive';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OFFLINE_MESSAGE, userMessage } from '../lib/userError';
import { supabase } from '../supabase';
import { BookCover } from '../ui/BookCover';
import { colors, fonts } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { macText } from '../ui/desktop';
import { useReduceMotion } from '../ui/useReduceMotion';

const UNKNOWN_ERROR = '로그인하지 못했어요. 잠시 뒤에 다시 해 주세요';

// 서버의 영어 문구는 그대로 보여주지 않는다
function authErrorMessage(e: AuthError): string {
  if (isAuthRetryableFetchError(e)) return OFFLINE_MESSAGE;
  if (e.code === 'invalid_credentials' || e.message.includes('Invalid login credentials')) {
    return '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요';
  }
  if (e.code === 'email_not_confirmed' || e.message.includes('Email not confirmed')) {
    return '아직 이메일 인증을 하지 않았어요. 받은 메일함에서 인증해 주세요';
  }
  if (e.code === 'over_request_rate_limit' || e.status === 429) return '시도가 너무 잦았어요. 잠시 뒤에 다시 해 주세요';
  return UNKNOWN_ERROR;
}

// 큰 표지와, 키보드가 오르면 줄어드는 작은 수첩의 치수
const COVER_W = 262;
const COVER_H = 354;
const MINI_W = 58;
const MINI_SCALE = MINI_W / COVER_W;
const MINI_H = COVER_H * MINI_SCALE;
const PAD_X = 32;
const TOP = 40; // 키보드가 내려가 있을 때 표지 위 여백
const MINI_TOP = 16; // 키보드가 올라 있을 때 작은 수첩 위 여백
const GAP = 40; // 표지와 칸 사이
const FORM_H = 186; // 칸 두 개와 오류 한 줄
const MINI_GAP = 28; // 작은 수첩 줄과 칸 사이
// iOS 키보드가 오르내리는 곡선에 가깝게
const KEYBOARD_EASE = Easing.bezier(0.38, 0.7, 0.125, 1);

// 휴대폰: 키보드가 오르면 큰 표지가 왼쪽 위 작은 수첩으로 줄어들고 옆에 '나날 / 오늘도 한 줄씩'이 나타나며,
// 칸은 그 아래로 따라 올라온다. 로그인 버튼은 키보드 바로 위에 폭 가득 붙는다. 내리면 거꾸로.
// 아이패드·Mac은 화면이 넉넉해 표지와 양식을 가운데 한 묶음으로 그대로 둔다.
export function LoginScreen() {
  const wide = useLayoutClass() !== 'compact';
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false); // 키보드가 떠 있다
  const fold = useRef(new Animated.Value(0)).current; // 0 큰 표지, 1 작은 수첩
  const [roomH, setRoomH] = useState(0); // 키보드가 내려가 있을 때 쓸 수 있는 높이
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const follow = (on: boolean) => (e: KeyboardEvent) => {
      setTyping(on);
      Animated.timing(fold, {
        toValue: on ? 1 : 0,
        duration: reduce ? 0 : e.duration || 250,
        easing: KEYBOARD_EASE,
        useNativeDriver: true,
      }).start();
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', follow(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', follow(false)),
    ];
    return () => {
      subs.forEach((x) => x.remove());
      fold.stopAnimation();
    };
  }, [fold, reduce]);

  const signIn = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) setError(authErrorMessage(e));
    } catch (e) {
      setError(userMessage(e, UNKNOWN_ERROR));
    } finally {
      setBusy(false);
    }
  };

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (error) setError(null);
  };
  const disabled = busy || !email || !password;

  const fields = (
    <>
      <View style={styles.field}>
        <Txt style={styles.label}>이메일</Txt>
        <TextInput
          style={macText(styles.input)}
          placeholder="me@example.com"
          placeholderTextColor={colors.muted}
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={edit(setEmail)}
        />
      </View>
      <View style={styles.field}>
        <Txt style={styles.label}>비밀번호</Txt>
        <TextInput
          ref={passwordRef}
          style={macText(styles.input)}
          accessibilityLabel="비밀번호"
          secureTextEntry
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          value={password}
          onChangeText={edit(setPassword)}
          onSubmitEditing={signIn}
        />
      </View>
      {error && (
        <Txt style={styles.error} accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </>
  );
  const button = (docked: boolean) => (
    <Pressable
      style={dimPressed([styles.button, docked && styles.buttonDocked, disabled && styles.disabled])}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={signIn}
    >
      <Txt variant="medium" style={styles.buttonText}>
        {busy ? '로그인하는 중…' : '로그인'}
      </Txt>
    </Pressable>
  );

  if (wide) {
    return (
      <SafeAreaView style={styles.safe}>
        <Paper />
        <ScrollView contentContainerStyle={[styles.container, styles.containerWide]} keyboardShouldPersistTaps="handled">
          <View style={styles.cover}>
            <BookCover width={COVER_W} height={COVER_H} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
          </View>
          <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
            나날 로그인
          </Txt>
          <View style={[styles.form, styles.formWide]}>
            {fields}
            <View style={styles.wideButton}>{button(false)}</View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 화면이 낮으면(SE 등) 큰 표지를 조금 줄여 칸까지 한 화면에 들어오게 한다
  const big = roomH > 0 ? Math.min(1, Math.max(0.6, (roomH - TOP - GAP - FORM_H) / COVER_H)) : 1;
  // 큰 표지 가운데 → 작은 수첩 자리. 크기는 가운데를 기준으로 줄어드니 가운데끼리 옮긴다
  const bigCenterX = width / 2;
  const bigCenterY = TOP + (COVER_H * big) / 2;
  const miniCenterX = PAD_X + MINI_W / 2;
  const miniCenterY = MINI_TOP + MINI_H / 2;
  const coverStyle = {
    transform: [
      { translateX: fold.interpolate({ inputRange: [0, 1], outputRange: [0, miniCenterX - bigCenterX] }) },
      { translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [0, miniCenterY - bigCenterY] }) },
      { scale: fold.interpolate({ inputRange: [0, 1], outputRange: [big, MINI_SCALE] }) },
    ],
  };
  // 칸: 표지 아래 → 작은 수첩 줄 아래
  const formTop = TOP + COVER_H * big + GAP;
  const formMiniTop = MINI_TOP + MINI_H + MINI_GAP;
  const formStyle = {
    transform: [{ translateY: fold.interpolate({ inputRange: [0, 1], outputRange: [0, formMiniTop - formTop] }) }],
  };
  // 작은 수첩 옆 글: 표지가 거의 다 줄었을 때 살짝 밀려 들어온다
  const titleStyle = {
    opacity: fold.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] }),
    transform: [{ translateX: fold.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Paper />
      {/* 빈 종이를 누르면 키보드를 내린다 */}
      <Pressable
        style={styles.flex}
        onPress={Keyboard.dismiss}
        accessible={false}
        onLayout={(e) => {
          if (!typing) setRoomH(e.nativeEvent.layout.height);
        }}
      >
        <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
          나날 로그인
        </Txt>
        <Animated.View
          style={[styles.bigCover, { left: bigCenterX - COVER_W / 2, top: bigCenterY - COVER_H / 2 }, coverStyle]}
          accessible={false}
        >
          <BookCover width={COVER_W} height={COVER_H} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
        </Animated.View>
        <Animated.View style={[styles.miniTitle, titleStyle]} pointerEvents="none" accessible={false}>
          <Txt style={styles.miniName}>나날</Txt>
          <Txt variant="hand" style={styles.miniLine}>
            오늘도 한 줄씩
          </Txt>
        </Animated.View>
        <Animated.View style={[styles.form, styles.formPhone, { top: formTop }, formStyle]}>{fields}</Animated.View>
      </Pressable>
      {/* 키보드가 오르면 여백·둥근 모서리 없이 키보드 위에 붙는다 */}
      <View style={typing ? styles.ctaDocked : styles.cta}>{button(typing)}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: PAD_X, paddingTop: TOP, paddingBottom: 40, gap: GAP },
  cover: { alignSelf: 'center' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  bigCover: { position: 'absolute', width: COVER_W, height: COVER_H },
  miniTitle: { position: 'absolute', left: PAD_X + MINI_W + 16, top: MINI_TOP, height: MINI_H, justifyContent: 'center', gap: 2 },
  miniName: { fontFamily: fonts.title, fontSize: 26, lineHeight: 32, color: colors.ink },
  miniLine: { fontSize: 22, lineHeight: 26 },
  form: { gap: 18 },
  formPhone: { position: 'absolute', left: PAD_X, right: PAD_X },
  // 아이패드·Mac: 표지와 양식을 화면 가운데 한 묶음으로, 양식은 표지 폭과 비슷하게
  containerWide: { justifyContent: 'center', alignItems: 'center' },
  formWide: { width: '100%', maxWidth: 420 },
  wideButton: { marginTop: 10 },
  field: { gap: 6 },
  label: { fontSize: 14, color: colors.muted },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 14 },
  cta: { paddingHorizontal: PAD_X, paddingBottom: 16 },
  ctaDocked: {},
  button: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDocked: { height: 56, borderRadius: 0 },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onDark },
});
