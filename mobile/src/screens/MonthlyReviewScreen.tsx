import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createMonthlyReview } from '../ai/client';
import { AiError } from '../ai/errors';
import { listMonthSummary } from '../archive/repo';
import type { Db } from '../db/types';
import { monthWeeks } from '../lib/calendar';
import { addMonths, formatShortDate } from '../lib/date';
import type { MonthlyReviewContent } from '../monthly/content';
import { monthLabel } from '../monthly/labels';
import { getMonthlyReview, saveMonthlyReview } from '../monthly/repo';
import { supabase } from '../supabase';
import { FadeIn } from '../ui/FadeIn';
import { Inkwell } from '../ui/Inkwell';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { useReduceMotion } from '../ui/useReduceMotion';
import { dimPressed } from '../ui/press';
import { PageHeader } from '../ui/PageHeader';

type Props = { db: Db; month: string; version: number; onChanged: () => void; onClose: () => void };
type Step = 'loading' | 'consent' | 'making' | 'result';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 방금 만든 돌아보기가 나타날 때(저장된 것을 다시 열 때는 그대로 보여준다)
const SECTION_MS = 260;
const SECTION_GAP_MS = 60;
const CELL_STEP_MS = 15; // 달력 칸은 왼쪽 위에서 대각선으로 번진다
const CELL_TOTAL_MS = 500;
const MIN_DAYS = 7; // 서버(monthly-review)가 돌아보기를 만드는 최소 기록일과 같다
const LOAD_ERROR = '돌아보기를 불러오지 못했어요. 잠시 뒤에 다시 해 주세요';

// 서버가 알려 준 오류는 그 문구를, 그 밖의 오류(로컬 저장소 등)는 다정한 한 줄로 보여준다
function messageOf(e: unknown): string {
  return e instanceof AiError ? e.message : LOAD_ERROR;
}

export function MonthlyReviewScreen({ db, month, version, onChanged, onClose }: Props) {
  const [step, setStep] = useState<Step>('loading');
  const [content, setContent] = useState<MonthlyReviewContent | null>(null);
  const [writtenAt, setWrittenAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justMade, setJustMade] = useState(false); // 이 화면에서 방금 만들었다
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
        setError(messageOf(e));
        setStep((s) => (s === 'loading' ? 'consent' : s));
      });
    return () => {
      cancelled = true;
    };
  }, [db, month, version]);

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
      setJustMade(true);
      setStep('result');
    } catch (e) {
      if (!alive.current) return;
      let message = messageOf(e);
      // 기록이 모자라면 이 기기에 쌓인 날로 며칠 더 필요한지 알려 준다
      if (e instanceof AiError && e.code === 'not_enough_days') {
        const days = await listMonthSummary(db, month).then((s) => s.length, () => null);
        if (days !== null && days < MIN_DAYS) message = `${label}에 기록한 날이 ${days}일이에요. ${MIN_DAYS - days}일 더 쌓이면 볼 수 있어요`;
      }
      if (!alive.current) return;
      setError(message);
      setStep(back);
    } finally {
      busy.current = false;
    }
  };

  return (
    <View style={styles.flex}>
      <Paper />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <PageHeader title={`${label} 돌아보기`} onBack={onClose} backLabel="지난 기록" />

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
              <InfoLine label="읽는 것" text="기분 점수, 회고 답변, 할 일 개수와 이월 횟수" />
              <InfoLine label="보내는 곳" text="Claude(Anthropic). 결과는 내 기록에만 저장돼요" />
              <InfoLine label="보내지 않는 것" text="할 일 내용" />
            </View>
            <Txt style={styles.muted}>한 달에 한 번 무료로 만들 수 있어요.</Txt>
            <Pressable accessibilityRole="button" style={dimPressed(styles.primary)} onPress={make}>
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
          <ReviewResult content={content} month={month} writtenAt={writtenAt} reveal={justMade} />
        )}
      </ScrollView>
    </View>
  );
}

