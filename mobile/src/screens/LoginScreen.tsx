import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabase';

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
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) setError(authErrorMessage(e));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.title} accessibilityRole="header">
          나날
        </Text>
        <TextInput
          style={styles.input}
          placeholder="이메일"
          accessibilityLabel="이메일"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호"
          accessibilityLabel="비밀번호"
          secureTextEntry
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={signIn}
        />
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Pressable
          style={[styles.button, busy && styles.disabled]}
          accessibilityRole="button"
          disabled={busy || !email || !password}
          onPress={signIn}
        >
          <Text style={styles.buttonText}>{busy ? '로그인 중…' : '로그인'}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: '#b00020' },
  button: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
