import { useLayoutClass } from '../ui/responsive';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  type KeyboardEvent,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  ALREADY_REGISTERED,
  isEmailLike,
  isEmailNotConfirmed,
  isExistingAccount,
  MIN_PASSWORD,
  RESEND_UNKNOWN,
  SIGN_IN_UNKNOWN,
  SIGN_UP_UNKNOWN,
  signInErrorMessage,
  signUpErrorMessage,
} from '../lib/authErrors';
import { parseAuthLink } from '../lib/deepLink';
import { AUTH_CONFIRMED_URL, PRIVACY_URL } from '../lib/links';
import { userMessage } from '../lib/userError';
import { supabase } from '../supabase';
import { BookCover } from '../ui/BookCover';
import { colors, fonts, HIT } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { macText } from '../ui/desktop';
import { useEvent } from '../ui/useEvent';
import { useReduceMotion } from '../ui/useReduceMotion';

// 한 화면이 세 장면을 오간다: 로그인, 새 노트 만들기(가입), 인증 메일 안내
type Mode = 'login' | 'signup' | 'sent';
const MODE_NAME: Record<Mode, string> = { login: '로그인', signup: '새 노트 만들기', sent: '메일함을 확인해 주세요' };

const RESEND_COOLDOWN = 30; // 인증 메일을 다시 보낸 뒤 쉬는 초
const CONFIRMED_NOTICE = '인증됐어요. 로그인해 주세요';
const LINK_FAILED_NOTICE = '인증 링크가 만료됐거나 이미 쓰였어요. 로그인해 보고, 안 되면 인증 메일을 다시 받아 주세요';

// 콜드 스타트 주소(인증 링크)는 프로세스당 한 번만 본다. 로그아웃으로 화면이 다시 떠도 안내를 되풀이하지 않게.
// Main의 consumeInitialUrl과는 따로 둔다(위젯 주소로 켜졌다면 로그인 뒤 Main이 그대로 처리해야 하므로).
let initialAuthLinkSeen = false;

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
const UNCONFIRMED_H = 64; // 인증 안 됨 오류는 두 줄이고 '다시 보내기'가 붙는다
const MINI_GAP = 28; // 작은 수첩 줄과 칸 사이
// iOS 키보드가 오르내리는 곡선에 가깝게
const KEYBOARD_EASE = Easing.bezier(0.38, 0.7, 0.125, 1);

