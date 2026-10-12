import { initialVoiceState, type VoiceEvent, voiceReducer, type VoiceState } from './machine';

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) => events.reduce(voiceReducer, from);

describe('voiceReducer', () => {
  it('권한을 묻고, 듣고, 받아 적은 글로 끝난다', () => {
    expect(run([{ type: 'start' }])).toEqual({ kind: 'asking' });
    expect(run([{ type: 'start' }, { type: 'started' }])).toEqual({ kind: 'listening', text: '' });
    const s = run([
      { type: 'start' },
      { type: 'started' },
      { type: 'result', text: '책 사기' },
      { type: 'result', text: '책 사기 그리고 빨래' },
      { type: 'stop' },
    ]);
    expect(s).toEqual({ kind: 'stopping', text: '책 사기 그리고 빨래' });
    expect(voiceReducer(s, { type: 'end' })).toEqual({ kind: 'done', text: '책 사기 그리고 빨래' });
  });

  it('멈추는 중에 온 마지막 결과도 반영한다', () => {
    const s = run([{ type: 'start' }, { type: 'started' }, { type: 'result', text: '책' }, { type: 'stop' }, { type: 'result', text: '책 사기' }, { type: 'end' }]);
    expect(s).toEqual({ kind: 'done', text: '책 사기' });
  });

  it('권한이 없으면 not-allowed로 실패한다', () => {
    expect(run([{ type: 'start' }, { type: 'denied' }])).toEqual({ kind: 'failed', code: 'not-allowed', text: '' });
  });

  it('아무 말도 없이 끝나면 no-speech', () => {
    expect(run([{ type: 'start' }, { type: 'started' }, { type: 'result', text: '  ' }, { type: 'end' }])).toEqual({
      kind: 'failed',
      code: 'no-speech',
      text: '',
    });
  });

  it('받아 적은 글이 있는데 no-speech 오류가 오면 그 글로 끝낸다', () => {
    const s = run([{ type: 'start' }, { type: 'started' }, { type: 'result', text: '빨래' }, { type: 'error', code: 'no-speech' }]);
    expect(s).toEqual({ kind: 'done', text: '빨래' });
  });

  it('다른 오류는 받아 적은 글을 들고 실패한다', () => {
    const s = run([{ type: 'start' }, { type: 'started' }, { type: 'result', text: '빨래' }, { type: 'error', code: 'network' }]);
    expect(s).toEqual({ kind: 'failed', code: 'network', text: '빨래' });
  });

  it('직접 취소(aborted)하면 처음으로 돌아간다', () => {
    expect(run([{ type: 'start' }, { type: 'started' }, { type: 'error', code: 'aborted' }])).toEqual({ kind: 'idle' });
  });

  it('끝났거나 실패한 뒤 다시 시작할 수 있고, 듣는 중에는 start를 무시한다', () => {
    const failed: VoiceState = { kind: 'failed', code: 'network', text: 'x' };
    expect(voiceReducer(failed, { type: 'start' })).toEqual({ kind: 'asking' });
    const listening: VoiceState = { kind: 'listening', text: 'a' };
    expect(voiceReducer(listening, { type: 'start' })).toBe(listening);
  });

  it('듣기 전에 온 end, result는 무시한다', () => {
    expect(voiceReducer(initialVoiceState, { type: 'end' })).toBe(initialVoiceState);
    expect(voiceReducer(initialVoiceState, { type: 'result', text: 'a' })).toBe(initialVoiceState);
  });

  it('reset은 언제든 처음으로', () => {
    expect(voiceReducer({ kind: 'listening', text: 'a' }, { type: 'reset' })).toEqual({ kind: 'idle' });
  });
});
