import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { organizeText } from '../../ai/client';
import { giveAiConsent, hasAiConsent } from '../../ai/consent';
import { AI_MESSAGES, AiError } from '../../ai/errors';
import { dateLabel, type DraftItem, toDrafts } from '../../ai/organize';
import type { Db } from '../../db/types';
import { addItem } from '../../items/repo';
import { supabase } from '../../supabase';
import { userMessage } from '../../lib/userError';
import { useKeyboardResizePaused } from '../../ui/KeyboardResize';
import { RuledPaper } from '../../ui/RuledPaper';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { colors, fonts, HIT, SCREEN_X } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { Paper } from '../../ui/Paper';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { openPrivacy } from '../../lib/links';
import { FadeIn } from '../../ui/FadeIn';
import { dimPressed } from '../../ui/press';
import { useScaledText } from '../../ui/typeScale';

type Props = {
  db: Db;
  visible: boolean;
  today: string;
  initialText?: string; // 계획 D: 받아 적은 글을 넘겨받는다
  autoOrganize?: boolean; // 받아 적은 글이면 열자마자 정리한다
  onClose: () => void;
  onAdded: (notice?: string) => void;
};
type Step = 'write' | 'loading' | 'review';

// 두서없이 쓴(말한) 글 → AI 정리 → "이렇게 정리했어요"에서 고른 것만 넣는다(스펙 11.5).
// 처음 정리할 때는 Anthropic으로 보내도 되는지 한 번 묻는다(AiConsentPanel). 말로 적기에서 넘어와도 같다.
export function OrganizeSheet({ db, visible, today, initialText = '', autoOrganize = false, onClose, onAdded }: Props) {
  const [step, setStep] = useState<Step>('write');
  const inputStyle = useScaledText(styles.input);
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<string | null>(null); // 동의를 기다리는 글. 있으면 동의 패널을 띄운다
  const [consentBusy, setConsentBusy] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false); // 상태 갱신 전에 연타해도 한 번만 부른다
  const req = useRef(0); // 시트를 닫았다 다시 열면 이전 요청의 결과는 버린다
  const reduce = useReduceMotion();
  useKeyboardResizePaused(visible);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    req.current += 1;
    busy.current = false;
    setSaving(false);
    if (!visible) return;
    setStep('write');
    setText(initialText);
    setDrafts([]);
    setError(null);
    setConsentFor(null);
    setConsentBusy(false);
    if (autoOrganize && initialText.trim()) organize(initialText);
    // organize는 매 렌더 새 함수라 의존성에서 뺀다
  }, [visible, initialText, autoOrganize]);

  const organize = async (input: string = text) => {
    const raw = input.trim();
    if (!raw || busy.current) return;
    busy.current = true;
    const id = req.current;
    setError(null);
    try {
      // 아직 동의하지 않았으면 보내지 않고 묻는다
      if (!(await hasAiConsent(supabase))) {
        if (alive.current && id === req.current) setConsentFor(raw);
        return;
      }
      if (!alive.current || id !== req.current) return;
      setStep('loading');
      const items = await organizeText(supabase, raw, today);
      if (!alive.current || id !== req.current) return;
      setDrafts(toDrafts(items));
      setStep('review');
    } catch (e) {
      if (!alive.current || id !== req.current) return;
      if (e instanceof AiError && e.code === 'offline') {
        // 오프라인이면 쓴 글을 그대로 메모로 남긴다
        try {
          await addItem(db, { kind: 'note', text: raw });
          onAdded('인터넷이 없어 메모로 남겨 뒀어요');
        } catch (err) {
          setError(userMessage(err));
          setStep('write');
        }
        return;
      }
      setError(userMessage(e, AI_MESSAGES.ai_failed));
      setStep('write');
    } finally {
      if (id === req.current) busy.current = false;
    }
  };

  const agree = async () => {
    const raw = consentFor;
    if (raw === null || consentBusy) return;
    setConsentBusy(true);
    try {
      await giveAiConsent(supabase);
      if (!alive.current) return;
      setConsentFor(null);
      await organize(raw);
    } catch (e) {
      // 동의를 저장하지 못했다(대개 오프라인). 패널은 남겨 메모로 남기기를 고를 수 있게 한다
      if (alive.current) setError(userMessage(e));
    } finally {
      if (alive.current) setConsentBusy(false);
    }
  };

  // AI 없이: 쓴 글을 그대로 메모 한 줄로 남긴다(오프라인일 때와 같다)
  const keepAsNote = async () => {
    const raw = consentFor;
    if (raw === null || consentBusy) return;
    setConsentBusy(true);
    try {
      await addItem(db, { kind: 'note', text: raw });
      onAdded('AI 없이 메모로 남겨 뒀어요');
    } catch (e) {
      if (alive.current) setError(userMessage(e));
    } finally {
      if (alive.current) setConsentBusy(false);
    }
  };

  const picked = drafts.filter((d) => d.picked);
  const add = async () => {
    if (busy.current || picked.length === 0) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    const saved: string[] = [];
    try {
      for (const d of picked) {
        await addItem(db, { kind: d.kind, text: d.text, date: d.date });
        saved.push(d.id);
      }
      onAdded();
    } catch (e) {
      if (saved.length > 0) {
        // 일부만 들어갔다: 다시 눌러도 겹쳐 넣지 않도록 알리고 닫는다
        onAdded('일부만 넣었어요. 남은 글은 다시 정리해 볼까요?');
      } else if (alive.current) {
        setError(userMessage(e));
      }
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  };

  const toggle = (id: string) => setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, picked: !d.picked } : d)));
  const loading = step === 'loading';
  const canOrganize = !loading && text.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Paper />
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable accessibilityRole="button" style={dimPressed(styles.headerButton)} onPress={onClose}>
              <Txt>닫기</Txt>
            </Pressable>
            <Txt variant="medium" accessibilityRole="header">
              정리해서 넣기
            </Txt>
            <View style={styles.headerButton} />
          </View>

          {step !== 'review' ? (
            <>
              <Txt variant="title" style={styles.lead}>
                편하게 적어 보세요
              </Txt>
              <Txt style={styles.hint}>정리되지 않아도 괜찮아요. 할 일만 골라 둘게요.</Txt>
              <RuledPaper lineHeight={26} style={styles.paper}>
              <TextInput
                style={inputStyle}
                multiline
                editable={!loading}
                value={text}
                onChangeText={setText}
                maxLength={2000}
                accessibilityLabel="정리할 글"
                placeholder="예: 오늘 책도 사야 하고 빨래도 널어야 돼. 내일은 치과에 전화하기"
                placeholderTextColor={colors.muted}
              />
              </RuledPaper>
              <Txt style={styles.note}>정리하면 쓴 글이 Claude(Anthropic)로 보내져요. 글은 저장하지 않아요. 인터넷이 없으면 메모로 남겨요</Txt>
              {error && (
                <Txt style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOrganize, busy: loading }}
                disabled={!canOrganize}
                style={dimPressed([styles.primary, !canOrganize && styles.disabled])}
                onPress={() => organize()}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onDark} accessibilityLabel="정리하는 중" />
                ) : (
                  <Txt style={[styles.primaryText, !canOrganize && styles.primaryTextDisabled]}>정리하기</Txt>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Txt variant="title" style={styles.lead}>
                이렇게 정리했어요
              </Txt>
              <Txt style={styles.hint}>{drafts.length ? '넣을 것만 골라 주세요.' : '넣을 만한 것을 찾지 못했어요.'}</Txt>
              {drafts.map((d, i) => {
                const when = dateLabel(d.date, today);
                // 정리된 줄이 위에서부터 차례로 살짝 올라오며 나타난다(동작 줄이기면 흐리게만)
                return (
                  <FadeIn key={d.id} duration={200} delay={i * 40} rise={reduce ? 0 : 6}>
                    <Pressable
                      accessibilityRole="checkbox"
                      disabled={saving}
                      accessibilityState={{ checked: d.picked }}
                      accessibilityLabel={`${d.kind === 'task' ? '할 일' : '메모'} ${d.text}${when ? `, ${when}` : ''}`}
                      style={dimPressed(styles.row)}
                      onPress={() => toggle(d.id)}
                    >
                      <View style={[styles.check, d.picked && styles.checkOn]}>
                        {d.picked && <Txt style={styles.checkMark}>✓</Txt>}
                      </View>
                      <StatusSymbol kind={d.kind === 'task' ? 'open' : 'note'} />
                      <Txt style={styles.rowText}>{d.text}</Txt>
                      {!!when && (
                        <Txt variant="hand" style={styles.when}>
                          {when}
                        </Txt>
                      )}
                    </Pressable>
                  </FadeIn>
                );
              })}
              {error && (
                <Txt style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              )}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} style={dimPressed(styles.secondary)} onPress={() => setStep('write')}>
                  <Txt>다시 쓰기</Txt>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: picked.length === 0 || saving, busy: saving }}
                  disabled={picked.length === 0 || saving}
                  style={dimPressed([styles.primary, styles.grow, (picked.length === 0 || saving) && styles.disabled])}
                  onPress={add}
                >
                  {saving ? <ActivityIndicator color={colors.onDark} accessibilityLabel="넣는 중" /> : <Txt style={[styles.primaryText, picked.length === 0 && styles.primaryTextDisabled]}>{picked.length}개 넣기</Txt>}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {consentFor !== null && (
        <AiConsentPanel busy={consentBusy} error={error} onAgree={agree} onKeepAsNote={keepAsNote} onClose={() => setConsentFor(null)} />
      )}
    </Modal>
  );
}

