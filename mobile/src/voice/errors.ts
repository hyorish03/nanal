// expo-speech-recognition 오류 코드(Web Speech API 이름) → 한국어 문구. 한 문장 문구처럼 끝에 마침표를 찍지 않는다.
const UNSUPPORTED = '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요';

const MESSAGES: Record<string, string> = {
  'not-allowed': '마이크와 음성 인식이 꺼져 있어요. 설정에서 켜 주세요',
  'no-speech': '말소리를 듣지 못했어요. 다시 말해 주세요',
  network: '음성 인식에 인터넷이 필요해요. 글로 적어 주세요',
  interrupted: '전화나 알림 때문에 멈췄어요. 다시 말해 주세요',
  busy: '지금은 음성 인식을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요',
  'language-not-supported': UNSUPPORTED,
  'service-not-allowed': UNSUPPORTED,
};

export function voiceErrorMessage(code: string): string {
  return MESSAGES[code] ?? '음성 인식이 멈췄어요. 다시 해 주세요';
}
