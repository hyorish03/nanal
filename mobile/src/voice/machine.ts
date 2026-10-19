// 말로 적기 흐름(스펙 11.5): 권한 묻기 → 인식기 켜기 → 듣기(중간 결과) → 멈춤 → 받아 적은 글. 음성은 다루지 않고 글만 들고 간다.
export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'starting' } // 권한을 받고 인식기를 켰다. start 이벤트를 기다린다
  | { kind: 'listening'; text: string }
  | { kind: 'stopping'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'failed'; code: string; text: string };

export type VoiceEvent =
  | { type: 'start' } // 사용자가 말하기를 시작했다(권한 요청 전)
  | { type: 'denied' } // 권한이 거절됐다
  | { type: 'granted' } // 권한을 받아 인식기를 켰다
  | { type: 'started' } // 인식기가 듣기 시작했다
  | { type: 'result'; text: string } // 지금까지 받아 적은 전체 글
  | { type: 'stop' } // 사용자가 "다 말했어요"를 눌렀다
  | { type: 'end' } // 인식기가 끝났다
  | { type: 'error'; code: string }
  | { type: 'timeout' } // 인식기가 제때 답하지 않았다(watchVoice)
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
    case 'granted':
      return state.kind === 'asking' ? { kind: 'starting' } : state;
    case 'started':
      return state.kind === 'asking' || state.kind === 'starting' ? { kind: 'listening', text: '' } : state;
    case 'result':
      return isActive(state) ? { ...state, text: event.text } : state;
    case 'stop':
      return state.kind === 'listening' ? { kind: 'stopping', text: state.text } : state;
    case 'end': {
      if (!isActive(state)) return state;
      const text = state.text.trim();
      return text ? { kind: 'done', text } : { kind: 'failed', code: 'no-speech', text: '' };
    }
    case 'timeout':
      // 켜지지 않으면 실패(글로 적기로), 멈추다 말았으면 end가 온 셈 치고 받아 적은 글을 넘긴다
      if (state.kind === 'starting') return { kind: 'failed', code: 'timeout', text: '' };
      return state.kind === 'stopping' ? voiceReducer(state, { type: 'end' }) : state;
    case 'error': {
      // abort는 시트를 닫을 때만 부른다. 열려 있는 동안 온 aborted는 지난 세션 것이라 버린다
      if (event.code === 'aborted') return state;
      const text = isActive(state) ? state.text.trim() : '';
      if (event.code === 'no-speech' && text) return { kind: 'done', text };
      return { kind: 'failed', code: event.code, text };
    }
  }
}

export const VOICE_WATCHDOG_MS = 8000;

// 인식기를 기다리는 상태(켜는 중, 멈추는 중)가 너무 길면 onTimeout을 부른다. 타이머를 지우는 함수를 돌려준다.
export function watchVoice(kind: VoiceState['kind'], onTimeout: () => void, ms = VOICE_WATCHDOG_MS): () => void {
  if (kind !== 'starting' && kind !== 'stopping') return () => {};
  const id = setTimeout(onTimeout, ms);
  return () => clearTimeout(id);
}
