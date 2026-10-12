// expo-speech-recognition 오류 코드(Web Speech API 이름) → 한국어 문구
const MESSAGES: Record<string, string> = {
  'not-allowed': '설정에서 마이크와 음성 인식을 켜 주세요',
  'no-speech': '말소리를 듣지 못했어요. 다시 말해 볼까요?',
  network: '음성 인식에 인터넷이 필요해요. 글로 적어 주세요.',
  interrupted: '전화나 알림 때문에 멈췄어요. 다시 말해 주세요.',
  busy: '음성 인식이 바빠요. 잠시 뒤 다시 해 주세요.',
  'language-not-supported': '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.',
  'service-not-allowed': '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.',
};

export function voiceErrorMessage(code: string): string {
  return MESSAGES[code] ?? '음성 인식이 멈췄어요. 다시 해 주세요.';
}
