import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { BookCover } from '../ui/BookCover';
import { colors, fonts } from '../ui/theme';
import { Txt } from '../ui/Txt';

function authErrorMessage(e: AuthError): string {
  if (isAuthRetryableFetchError(e)) return '네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도하세요';
  if (e.code === 'invalid_credentials' || e.message.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다';
  }
  if (e.code === 'email_not_confirmed' || e.message.includes('Email not confirmed')) {
    return '이메일 인증이 필요합니다';
  }
  return e.message;
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) setError(authErrorMessage(e));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !email || !password;
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.cover}>
            <BookCover width={262} height={354} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
          </View>
          <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
            나날 로그인
          </Txt>
          <View style={styles.form}>
            <View style={styles.field}>
              <Txt style={styles.label}>이메일</Txt>
              <TextInput
                style={styles.input}
                placeholder="me@example.com"
                placeholderTextColor={colors.faint}
                accessibilityLabel="이메일"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Txt style={styles.label}>비밀번호</Txt>
              <TextInput
                style={styles.input}
                placeholder="비밀번호"
                placeholderTextColor={colors.faint}
                accessibilityLabel="비밀번호"
                secureTextEntry
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
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
              style={[styles.button, disabled && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              onPress={signIn}
            >
              <Txt variant="medium" style={styles.buttonText}>
                {busy ? '펼치는 중…' : '노트 펼치기'}
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
