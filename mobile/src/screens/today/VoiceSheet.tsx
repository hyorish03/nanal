import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { EASE_OUT } from '../../ui/motion';
import { colors, HIT, SCREEN_X } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { voiceErrorMessage } from '../../voice/errors';
import { initialVoiceState, voiceReducer } from '../../voice/machine';

type Props = {
  visible: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void; // 받아 적은 글로 정리하러 간다
  onTypeInstead: (text: string) => void; // 글로 적기로 바꾼다(권한 없음, 인식 불가)
  onDismissed?: () => void; // 시트가 완전히 내려간 뒤(iOS). 다음 시트는 여기서 연다
};

// 소리 크기 이벤트(100ms마다). 0 아래는 들리지 않는 소리다.
const VOLUME = { enabled: true, intervalMillis: 100 };
const MAX_VOLUME = 10;

// 말로 적기(스펙 11.5, Voice 목업). 음성 파일은 남기지 않고 받아 적은 글만 넘긴다.
export function VoiceSheet({ visible, onClose, onTranscript, onTypeInstead, onDismissed }: Props) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const handedOff = useRef(false);
  const triedOnDevice = useRef(false);
  const retriedOnline = useRef(false);
  const reduce = useReduceMotion();
  const level = useRef(new Animated.Value(0)).current; // 0 조용함 → 1 크게 말함
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent('start', () => dispatch({ type: 'started' }));
  useSpeechRecognitionEvent('result', (e) => dispatch({ type: 'result', text: e.results[0]?.transcript ?? '' }));
  useSpeechRecognitionEvent('end', () => dispatch({ type: 'end' }));
  // 듣는 동안 마이크 뒤 고리가 목소리 크기를 따라 커진다
  useSpeechRecognitionEvent('volumechange', (e) => {
    if (!listeningRef.current) return;
    const v = Math.min(1, Math.max(0, e.value / MAX_VOLUME));
    Animated.timing(level, { toValue: v, duration: 100, easing: EASE_OUT, useNativeDriver: true }).start();
  });
  useSpeechRecognitionEvent('error', (e) => {
    // 기기 안 인식이 ko-KR을 못 하면 서버 인식으로 한 번만 다시 시도한다(음성 파일은 여전히 남기지 않는다).
    if (e.error === 'language-not-supported' && triedOnDevice.current && !retriedOnline.current) {
      retriedOnline.current = true;
      triedOnDevice.current = false;
      ExpoSpeechRecognitionModule.start({
        lang: 'ko-KR',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: false,
        recordingOptions: { persist: false },
        volumeChangeEventOptions: VOLUME,
      });
      return;
    }
    dispatch({ type: 'error', code: e.error });
  });

  const start = async () => {
    dispatch({ type: 'start' });
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      dispatch({ type: 'denied' });
      return;
    }
    const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    triedOnDevice.current = onDevice;
    retriedOnline.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: onDevice,
      recordingOptions: { persist: false },
      volumeChangeEventOptions: VOLUME,
    });
  };

  // 열리면 바로 듣기 시작하고, 닫히면 인식을 버린다.
  useEffect(() => {
    if (!visible) return;
    handedOff.current = false;
    retriedOnline.current = false;
    dispatch({ type: 'reset' });
    start().catch(() => dispatch({ type: 'error', code: 'client' }));
    return () => ExpoSpeechRecognitionModule.abort();
  }, [visible]);

  useEffect(() => {
    if (state.kind === 'done' && !handedOff.current) {
      handedOff.current = true;
      onTranscript(state.text);
    }
    // onTranscript는 매 렌더 새 함수라 의존성에서 뺀다
  }, [state]);

  const listening = state.kind === 'listening';
  const text = state.kind === 'listening' || state.kind === 'stopping' || state.kind === 'failed' ? state.text : '';
  const failed = state.kind === 'failed' ? state : null;
  listeningRef.current = listening;

  // 듣기가 끝나면 고리를 바로 거둔다
  useEffect(() => {
    if (listening) return;
    level.stopAnimation();
    level.setValue(0);
  }, [listening, level]);
  useEffect(() => () => level.stopAnimation(), [level]);

  const ringOpacity = level.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });
  const ringScale = reduce ? 1.12 : level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onDismissed}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.headerButton} onPress={onClose}>
            <Txt>닫기</Txt>
          </Pressable>
          <Txt variant="medium" accessibilityRole="header">
            말로 적기
          </Txt>
          <View style={styles.headerButton} />
        </View>

        <Txt variant="title" style={styles.lead}>
          편하게 말해 보세요
        </Txt>
        <Txt style={styles.hint}>정리되지 않아도 괜찮아요. 할 일만 골라 둘게요.</Txt>

        <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptInner}>
          <Txt style={text ? styles.transcript : styles.placeholder} accessibilityLiveRegion="polite">
            {text || (listening ? '듣고 있어요…' : ' ')}
          </Txt>
        </ScrollView>

        {failed ? (
          <View style={styles.actions}>
            <Txt style={styles.error} accessibilityRole="alert">
              {voiceErrorMessage(failed.code)}
            </Txt>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => start().catch(() => dispatch({ type: 'error', code: 'client' }))}>
              <Txt>다시 말하기</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={() => onTypeInstead(failed.text)}>
              <Txt style={styles.primaryText}>글로 적기</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <View style={styles.micWrap}>
              {listening && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={listening ? '다 말했어요' : '받아 적는 중'}
                accessibilityState={{ disabled: !listening }}
                disabled={!listening}
                style={[styles.mic, !listening && styles.micBusy]}
                onPress={() => {
                  dispatch({ type: 'stop' });
                  ExpoSpeechRecognitionModule.stop();
                }}
              >
                {listening ? (
                  <Svg width={28} height={28} viewBox="0 0 18 18" fill="none">
                    <Rect x={6} y={1.5} width={6} height={10} rx={3} stroke={colors.onDark} strokeWidth={1.4} />
                    <Path d="M3 8.5a6 6 0 0 0 12 0M9 14.5v2.5" stroke={colors.onDark} strokeWidth={1.4} strokeLinecap="round" />
                  </Svg>
                ) : (
                  <ActivityIndicator color={colors.onDark} />
                )}
              </Pressable>
            </View>
            <Txt style={styles.micHint}>{listening ? '다 말했으면 눌러 주세요' : '받아 적고 있어요'}</Txt>
          </View>
        )}

        <Txt style={styles.privacy}>음성은 저장하지 않고, 받아 적은 글만 정리에 써요.</Txt>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingBottom: 28, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 },
  headerButton: { minWidth: HIT, minHeight: HIT, justifyContent: 'center' },
  lead: { fontSize: 24, marginTop: 8 },
  hint: { color: colors.muted, fontSize: 14 },
  transcriptBox: { flexGrow: 0, maxHeight: 260, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft },
  transcriptInner: { paddingVertical: 16 },
  transcript: { fontSize: 18, lineHeight: 28 },
  placeholder: { fontSize: 18, lineHeight: 28, color: colors.faint },
  actions: { alignItems: 'center', gap: 12, marginTop: 'auto' },
  micWrap: { width: 76, height: 76 },
  ring: { position: 'absolute', top: 0, left: 0, width: 76, height: 76, borderRadius: 38, backgroundColor: colors.navy },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  micBusy: { opacity: 0.6 },
  micHint: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, textAlign: 'center' },
  secondary: { minHeight: HIT, paddingHorizontal: 18, justifyContent: 'center' },
  primary: { minHeight: 48, alignSelf: 'stretch', borderRadius: 24, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark },
  privacy: { color: colors.faint, fontSize: 12, textAlign: 'center' },
});
