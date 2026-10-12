import { voiceErrorMessage } from './errors';

describe('voiceErrorMessage', () => {
  it('알려진 코드는 그에 맞는 문구', () => {
    expect(voiceErrorMessage('not-allowed')).toBe('마이크와 음성 인식이 꺼져 있어요. 설정에서 켜 주세요');
    expect(voiceErrorMessage('no-speech')).toBe('말소리를 듣지 못했어요. 다시 말해 주세요');
    expect(voiceErrorMessage('network')).toBe('음성 인식에 인터넷이 필요해요. 글로 적어 주세요');
    expect(voiceErrorMessage('interrupted')).toBe('전화나 알림 때문에 멈췄어요. 다시 말해 주세요');
    expect(voiceErrorMessage('busy')).toBe('지금은 음성 인식을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요');
    expect(voiceErrorMessage('language-not-supported')).toBe('이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요');
    expect(voiceErrorMessage('service-not-allowed')).toBe('이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요');
  });

  it('모르는 코드는 일반 문구', () => {
    expect(voiceErrorMessage('audio-capture')).toBe('음성 인식이 멈췄어요. 다시 해 주세요');
    expect(voiceErrorMessage('something-new')).toBe('음성 인식이 멈췄어요. 다시 해 주세요');
  });

  it('문구 끝에 마침표를 찍지 않는다', () => {
    for (const code of ['not-allowed', 'no-speech', 'network', 'interrupted', 'busy', 'x']) {
      expect(voiceErrorMessage(code).endsWith('.')).toBe(false);
    }
  });
});
