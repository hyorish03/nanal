import { initialVoiceState, VOICE_WATCHDOG_MS, type VoiceEvent, voiceReducer, type VoiceState, watchVoice } from './machine';

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) => events.reduce(voiceReducer, from);

describe('voiceReducer', () => {
  it('권한을 묻고, 듣고, 받아 적은 글로 끝난다', () => {
    expect(run([{ type: 'start' }])).toEqual({ kind: 'asking' });
    expect(run([{ type: 'start' }, { type: 'granted' }])).toEqual({ kind: 'starting' });
    expect(run([{ type: 'start' }, { type: 'granted' }, { type: 'started' }])).toEqual({ kind: 'listening', text: '' });
    expect(run([{ type: 'start' }, { type: 'started' }])).toEqual({ kind: 'listening', text: '' });
    const s = run([
      { type: 'start' },
      { type: 'granted' },
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

  it('늦게 온 aborted(지난 세션)는 새 세션을 건드리지 않는다', () => {
    const asking = run([{ type: 'start' }]);
    expect(voiceReducer(asking, { type: 'error', code: 'aborted' })).toBe(asking);
    const starting = run([{ type: 'start' }, { type: 'granted' }]);
    expect(voiceReducer(starting, { type: 'error', code: 'aborted' })).toBe(starting);
    const listening: VoiceState = { kind: 'listening', text: '책' };
    expect(voiceReducer(listening, { type: 'error', code: 'aborted' })).toBe(listening);
  });

  it('인식기가 켜지지 않아 시간이 다 되면 실패로 간다', () => {
    expect(run([{ type: 'start' }, { type: 'granted' }, { type: 'timeout' }])).toEqual({ kind: 'failed', code: 'timeout', text: '' });
  });

  it('멈추다 시간이 다 되면 받아 적은 글로 끝내고, 글이 없으면 no-speech', () => {
    expect(voiceReducer({ kind: 'stopping', text: ' 빨래 ' }, { type: 'timeout' })).toEqual({ kind: 'done', text: '빨래' });
    expect(voiceReducer({ kind: 'stopping', text: '' }, { type: 'timeout' })).toEqual({ kind: 'failed', code: 'no-speech', text: '' });
  });

  it('기다리는 상태가 아니면 timeout을 무시한다', () => {
    const listening: VoiceState = { kind: 'listening', text: 'a' };
    expect(voiceReducer(listening, { type: 'timeout' })).toBe(listening);
    const asking: VoiceState = { kind: 'asking' }; // 권한 창은 사용자가 답할 때까지 기다린다
    expect(voiceReducer(asking, { type: 'timeout' })).toBe(asking);
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

describe('watchVoice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('켜는 중, 멈추는 중이 8초를 넘으면 부른다', () => {
    for (const kind of ['starting', 'stopping'] as const) {
      const onTimeout = jest.fn();
      watchVoice(kind, onTimeout);
      jest.advanceTimersByTime(VOICE_WATCHDOG_MS - 1);
      expect(onTimeout).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    }
  });

  it('상태가 바뀌어 지우면 부르지 않는다', () => {
    const onTimeout = jest.fn();
    const clear = watchVoice('stopping', onTimeout);
    jest.advanceTimersByTime(VOICE_WATCHDOG_MS - 1);
    clear();
    jest.advanceTimersByTime(VOICE_WATCHDOG_MS);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('권한을 묻거나 듣는 중에는 재지 않는다', () => {
    const onTimeout = jest.fn();
    for (const kind of ['idle', 'asking', 'listening', 'done', 'failed'] as const) watchVoice(kind, onTimeout);
    jest.advanceTimersByTime(VOICE_WATCHDOG_MS * 10);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
