import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { useLayoutClass } from '../ui/responsive';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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

type Step = 'email' | 'password';

// 이메일처럼 보이면 '다음'을 연다(서버가 최종 확인한다)
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// 토스처럼 한 번에 하나만 묻는다. 키보드가 오르면 표지를 접고 큰 질문을 위에 두며,
// 버튼은 키보드 바로 위에 폭 가득 붙는다. 비밀번호 칸은 이메일 위로 새로 나타나고 이메일은 아래에 남아 고칠 수 있다.
export function LoginScreen() {
  const wide = useLayoutClass() !== 'compact';
  const reduce = useReduceMotion();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false); // 키보드가 떠 있다
  const passwordRef = useRef<TextInput>(null);

  // 키보드와 같은 때에 표지를 접고 편다(KeyboardResize가 같은 곡선으로 화면 높이를 바꾼다)
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const follow = (on: boolean) => (e: KeyboardEvent) => {
      if (!reduce && ios && e.duration) {
        LayoutAnimation.configureNext({ duration: e.duration, update: { type: LayoutAnimation.Types.keyboard }, delete: { type: 'easeOut', property: 'opacity', duration: 120 } });
      }
      setTyping(on);
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', follow(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', follow(false)),
    ];
    return () => subs.forEach((x) => x.remove());
  }, [reduce]);

  const toPassword = () => {
    if (!looksLikeEmail(email)) return;
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setStep('password');
    setError(null);
    // 새 칸이 그려진 뒤에 옮겨야 키보드가 내려갔다 오르지 않는다
    requestAnimationFrame(() => passwordRef.current?.focus());
    AccessibilityInfo.announceForAccessibility('비밀번호를 입력해 주세요');
  };

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

  // 비밀번호 단계이거나(자동 완성으로) 비밀번호가 이미 채워졌으면 바로 로그인
  const atPassword = step === 'password' || password.length > 0;
  const disabled = busy || (atPassword ? !email || !password : !looksLikeEmail(email));
  const onPress = atPassword ? signIn : toPassword;
  const label = busy ? '로그인하는 중…' : atPassword ? '로그인' : '다음';
  const question = atPassword ? '비밀번호를 입력해 주세요' : '이메일을 입력해 주세요';
  // 키보드가 떠 있으면 표지 대신 질문을 위에, 버튼은 키보드에 붙인다
  const docked = typing;

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (error) setError(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Paper />
      <View style={[styles.flex, wide && styles.wide]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.container, docked && styles.containerTyping, wide && !docked && styles.containerWide]}
          keyboardShouldPersistTaps="handled"
        >
          {docked ? (
            <Txt variant="h2" accessibilityRole="header" style={styles.question}>
              {question}
            </Txt>
          ) : (
            <>
              <View style={styles.cover}>
                <BookCover width={262} height={354} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
              </View>
              <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
                나날 로그인
              </Txt>
            </>
          )}
          <View style={[styles.form, wide && styles.formWide]}>
            {atPassword && (
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
            )}
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
                returnKeyType={atPassword ? 'go' : 'next'}
                submitBehavior="submit"
                onSubmitEditing={atPassword ? signIn : toPassword}
                value={email}
                onChangeText={edit(setEmail)}
              />
            </View>
            {error && (
              <Txt style={styles.error} accessibilityRole="alert">
                {error}
              </Txt>
            )}
          </View>
        </ScrollView>
        <View style={[styles.ctaWrap, docked ? styles.ctaWrapDocked : wide && styles.formWideCta]}>
          <Pressable
            style={dimPressed([styles.button, docked && styles.buttonDocked, disabled && styles.disabled])}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy }}
            disabled={disabled}
            onPress={onPress}
          >
            <Txt variant="medium" style={styles.buttonText}>
              {label}
            </Txt>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 24, gap: 40 },
  // 키보드가 떠 있을 때: 질문을 위에 크게, 칸은 그 아래 바로
  containerTyping: { paddingTop: 32, gap: 28 },
  // 토스처럼 질문을 크게(화면의 주인공)
  question: { color: colors.ink, fontSize: 26, lineHeight: 34 },
  cover: { alignSelf: 'center' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  form: { gap: 14 },
  // 아이패드·Mac: 표지와 양식을 화면 가운데 한 묶음으로, 양식은 표지 폭과 비슷하게
  wide: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  containerWide: { justifyContent: 'center', alignItems: 'center' },
  formWide: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  formWideCta: { width: '100%', maxWidth: 420 + 64, alignSelf: 'center' },
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
  ctaWrap: { paddingHorizontal: 32, paddingBottom: 16 },
  // 키보드 위에 붙은 버튼: 여백·둥근 모서리 없이 폭 가득
  ctaWrapDocked: { paddingHorizontal: 0, paddingBottom: 0 },
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
