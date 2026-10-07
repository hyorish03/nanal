import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createMonthlyReview } from '../ai/client';
import { AI_MESSAGES } from '../ai/errors';
import type { Db } from '../db/types';
import { monthGrid } from '../lib/calendar';
import { addMonths, formatShortDate } from '../lib/date';
import type { MonthlyReviewContent } from '../monthly/content';
import { monthLabel } from '../monthly/labels';
import { getMonthlyReview, saveMonthlyReview } from '../monthly/repo';
import { supabase } from '../supabase';
import { Inkwell } from '../ui/Inkwell';
import { colors, HIT, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';

type Props = { db: Db; month: string; version: number; onChanged: () => void; onClose: () => void };
type Step = 'loading' | 'consent' | 'making' | 'result';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthlyReviewScreen({ db, month, version, onChanged, onClose }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [content, setContent] = useState<MonthlyReviewContent | null>(null);
  const [writtenAt, setWrittenAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const label = monthLabel(month);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMonthlyReview(db, month)
      .then((r) => {
        if (cancelled) return;
        if (r) {
          setContent(r.content);
          setWrittenAt(r.updated_at);
          setStep('result');
        } else {
          setStep((s) => (s === 'making' ? s : 'consent'));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStep((s) => (s === 'loading' ? 'consent' : s));
      });
    return () => {
      cancelled = true;
    };
  }, [db, month, version]);

  // 한 달에 한 번은 무료. 다시 만들기는 유료 이용(결제는 다음 계획)이라 지금은 안내만 한다.
  const showPaid = () => Alert.alert('다시 만들기', `${label} 돌아보기는 한 달에 한 번 무료로 만들 수 있어요. ${AI_MESSAGES.paid_required}`);

  // 화면을 닫아도 서버가 저장하므로 다 되면 동기화로 지난 기록에 남는다.
  const make = async () => {
    if (busy.current) return;
    busy.current = true;
    const back: Step = content ? 'result' : 'consent';
    setStep('making');
    setError(null);
    try {
      const review = await createMonthlyReview(supabase, month);
      await saveMonthlyReview(db, review);
      onChanged();
      if (!alive.current) return;
      setContent(review.content);
      setWrittenAt(review.updated_at);
      setStep('result');
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setStep(back);
    } finally {
      busy.current = false;
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="지난 기록으로 돌아가기" style={styles.back} onPress={onClose}>
          <Txt style={styles.backText}>지난 기록</Txt>
        </Pressable>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          {label} 돌아보기
        </Txt>
        <View style={styles.backSpacer} />
      </View>

      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}

      {step === 'loading' && <ActivityIndicator accessibilityLabel="불러오는 중" />}

      {step === 'consent' && (
        <View style={styles.block}>
          <Txt variant="title" style={styles.lead}>
            한 달을 같이 읽어 볼까요?
          </Txt>
          <Txt style={styles.body}>
            {label}에 남긴 기분, 회고, 할 일 기록을 읽고 반복된 흐름을 정리해 드려요. 판단이나 진단이 아니라, 기록에서 보이는 모양을 함께 보는 거예요.
          </Txt>
          <View style={styles.infoBox}>
            <Txt style={styles.info}>읽는 것: 기분 점수, 회고 답변, 할 일 개수와 이월 횟수</Txt>
            <Txt style={styles.info}>보내는 곳: Claude(Anthropic). 결과는 내 기록에만 저장돼요</Txt>
            <Txt variant="medium" style={styles.info}>
              할 일 내용은 보내지 않아요
            </Txt>
          </View>
          <Txt style={styles.muted}>한 달에 한 번 무료로 만들 수 있어요.</Txt>
          <Pressable accessibilityRole="button" style={styles.primary} onPress={make}>
            <Txt style={styles.primaryText}>{label} 돌아보기 만들기</Txt>
          </Pressable>
        </View>
      )}

      {step === 'making' && (
        <View style={styles.making} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.navy} />
          <Txt variant="title" style={styles.lead}>
            {label}의 기록을 읽고 있어요
          </Txt>
          <Txt style={styles.muted}>30초쯤 걸려요. 화면을 닫아도 다 되면 지난 기록에 남아요.</Txt>
        </View>
      )}

      {step === 'result' && content && (
        <ReviewResult content={content} month={month} writtenAt={writtenAt} onRemake={showPaid} />
      )}
    </ScrollView>
  );
}