function ReviewResult({
  content,
  month,
  writtenAt,
  reveal,
}: {
  content: MonthlyReviewContent;
  month: string;
  writtenAt: string | null;
  reveal: boolean; // 처음 그릴 때 한 번 차례로 나타난다
}) {
  const reduce = useReduceMotion();
  // 동작 줄이기면 전체를 한 번에 흐리게 띄운다
  const stagger = reveal && !reduce;
  let order = 0;
  const section = () => ({ on: stagger, delay: order++ * SECTION_GAP_MS, rise: 8, duration: SECTION_MS });
  const { stats, insights } = content;
  const byDate = useMemo(() => new Map(stats.days.map((d) => [d.date, d])), [stats.days]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const nextLabel = monthLabel(addMonths(month, 1));
  const lethargyDays = stats.lethargyDates.map((d) => Number(d.slice(8))).join('·');
  const written = writtenAt ? formatShortDate(writtenAt.slice(0, 10)) : null;

  return (
    <FadeIn on={reveal && reduce} duration={200} style={styles.block}>
      <FadeIn {...section()}>
        <Section title="한 달의 잉크">
          <View style={styles.grid} accessibilityLabel={`${monthLabel(month)} 기분 달력`}>
            <View style={styles.week}>
              {WEEKDAYS.map((w) => (
                <Txt key={w} style={[styles.cell, styles.weekday]} accessible={false}>
                  {w}
                </Txt>
              ))}
            </View>
            {weeks.map((week, row) => (
              <View key={row} style={styles.week}>
                {week.map((date, col) => {
                  const d = date ? byDate.get(date) : undefined;
                  const wave = (row + col) * CELL_STEP_MS;
                  return (
                    <FadeIn
                      key={date ?? `e${col}`}
                      on={stagger && !!date}
                      delay={Math.min(wave, CELL_TOTAL_MS - SECTION_MS)}
                      duration={SECTION_MS}
                      style={styles.cell}
                      accessible={false}
                    >
                      {date && (
                        <>
                          <Inkwell id={`rv${date}`} mood={d?.mood ?? null} size="small" paper={colors.paper} />
                          <Txt style={styles.dayNum}>{Number(date.slice(8))}</Txt>
                          <View style={[styles.dot, d?.lethargy && styles.dotOn]} />
                        </>
                      )}
                    </FadeIn>
                  );
                })}
              </View>
            ))}
          </View>
          <Txt style={styles.legend}>진할수록 좋았던 날 · ● 무기력했던 날</Txt>
        </Section>
      </FadeIn>

      <FadeIn {...section()}>
        <Section title="기분의 흐름">
          <Txt style={styles.body}>{insights.moodFlow}</Txt>
        </Section>
      </FadeIn>

      <FadeIn {...section()}>
        <Section title="무기력했던 날">
          <View style={styles.stats}>
            <Stat value={`${stats.lethargyDates.length}번`} label={lethargyDays ? `${lethargyDays}일` : '없었어요'} />
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
      </FadeIn>

      <FadeIn {...section()}>
        <Section title="할 일과 마음">
          <Txt style={styles.body}>{insights.tasksAndMind}</Txt>
        </Section>
      </FadeIn>

      {!!insights.gratitude && (
        <FadeIn {...section()}>
          <Section title="자주 고마웠던 것">
            <Txt style={styles.body}>{insights.gratitude}</Txt>
          </Section>
        </FadeIn>
      )}

      <FadeIn {...section()}>
        <Section title={`${nextLabel}에 해 볼 한 가지`}>
          <Txt variant="hand" style={styles.oneThing}>
            {insights.oneThing}
          </Txt>
        </Section>
      </FadeIn>

      <FadeIn {...section()}>
        <Txt style={styles.disclaimer}>
          기록한 {stats.recordedDays}일을 읽고 정리했어요{written ? ` · ${written} 작성` : ''}. 기록에서 보이는 흐름일 뿐 진단이 아니에요. 마음이 오래 힘들면 주변이나 전문가와 이야기해 보세요.
        </Txt>
      </FadeIn>

      {/* 한 달에 한 번은 무료. 더 만드는 기능(유료)은 아직 없어서 누르는 버튼 대신 안내만 둔다 */}
      <Txt style={styles.muted}>이번 달 돌아보기는 이미 만들었어요. 더 만드는 기능은 준비 중이에요</Txt>
    </FadeIn>
  );
}

// 동의 안내 한 줄: "이름: 내용"
function InfoLine({ label, text }: { label: string; text: string }) {
  return (
    <Txt style={styles.info}>
      <Txt variant="medium" style={styles.info}>
        {label}
      </Txt>
      {`: ${text}`}
    </Txt>
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
  scroll: { flex: 1 },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 4, paddingBottom: 32, gap: 16 },
  error: { color: colors.danger, fontSize: 14 },
  block: { gap: 18 },
  lead: { fontSize: 22 },
  body: { fontSize: 15, lineHeight: 24, color: colors.inkSoft },
  muted: { fontSize: 13, color: colors.muted },
  infoBox: { gap: 6, padding: 14, borderRadius: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint },
  info: { fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  primary: { minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark, fontSize: 16 },
  making: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  section: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.lineFaint },
  sectionTitle: { fontSize: 17 },
  grid: { gap: 4 },
  week: { flexDirection: 'row' }, // 칸은 똑같이 나눠 가져서 줄이 넘치지 않는다
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  dayNum: { fontSize: 11, color: colors.muted },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOn: { backgroundColor: colors.navy },
  legend: { fontSize: 12, color: colors.muted },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 12 },
  stat: { gap: 2 },
  statValue: { fontSize: 24 },
  causes: { gap: 4 },
  oneThing: { fontSize: 24, lineHeight: 30 },
  disclaimer: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
