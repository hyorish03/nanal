import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { useLayoutClass } from '../ui/responsive';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OFFLINE_MESSAGE, userMessage } from '../lib/userError';
import { supabase } from '../supabase';
import { BookCover } from '../ui/BookCover';
import { colors, fonts } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { dimPressed } from '../ui/press';
import { macText } from '../ui/desktop';

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

export function LoginScreen() {
  const wide = useLayoutClass() !== 'compact';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

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

  const disabled = busy || !email || !password;
  return (
    <SafeAreaView style={styles.safe}>
      <Paper />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.container, wide && styles.containerWide]} keyboardShouldPersistTaps="handled">
          <View style={styles.cover}>
            <BookCover width={262} height={354} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
          </View>
          <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
            나날 로그인
          </Txt>
          <View style={[styles.form, wide && styles.formWide]}>
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
                textContentType="emailAddress"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                value={email}
                onChangeText={setEmail}
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
                onChangeText={setPassword}
                onSubmitEditing={signIn}
              />
            </View>
            {error && (
              <Txt style={styles.error} accessibilityRole="alert">
                {error}
              </Txt>
            )}
            <Pressable
              style={dimPressed([styles.button, disabled && styles.disabled])}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              onPress={signIn}
            >
              <Txt variant="medium" style={styles.buttonText}>
                {busy ? '로그인하는 중…' : '로그인'}
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 40, gap: 40 },
  cover: { alignSelf: 'center' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  form: { gap: 14 },
  // 아이패드·Mac: 표지와 양식을 화면 가운데 한 묶음으로, 양식은 표지 폭과 비슷하게
  containerWide: { justifyContent: 'center', alignItems: 'center' },
  formWide: { width: '100%', maxWidth: 420 },
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
  button: {
    marginTop: 10,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onDark },
});
