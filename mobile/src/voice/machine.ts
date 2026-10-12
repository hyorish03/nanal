// 말로 적기 흐름(스펙 11.5): 권한 묻기 → 듣기(중간 결과) → 멈춤 → 받아 적은 글. 음성은 다루지 않고 글만 들고 간다.
export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'listening'; text: string }
  | { kind: 'stopping'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'failed'; code: string; text: string };

export type VoiceEvent =
  | { type: 'start' } // 사용자가 말하기를 시작했다(권한 요청 전)
  | { type: 'denied' } // 권한이 거절됐다
  | { type: 'started' } // 인식기가 듣기 시작했다
  | { type: 'result'; text: string } // 지금까지 받아 적은 전체 글
  | { type: 'stop' } // 사용자가 "다 말했어요"를 눌렀다
  | { type: 'end' } // 인식기가 끝났다
  | { type: 'error'; code: string }
  | { type: 'reset' };

export const initialVoiceState: VoiceState = { kind: 'idle' };

const isActive = (s: VoiceState): s is Extract<VoiceState, { kind: 'listening' | 'stopping' }> =>
  s.kind === 'listening' || s.kind === 'stopping';

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'reset':
      return initialVoiceState;
    case 'start':
      return state.kind === 'idle' || state.kind === 'done' || state.kind === 'failed' ? { kind: 'asking' } : state;
    case 'denied':
      return state.kind === 'asking' ? { kind: 'failed', code: 'not-allowed', text: '' } : state;
    case 'started':
      return state.kind === 'asking' ? { kind: 'listening', text: '' } : state;
    case 'result':
      return isActive(state) ? { ...state, text: event.text } : state;
    case 'stop':
      return state.kind === 'listening' ? { kind: 'stopping', text: state.text } : state;
    case 'end': {
      if (!isActive(state)) return state;
      const text = state.text.trim();
      return text ? { kind: 'done', text } : { kind: 'failed', code: 'no-speech', text: '' };
    }
    case 'error': {
      if (event.code === 'aborted') return initialVoiceState;
      const text = isActive(state) ? state.text.trim() : '';
      if (event.code === 'no-speech' && text) return { kind: 'done', text };
      return { kind: 'failed', code: event.code, text };
    }
  }
}