function ReviewResult({
  content,
  month,
  writtenAt,
  onRemake,
}: {
  content: MonthlyReviewContent;
  month: string;
  writtenAt: string | null;
  onRemake: () => void;
}) {
  const { stats, insights } = content;
  const byDate = useMemo(() => new Map(stats.days.map((d) => [d.date, d])), [stats.days]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const nextLabel = monthLabel(addMonths(month, 1));
  const lethargyDays = stats.lethargyDates.map((d) => Number(d.slice(8))).join('·');
  const written = writtenAt ? formatShortDate(writtenAt.slice(0, 10)) : null;

  return (
    <View style={styles.block}>
      <Section title="한 달의 잉크">
        <View style={styles.grid} accessibilityLabel={`${monthLabel(month)} 기분 달력`}>
          {WEEKDAYS.map((w) => (
            <Txt key={w} style={[styles.cell, styles.weekday]} accessible={false}>
              {w}
            </Txt>
          ))}
          {cells.map((date, i) => {
            const d = date ? byDate.get(date) : undefined;
            return (
              <View key={date ?? `e${i}`} style={styles.cell} accessible={false}>
                {date && (
                  <>
                    <Inkwell id={`rv${date}`} mood={d?.mood ?? null} size="small" paper={colors.paper} />
                    <Txt style={styles.dayNum}>{Number(date.slice(8))}</Txt>
                    <View style={[styles.dot, d?.lethargy && styles.dotOn]} />
                  </>
                )}
              </View>
            );
          })}
        </View>
        <Txt style={styles.legend}>진할수록 좋았던 날 · ● 무기력했던 날</Txt>
      </Section>

      <Section title="기분의 흐름">
        <Txt style={styles.body}>{insights.moodFlow}</Txt>
      </Section>

      <Section title="무기력했던 날">
        <View style={styles.stats}>
          <Stat value={`${stats.lethargyDates.length}번`} label={lethargyDays ? `${lethargyDays}일` : '없음'} />
          {stats.lethargyAvgGapDays !== null && <Stat value={`약 ${Math.round(stats.lethargyAvgGapDays)}일`} label="평균 간격" />}
        </View>
        {insights.lethargy.causes.length > 0 && (
          <View style={styles.causes}>
            <Txt style={styles.muted}>회고에서 반복된 원인</Txt>
            {insights.lethargy.causes.map((c) => (
              <Txt key={c.label} style={styles.body}>
                {c.label} · {c.count}번
              </Txt>
            ))}
          </View>
        )}
        <Txt style={styles.body}>{insights.lethargy.summary}</Txt>
      </Section>

      <Section title="할 일과 마음">
        <Txt style={styles.body}>{insights.tasksAndMind}</Txt>
      </Section>

      {!!insights.gratitude && (
        <Section title="자주 고마웠던 것">
          <Txt style={styles.body}>{insights.gratitude}</Txt>
        </Section>
      )}

      <Section title={`${nextLabel}에 해 볼 한 가지`}>
        <Txt variant="hand" style={styles.oneThing}>
          {insights.oneThing}
        </Txt>
      </Section>

      <Txt style={styles.disclaimer}>
        기록한 {stats.recordedDays}일을 읽고 정리했어요{written ? ` · ${written} 작성` : ''}. 기록에서 보이는 흐름일 뿐 진단이 아니에요. 마음이 오래 힘들면 주변이나 전문가와 이야기해 보세요.
      </Txt>

      <Pressable
        accessibilityRole="button"
        accessibilityHint="유료 이용이 필요해요. 지금은 준비 중이에요"
        style={styles.secondary}
        onPress={onRemake}
      >
        <Txt>다시 만들기 · 유료(준비 중)</Txt>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="title" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Txt>
      {children}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value}, ${label}`}>
      <Txt variant="title" style={styles.statValue}>
        {value}
      </Txt>
      <Txt style={styles.muted}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 8, paddingBottom: 32, gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { minHeight: HIT, paddingHorizontal: 4, justifyContent: 'center' },
  backText: { fontSize: 15 },
  backSpacer: { width: 64 },
  title: { fontSize: 20 },
  error: { color: colors.danger, fontSize: 14 },
  block: { gap: 18 },
  lead: { fontSize: 22 },
  body: { fontSize: 15, lineHeight: 24, color: colors.inkSoft },
  muted: { fontSize: 13, color: colors.muted },
  infoBox: { gap: 6, padding: 14, borderRadius: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint },
  info: { fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  primary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark, fontSize: 16 },
  secondary: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  making: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  section: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.lineFaint },
  sectionTitle: { fontSize: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', gap: 1 },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  dayNum: { fontSize: 11, color: colors.muted },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOn: { backgroundColor: colors.navy },
  legend: { fontSize: 12, color: colors.muted },
  stats: { flexDirection: 'row', gap: 28 },
  stat: { gap: 2 },
  statValue: { fontSize: 24 },
  causes: { gap: 4 },
  oneThing: { fontSize: 24, lineHeight: 30 },
  disclaimer: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
