import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { organizeText } from '../../ai/client';
import { AiError } from '../../ai/errors';
import { dateLabel, type DraftItem, toDrafts } from '../../ai/organize';
import type { Db } from '../../db/types';
import { addItem } from '../../items/repo';
import { supabase } from '../../supabase';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { colors, fonts, HIT, SCREEN_X } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

type Props = {
  db: Db;
  visible: boolean;
  today: string;
  initialText?: string; // 계획 D: 받아 적은 글을 넘겨받는다
  onClose: () => void;
  onAdded: (notice?: string) => void;
};
type Step = 'write' | 'loading' | 'review';

// 두서없이 쓴(말한) 글 → AI 정리 → "이렇게 정리했어요"에서 고른 것만 넣는다(스펙 11.5).
export function OrganizeSheet({ db, visible, today, initialText = '', onClose, onAdded }: Props) {
  const [step, setStep] = useState<Step>('write');
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const busy = useRef(false); // 상태 갱신 전에 연타해도 한 번만 부른다
  const req = useRef(0); // 시트를 닫았다 다시 열면 이전 요청의 결과는 버린다

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
  }, [visible, initialText]);

  const organize = async () => {
    const raw = text.trim();
    if (!raw || busy.current) return;
    busy.current = true;
    const id = req.current;
    setStep('loading');
    setError(null);
    try {
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
          setError(err instanceof Error ? err.message : String(err));
          setStep('write');
        }
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStep('write');
    } finally {
      if (id === req.current) busy.current = false;
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
        onAdded('일부만 넣었어요. 나머지는 다시 정리해 주세요');
      } else if (alive.current) {
        setError(e instanceof Error ? e.message : String(e));
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
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.headerButton} onPress={onClose}>
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
              <TextInput
                style={styles.input}
                multiline
                editable={!loading}
                value={text}
                onChangeText={setText}
                maxLength={2000}
                accessibilityLabel="정리할 글"
                placeholder="예: 오늘 책도 사야 하고 빨래도 널어야 돼. 내일은 치과에 전화하기"
                placeholderTextColor={colors.faint}
              />
              <Txt style={styles.note}>정리하기를 누르면 쓴 글이 Claude(Anthropic)로 보내져요. 쓴 글은 따로 저장하지 않아요. 인터넷이 없으면 그대로 메모로 남겨요.</Txt>
              {error && (
                <Txt style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOrganize, busy: loading }}
                disabled={!canOrganize}
                style={[styles.primary, !canOrganize && styles.disabled]}
                onPress={organize}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onDark} accessibilityLabel="정리하는 중" />
                ) : (
                  <Txt style={styles.primaryText}>정리하기</Txt>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Txt variant="title" style={styles.lead}>
                이렇게 정리했어요
              </Txt>
              <Txt style={styles.hint}>{drafts.length ? '넣고 싶은 것만 체크하세요.' : '넣을 만한 것을 찾지 못했어요.'}</Txt>
              {drafts.map((d) => {
                const when = dateLabel(d.date, today);
                return (
                  <Pressable
                    key={d.id}
                    accessibilityRole="checkbox"
                    disabled={saving}
                    accessibilityState={{ checked: d.picked }}
                    accessibilityLabel={`${d.kind === 'task' ? '할 일' : '메모'} ${d.text}${when ? `, ${when}` : ''}`}
                    style={styles.row}
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
                );
              })}
              {error && (
                <Txt style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Txt>
              )}
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={saving} style={styles.secondary} onPress={() => setStep('write')}>
                  <Txt>다시 쓰기</Txt>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: picked.length === 0 || saving, busy: saving }}
                  disabled={picked.length === 0 || saving}
                  style={[styles.primary, styles.grow, (picked.length === 0 || saving) && styles.disabled]}
                  onPress={add}
                >
                  {saving ? <ActivityIndicator color={colors.onDark} accessibilityLabel="넣는 중" /> : <Txt style={styles.primaryText}>{picked.length}개 넣기</Txt>}
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  sheet: { paddingHorizontal: SCREEN_X, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 56 },
  headerButton: { minWidth: 56, minHeight: HIT, justifyContent: 'center' },
  lead: { fontSize: 24, marginTop: 8 },
  hint: { color: colors.inkSoft, fontSize: 14 },
  input: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 4,
    backgroundColor: colors.card,
    padding: 14,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: fonts.body,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  note: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 14 },
  primary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: colors.onDark, fontSize: 16 },
  disabled: { opacity: 0.4 },
  grow: { flex: 1 },
  secondary: { minHeight: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.lineFaint },
  check: { width: 24, height: 24, borderRadius: 4, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  checkMark: { color: colors.onDark, fontSize: 14 },
  rowText: { flex: 1, fontSize: 16 },
  when: { fontSize: 20 },
});