// 휴대폰: 키보드가 오르면 큰 표지가 왼쪽 위 작은 수첩으로 줄어들고 옆에 '나날 / 오늘도 한 줄씩'이 나타나며,
// 칸은 그 아래로 따라 올라온다. 로그인 버튼은 키보드 바로 위에 폭 가득 붙는다. 내리면 거꾸로.
// 가입은 큰 표지 없이 처음부터 면지색 작은 수첩 머리를 쓰고, 버튼만 똑같이 키보드 위에 붙는다.
// 아이패드·Mac은 화면이 넉넉해 표지와 양식을 가운데 한 묶음으로 그대로 둔다.
export function LoginScreen() {
  const wide = useLayoutClass() !== 'compact';
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false); // 로그인 오류가 '인증 안 됨'이라 다시 보내기를 붙인다
  const [notice, setNotice] = useState<string | null>(null); // 인증 링크로 돌아왔을 때의 안내
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0); // 다시 보내기까지 남은 초
  const [typing, setTyping] = useState(false); // 키보드가 떠 있다
  const fold = useRef(new Animated.Value(0)).current; // 0 큰 표지, 1 작은 수첩
  const fade = useRef(new Animated.Value(1)).current; // 장면이 바뀔 때 잠깐 흐려졌다 돌아온다
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

  // 다시 보내기 쉬는 시간을 1초씩 줄인다
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 장면 바꾸기. 짧게 흐려졌다 돌아오고(동작 줄이기면 바로), 스크린 리더에 새 장면 이름을 알린다.
  // 비밀번호와 오류는 장면마다 새로 시작하고, 이메일은 이어서 쓴다.
  const switchMode = useEvent((next: Mode, nextNotice: string | null = null) => {
    Keyboard.dismiss();
    fade.stopAnimation();
    const apply = () => {
      setMode(next);
      setPassword('');
      setError(null);
      setUnconfirmed(false);
      setResendNote(null);
      setNotice(nextNotice);
      AccessibilityInfo.announceForAccessibility(nextNotice ? `${MODE_NAME[next]}. ${nextNotice}` : MODE_NAME[next]);
    };
    if (reduce) {
      fade.setValue(1);
      apply();
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      apply();
      Animated.timing(fade, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  });

  // 인증 메일의 링크(nanal://auth/confirmed)로 돌아오면 로그인 장면에 안내를 띄운다. 세션은 여기서 만들지 않는다.
  const onAuthLink = useEvent((url: string | null) => {
    const link = parseAuthLink(url);
    if (!link) return;
    const text = link === 'confirmed' ? CONFIRMED_NOTICE : LINK_FAILED_NOTICE;
    if (mode !== 'login') {
      switchMode('login', text);
      return;
    }
    setError(null);
    setUnconfirmed(false);
    setNotice(text);
    AccessibilityInfo.announceForAccessibility(text);
  });
  useEffect(() => {
    if (!initialAuthLinkSeen) {
      initialAuthLinkSeen = true;
      Linking.getInitialURL().then(onAuthLink, () => {});
    }
    const sub = Linking.addEventListener('url', (e) => onAuthLink(e.url));
    return () => sub.remove();
  }, [onAuthLink]);

  const signIn = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    setResendNote(null);
    setNotice(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) {
        setError(signInErrorMessage(e));
        setUnconfirmed(isEmailNotConfirmed(e));
      }
    } catch (e) {
      setError(userMessage(e, SIGN_IN_UNKNOWN));
    } finally {
      setBusy(false);
    }
  };

  const canSignUp = isEmailLike(email) && password.length >= MIN_PASSWORD && consent;
  const signUp = async () => {
    if (busy || !canSignUp) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: AUTH_CONFIRMED_URL },
      });
      if (e) setError(signUpErrorMessage(e));
      else if (isExistingAccount(data.user)) setError(ALREADY_REGISTERED);
      // 세션이 바로 오면(이메일 인증을 꺼 둔 경우) App이 로그인 상태를 듣고 알아서 넘어간다
      else if (!data.session) switchMode('sent');
    } catch (e) {
      setError(userMessage(e, SIGN_UP_UNKNOWN));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending || cooldown > 0 || !isEmailLike(email)) return;
    setResending(true);
    setResendNote(null);
    let note: { ok: boolean; text: string };
    try {
      const { error: e } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: AUTH_CONFIRMED_URL },
      });
      note = e ? { ok: false, text: signUpErrorMessage(e, RESEND_UNKNOWN) } : { ok: true, text: '다시 보냈어요' };
    } catch (e) {
      note = { ok: false, text: userMessage(e, RESEND_UNKNOWN) };
    }
    setResending(false);
    setResendNote(note);
    if (note.ok) setCooldown(RESEND_COOLDOWN);
    AccessibilityInfo.announceForAccessibility(note.text);
  };

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (error) {
      setError(null);
      setUnconfirmed(false);
      setResendNote(null);
    }
  };
  const signup = mode === 'signup';
  const disabled = busy || (signup ? !canSignUp : !email || !password);
  const submit = signup ? signUp : signIn;

  // 인증 메일 다시 보내기. 쉬는 동안에는 남은 초를 보여 주고 누를 수 없다.
  const resendButton = (label: string, small: boolean) => {
    const off = resending || cooldown > 0;
    return (
      <View style={small ? styles.resendSmall : styles.resendBlock}>
        <Pressable
          style={dimPressed([styles.textButton, small && styles.textButtonSmall])}
          accessibilityRole="button"
          accessibilityState={{ disabled: off, busy: resending }}
          disabled={off}
          hitSlop={small ? { top: 6, bottom: 6 } : undefined}
          onPress={resend}
        >
          <Txt style={[styles.textButtonText, small && styles.textButtonTextSmall, off && styles.textButtonOff]}>
            {resending ? '보내는 중…' : cooldown > 0 ? `${cooldown}초 뒤에 다시 보낼 수 있어요` : label}
          </Txt>
        </Pressable>
        {resendNote && (
          <Txt
            style={[styles.resendNote, !resendNote.ok && styles.resendNoteError, !small && styles.center]}
            accessibilityLiveRegion="polite"
          >
            {resendNote.text}
          </Txt>
        )}
      </View>
    );
  };

  const emailField = (
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
        textContentType={signup ? 'emailAddress' : 'username'}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={email}
        onChangeText={edit(setEmail)}
      />
    </View>
  );
  const passwordField = (
    <View style={styles.field}>
      <Txt style={styles.label}>{signup ? `비밀번호 (${MIN_PASSWORD}자 이상)` : '비밀번호'}</Txt>
      <TextInput
        ref={passwordRef}
        style={macText(styles.input)}
        accessibilityLabel={signup ? `비밀번호, ${MIN_PASSWORD}자 이상` : '비밀번호'}
        secureTextEntry
        autoCorrect={false}
        autoComplete={signup ? 'new-password' : 'current-password'}
        textContentType={signup ? 'newPassword' : 'password'}
        passwordRules={signup ? `minlength: ${MIN_PASSWORD};` : undefined}
        returnKeyType={signup ? 'done' : 'go'}
        value={password}
        onChangeText={edit(setPassword)}
        onSubmitEditing={signup ? undefined : signIn}
      />
    </View>
  );
  const errorLine = error && (
    <Txt style={styles.error} accessibilityRole="alert">
      {error}
    </Txt>
  );

  const loginFields = (
    <>
      {emailField}
      {passwordField}
      {errorLine}
      {error && unconfirmed && resendButton('인증 메일 다시 보내기', true)}
      {!error && notice && (
        <Txt style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Txt>
      )}
    </>
  );

  const openPrivacy = () => {
    Linking.openURL(PRIVACY_URL).catch(() => setError('처리방침을 열지 못했어요. 잠시 뒤에 다시 해 주세요'));
  };
  const toggleConsent = () => setConsent((c) => !c);
  // 체크 상자가 줄 전체의 이름을 갖고, 처리방침 열기는 스크린 리더의 동작으로도 고를 수 있게 한다
  const consentRow = (
    <View style={styles.consentRow}>
      <Pressable
        style={styles.checkHit}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel="개인정보 처리방침을 읽었고 동의해요. 회고 정리에 AI를 쓸 때 그 글이 Anthropic으로 보내져요"
        accessibilityActions={[{ name: 'activate' }, { name: 'privacy', label: '개인정보 처리방침 열기' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'privacy' ? openPrivacy() : toggleConsent())}
        onPress={toggleConsent}
      >
        <View style={[styles.check, consent && styles.checkOn]}>
          {consent && (
            <Svg width={14} height={14} viewBox="0 0 14 14">
              <Path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" stroke={colors.onDark} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
      </Pressable>
      <Txt style={styles.consentText} onPress={toggleConsent} accessible={false}>
        <Txt style={styles.consentLink} onPress={openPrivacy} accessibilityRole="link">
          개인정보 처리방침
        </Txt>
        을 읽었고 동의해요. 회고 정리에 AI를 쓸 때 그 글이 Anthropic으로 보내져요.
      </Txt>
    </View>
  );

  const signupHead = (
    <>
      <Pressable
        style={dimPressed(styles.back)}
        accessibilityRole="button"
        accessibilityLabel="로그인으로 돌아가기"
        onPress={() => switchMode('login')}
      >
        <Txt style={styles.backText}>‹ 로그인</Txt>
      </Pressable>
      <View style={styles.signupHeader}>
        {/* 표지를 넘긴 안쪽 면지 같은 작은 수첩 */}
        <View style={styles.endpaperBook} accessible={false} />
        <View style={styles.signupTitles}>
          <Txt style={styles.signupTitle} accessibilityRole="header">
            새 노트 만들기
          </Txt>
          <Txt variant="hand" style={styles.signupLine}>
            첫 장을 펼쳐 볼까요
          </Txt>
        </View>
      </View>
    </>
  );
  const signupFields = (
    <>
      {emailField}
      {passwordField}
      {consentRow}
      {errorLine}
    </>
  );

  const button = (docked: boolean) => (
    <Pressable
      style={dimPressed([styles.button, docked && styles.buttonDocked, disabled && styles.disabled])}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={submit}
    >
      <Txt variant="medium" style={styles.buttonText}>
        {signup ? (busy ? '만드는 중…' : '가입하기') : busy ? '로그인하는 중…' : '로그인'}
      </Txt>
    </Pressable>
  );
  // 로그인 버튼 아래 가입 입구. 키보드가 떠 버튼이 붙어 있는 동안은 숨긴다(키보드를 내리면 보인다).
  const toSignup = (
    <View style={styles.switchRow}>
      <Txt style={styles.switchHint}>처음이세요?</Txt>
      <Pressable style={dimPressed(styles.switchHit)} accessibilityRole="button" onPress={() => switchMode('signup')}>
        <Txt variant="medium" style={styles.switchLink}>
          새 노트 만들기
        </Txt>
      </Pressable>
    </View>
  );

  const sentBody = (
    <View style={styles.sentBody}>
      <Envelope />
      <Txt style={styles.sentTitle} accessibilityRole="header">
        메일함을 확인해 주세요
      </Txt>
      <Txt style={styles.sentText}>
        <Txt variant="medium" style={styles.sentEmail}>
          {email.trim()}
        </Txt>
        으로 인증 링크를 보냈어요. 링크를 누른 뒤 여기로 돌아와 로그인하면 돼요.
      </Txt>
      <Txt variant="hand" style={styles.sentHand}>
        메일이 안 보이면 스팸함도 봐 주세요
      </Txt>
    </View>
  );
  const sentActions = (
    <>
      <Pressable style={dimPressed(styles.button)} accessibilityRole="button" onPress={() => switchMode('login')}>
        <Txt variant="medium" style={styles.buttonText}>
          로그인하러 가기
        </Txt>
      </Pressable>
      {resendButton('메일 다시 보내기', false)}
    </>
  );

  const faded = { opacity: fade };

  if (wide) {
    return (
      <SafeAreaView style={styles.safe}>
        <Paper />
        <Animated.View style={[styles.flex, faded]}>
          <ScrollView contentContainerStyle={[styles.container, styles.containerWide]} keyboardShouldPersistTaps="handled">
            {mode === 'login' && (
              <>
                <View style={styles.cover}>
                  <BookCover width={COVER_W} height={COVER_H} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
                </View>
                <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
                  나날 로그인
                </Txt>
                <View style={[styles.form, styles.formWide]}>
                  {loginFields}
                  <View style={styles.wideButton}>{button(false)}</View>
                  {toSignup}
                </View>
              </>
            )}
            {mode === 'signup' && (
              <View style={[styles.form, styles.formWide]}>
                {signupHead}
                {signupFields}
                <View style={styles.wideButton}>{button(false)}</View>
              </View>
            )}
            {mode === 'sent' && (
              <View style={[styles.formWide, styles.sentWide]}>
                {sentBody}
                {sentActions}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (mode === 'signup') {
    return (
      <SafeAreaView style={styles.safe}>
        <Paper />
        <Animated.View style={[styles.flex, faded]}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.signupScroll} keyboardShouldPersistTaps="handled">
            {signupHead}
            <View style={styles.form}>{signupFields}</View>
          </ScrollView>
          {/* 로그인과 같이, 키보드가 오르면 여백·둥근 모서리 없이 키보드 위에 붙는다 */}
          <View style={typing ? styles.ctaDocked : styles.cta}>{button(typing)}</View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (mode === 'sent') {
    return (
      <SafeAreaView style={styles.safe}>
        <Paper />
        <Animated.View style={[styles.flex, faded]}>
          <View style={styles.sentPhone}>{sentBody}</View>
          <View style={styles.cta}>{sentActions}</View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // 화면이 낮으면(SE 등) 큰 표지를 조금 줄여 칸까지 한 화면에 들어오게 한다
  const formH = FORM_H + (unconfirmed ? UNCONFIRMED_H : 0);
  const big = roomH > 0 ? Math.min(1, Math.max(0.6, (roomH - TOP - GAP - formH) / COVER_H)) : 1;
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
      <Animated.View style={[styles.flex, faded]}>
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
          <Animated.View style={[styles.form, styles.formPhone, { top: formTop }, formStyle]}>{loginFields}</Animated.View>
        </Pressable>
        {/* 키보드가 오르면 여백·둥근 모서리 없이 키보드 위에 붙는다 */}
        <View style={typing ? styles.ctaDocked : styles.cta}>
          {button(typing)}
          {!typing && toSignup}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// 인증 메일 안내의 봉투. 붉은 점은 아직 읽지 않은 편지 표시
function Envelope() {
  return (
    <Svg width={120} height={90} viewBox="0 0 120 90" accessible={false}>
      <Rect x={6} y={10} width={108} height={72} rx={6} fill={colors.card} stroke={colors.navy} strokeWidth={2} />
      <Path d="M8 14 L60 52 L112 14" fill="none" stroke={colors.navy} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={98} cy={24} r={7} fill={colors.noteRed} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
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
  notice: { color: colors.navy, fontSize: 14 },
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
  // 로그인 아래 '처음이세요? 새 노트 만들기'
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 },
  switchHint: { fontSize: 14, color: colors.muted },
  switchHit: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: 4 },
  switchLink: { fontSize: 14, color: colors.navy, textDecorationLine: 'underline' },
  // 가입
  signupScroll: { flexGrow: 1, paddingHorizontal: PAD_X, paddingTop: 8, paddingBottom: 24, gap: 18 },
  back: { alignSelf: 'flex-start', minHeight: HIT, minWidth: HIT, justifyContent: 'center', marginLeft: -8, paddingHorizontal: 8 },
  backText: { fontSize: 15, color: colors.inkSoft },
  signupHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 6 },
  endpaperBook: {
    width: 44,
    height: 60,
    backgroundColor: colors.endpaper,
    borderWidth: 1,
    borderColor: colors.endpaperEdge,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    // 아래 깔린 속지 한 겹
    shadowColor: colors.pageEdge,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  signupTitles: { flex: 1, gap: 2 },
  signupTitle: { fontFamily: fonts.title, fontSize: 24, lineHeight: 32, color: colors.ink },
  signupLine: { fontSize: 20, lineHeight: 24 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginLeft: -12 },
  checkHit: { width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  consentText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.inkSoft, paddingTop: 11 },
  consentLink: { fontSize: 14, lineHeight: 21, color: colors.navy, textDecorationLine: 'underline' },
  // 인증 메일 안내
  sentPhone: { flex: 1, justifyContent: 'center', paddingHorizontal: PAD_X },
  sentWide: { gap: 12 },
  sentBody: { alignItems: 'center', gap: 12, paddingBottom: 24 },
  sentTitle: { fontFamily: fonts.title, fontSize: 26, lineHeight: 34, color: colors.ink, textAlign: 'center', marginTop: 28 },
  sentText: { fontSize: 15, lineHeight: 23, color: colors.inkSoft, textAlign: 'center' },
  sentEmail: { fontSize: 15, lineHeight: 23, color: colors.ink },
  sentHand: { fontSize: 21, lineHeight: 26, color: colors.noteRed, marginTop: 6, textAlign: 'center' },
  textButton: { minHeight: HIT, alignItems: 'center', justifyContent: 'center' },
  textButtonSmall: { minHeight: 32, alignItems: 'flex-start' },
  textButtonText: { fontSize: 14, color: colors.navy, textDecorationLine: 'underline' },
  textButtonTextSmall: { fontSize: 14 },
  textButtonOff: { color: colors.muted, textDecorationLine: 'none' },
  resendBlock: { marginTop: 6 },
  resendSmall: { marginTop: -10 },
  resendNote: { fontSize: 14, color: colors.navy },
  resendNoteError: { color: colors.danger },
});