type ConsentProps = { busy: boolean; error: string | null; onAgree: () => void; onKeepAsNote: () => void; onClose: () => void };

// 처음 한 번: 무엇을 어디로 보내는지 보여 주고 동의를 받는다. 동의하지 않아도 쓴 글은 메모로 남길 수 있다
function AiConsentPanel({ busy, error, onAgree, onKeepAsNote, onClose }: ConsentProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.consentWrap}>
      <Pressable style={styles.consentDim} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.consent, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.handle} />
        <Txt variant="title" accessibilityRole="header" style={styles.consentTitle}>
          AI로 정리해도 될까요?
        </Txt>
        <Txt style={styles.consentLead}>정리하면 적은 글을 Anthropic의 AI(Claude)가 읽고 할 일·메모와 날짜로 나눠 줘요.</Txt>
        <View style={styles.consentBox}>
          <ConsentLine label="보내는 것" text="말하거나 적은 글, 오늘 날짜" />
          <ConsentLine label="보내지 않는 것" text="이미 적어 둔 할 일, 기분, 회고, 이메일" />
          <ConsentLine label="보낸 글은" text="나날 서버에 저장하지 않아요" />
        </View>
        {error && (
          <Txt style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          style={dimPressed([styles.primary, styles.consentPrimary])}
          onPress={onAgree}
        >
          {busy ? <ActivityIndicator color={colors.onDark} accessibilityLabel="저장하는 중" /> : <Txt style={styles.primaryText}>동의하고 정리하기</Txt>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={dimPressed(styles.secondary)} onPress={onKeepAsNote}>
          <Txt>AI 없이 메모로 남기기</Txt>
        </Pressable>
        <View style={styles.consentFoot}>
          <Txt style={styles.consentFootText}>한 번 동의하면 다시 묻지 않아요 · </Txt>
          <Pressable accessibilityRole="link" style={dimPressed(styles.consentLink)} onPress={openPrivacy}>
            <Txt style={[styles.consentFootText, styles.underline]}>개인정보 처리방침</Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ConsentLine({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.consentLine}>
      <Txt variant="label">{label}</Txt>
      <Txt>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  sheet: { paddingHorizontal: SCREEN_X, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 52 },
  headerButton: { minWidth: 56, minHeight: HIT, justifyContent: 'center' },
  lead: { fontSize: 24, marginTop: 8 },
  hint: { color: colors.inkSoft, fontSize: 14 },
  paper: { minHeight: 182, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 4 },
  input: {
    minHeight: 182,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: fonts.body,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  note: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 14 },
  primary: { height: 48, borderRadius: 24, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: colors.onDark, fontSize: 16 },
  disabled: { backgroundColor: '#D8CDB9' },
  primaryTextDisabled: { color: '#6E6456' },
  grow: { flex: 1 },
  secondary: { height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.lineFaint },
  check: { width: 24, height: 24, borderRadius: 4, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  checkMark: { color: colors.onDark, fontSize: 14 },
  rowText: { flex: 1, fontSize: 16 },
  when: { fontSize: 20 },
  consentWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  consentDim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(42, 37, 32, 0.3)' },
  consent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  consentTitle: { fontSize: 22 },
  consentLead: { color: colors.inkSoft },
  consentBox: { gap: 12, padding: 16, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, backgroundColor: colors.popover },
  consentLine: { gap: 2 },
  consentPrimary: { backgroundColor: colors.navy, marginTop: 4 },
  consentFoot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  consentFootText: { fontSize: 13, color: colors.inkSoft },
  consentLink: { minHeight: HIT, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
