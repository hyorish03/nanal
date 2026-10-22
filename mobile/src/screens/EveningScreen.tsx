import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, type StyleProp, StyleSheet, type TextStyle, View } from 'react-native';
import { MOODS, moodWord } from '../days/moods';
import { getMood, setMood } from '../days/repo';
import type { Db } from '../db/types';
import { listItemsForDate } from '../items/repo';
import { formatLongDate, logicalDate } from '../lib/date';
import { userMessage } from '../lib/userError';
import { addReflection, deleteReflection, listReflections, type Reflection, updateReflection } from '../reflections/repo';
import { deleteTemplate, listTemplates } from '../reflections/templateRepo';
import type { TemplateDef } from '../reflections/templates';
import { countRecordedDays } from '../stats/recordedDays';
import { eulReul } from '../lib/josa';
import { confirmDelete, showActionSheet } from '../ui/dialogs';
import { Inkwell } from '../ui/Inkwell';
import { LAMP_PAPER } from '../ui/lamp';
import { EASE_IN_OUT, EASE_OUT } from '../ui/motion';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { Paper } from '../ui/Paper';
import { type Draft, hasAnswer, readDraft, withoutTemplate, writeDraft } from './evening/draft';
import { NotifyAsk, shouldAskNotifications } from './evening/NotifyAsk';
import { ReflectionForm } from './evening/ReflectionForm';
import { useRule } from './evening/rule';
import { TemplateSheet } from './evening/TemplateSheet';
import { useKeepVisible } from './evening/useKeepVisible';
import { dimPressed } from '../ui/press';
import { Chip } from '../ui/Chip';
import { PageHeader } from '../ui/PageHeader';
import { useReduceMotion } from '../ui/useReduceMotion';
import { type LayoutClass, useLayoutClass, WIDE } from '../ui/responsive';
import { TrashButton } from '../ui/TrashButton';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

export function EveningScreen({ db, version, onChanged, onClose }: Props) {
  const today = logicalDate(new Date());
  const [mood, setMoodState] = useState<number | null>(null);
  const [moodPicked, setMoodPicked] = useState(false); // 이번에 직접 골랐다(불러온 값에는 깃펜을 내려 꽂지 않는다)
  const [saved, setSaved] = useState<Reflection[]>([]);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [hasItems, setHasItems] = useState(false); // 오늘 적은 할 일·메모가 있다
  const [done, setDone] = useState<{ id: string; text: string }[]>([]); // 오늘 끝낸 일
  const [freshId, setFreshId] = useState<string | null>(null); // 방금 남긴 회고(잉크가 마르는 중)
  const [template, setTemplate] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Draft['answers']>({});
  const [editing, setEditing] = useState<{ id: string; answers: Record<string, string> } | null>(null); // 고치는 중인 회고
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetEditing, setSheetEditing] = useState<TemplateDef | null>(null); // 닫히는 애니메이션 동안 내용을 유지하려고 visible과 분리
  const openSheet = (t: TemplateDef | null) => {
    setSheetEditing(t);
    setSheetVisible(true);
  };
  const [error, setError] = useState<string | null>(null);
  const [askNotify, setAskNotify] = useState(false); // 처음 마무리를 남긴 뒤 알림을 한 번 묻는다
  const busy = useRef(false);
  const reduce = useReduceMotion();
  const stampIn = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ScrollView>(null);
  const frame = useRef<View>(null);
  const { onScroll, keep } = useKeepVisible(scroll, frame);
  const layout = useLayoutClass();
  // 넓은 화면(아이패드·Mac)에서는 한 칸을 읽기 폭으로 가운데에 모은다.
  // 예전 두 칸 배치는 넓은 Mac 창에서 왼쪽 칸이 좁아 잉크병이 두 줄로 꺾이고, 템플릿을 고르기 전 오른쪽이 비어 한쪽으로 쏠려 보였다
  const centered = layout !== 'compact';
  const rule = useRule();

  // 쓰던 답은 날마다 따로 보관한다. 불러오기 전에는 덮어쓰지 않는다.
  const draftReady = useRef(false);
  const latest = useRef({ today, draft: { template, answers } as Draft });
  latest.current = { today, draft: { template, answers } };

  useEffect(() => {
    draftReady.current = false;
    setTemplate(null);
    setAnswers({});
    setEditing(null);
    let cancelled = false;
    readDraft(AsyncStorage, today).then((d) => {
      if (cancelled) return;
      if (d) {
        setTemplate((prev) => prev ?? d.template);
        setAnswers((prev) => (Object.values(prev).some(hasAnswer) ? prev : d.answers));
      }
      draftReady.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(() => {
    if (!draftReady.current) return;
    const timer = setTimeout(() => writeDraft(AsyncStorage, today, { template, answers }), 400);
    return () => clearTimeout(timer);
  }, [today, template, answers]);

  // 화면을 닫을 때 마지막 몇 글자도 남긴다
  useEffect(
    () => () => {
      if (draftReady.current) writeDraft(AsyncStorage, latest.current.today, latest.current.draft);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMood(db, today), listReflections(db, today), listTemplates(db), countRecordedDays(db, today), listItemsForDate(db, today)])
      .then(([m, r, t, n, items]) => {
        if (cancelled) return;
        setMoodState(m);
        setSaved(r);
        setTemplates(t);
        setRecordedDays(n);
        setHasItems(items.length > 0);
        setDone(items.filter((i) => i.status === 'done').map((i) => ({ id: i.id, text: i.text })));
        setError(null);
      })
      .catch((e) => setError(userMessage(e, '오늘 기록을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요')));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  // 기분이나 회고를 남긴 뒤, 알림을 아직 정하지 않았으면 포스트잇으로 묻는다
  const offerNotifications = () => {
    if (askNotify) return;
    shouldAskNotifications().then((ask) => ask && setAskNotify(true), () => {});
  };

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
      setError(null);
      onChanged();
      return true;
    } catch (e) {
      setError(userMessage(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  // 누르자마자 잉크병을 바꾸고 저장한다. 저장하지 못하면 되돌리고 오류 문구를 보여준다.
  const pickMood = async (value: number) => {
    if (busy.current) return;
    const prev = mood;
    const next = mood === value ? null : value;
    setMoodPicked(true);
    setMoodState(next);
    const ok = await run(() => setMood(db, today, next));
    if (!ok) setMoodState(prev);
    else if (next !== null) offerNotifications();
  };

  // 남기면 기록한 날 도장이 새 숫자로 찍힌다. 동작 줄이기에서는 흐려졌다 나타나기만 한다.
  const dropStamp = () => {
    stampIn.setValue(0);
    Animated.timing(stampIn, { toValue: 1, duration: 180, easing: EASE_OUT, useNativeDriver: true }).start();
  };

  const save = async () => {
    if (!template || !hasAnswer(answers[template])) return;
    const ok = await run(async () => {
      const added = await addReflection(db, { templateId: template, answers: answers[template] ?? {} });
      // 남긴 답은 바로 보관함에서 빼야 다시 열었을 때 같은 회고가 또 채워지지 않는다
      const rest = withoutTemplate({ template, answers }, template);
      await writeDraft(AsyncStorage, today, rest);
      // 도장 숫자와 카드가 바뀐 뒤에 찍히도록 여기서 바로 다시 읽는다
      const [list, n] = await Promise.all([listReflections(db, today), countRecordedDays(db, today)]);
      setSaved(list);
      setRecordedDays(n);
      setFreshId(added.id);
      setTemplate(null);
      setAnswers(rest.answers);
    });
    if (ok) {
      dropStamp();
      offerNotifications();
    }
  };

  const saveEdit = () => {
    if (!editing || !hasAnswer(editing.answers)) return;
    run(async () => {
      await updateReflection(db, editing.id, editing.answers);
      setSaved(await listReflections(db, today));
      setEditing(null);
    });
  };

  const askDeleteReflection = (r: Reflection) =>
    confirmDelete(`‘${r.templateName}’ 회고를 지울까요?`, '지난 기록에서도 사라져요.', () =>
      run(async () => {
        await deleteReflection(db, r.id);
        const [list, n] = await Promise.all([listReflections(db, today), countRecordedDays(db, today)]);
        setSaved(list);
        setRecordedDays(n);
        setEditing((e) => (e?.id === r.id ? null : e));
      }),
    );

  const startEdit = (r: Reflection) => setEditing({ id: r.id, answers: { ...r.answers } });


  const askDelete = (t: TemplateDef) =>
    // ‘이름’ 뒤 조사: 받침이 있으면 은, 없으면 는
    confirmDelete('템플릿을 지울까요?', `‘${t.name}’${eulReul(t.name) === '을' ? '은' : '는'} 지워지고, 이 템플릿으로 쓴 회고는 그대로 남아요.`, () => {
      // 시트를 먼저 닫아야 실패했을 때 오류 문구가 저녁 화면에 보인다
      setSheetVisible(false);
      run(async () => {
        await deleteTemplate(db, t.id);
        if (template === t.id) setTemplate(null);
      });
    });

  const templateActions = (t: TemplateDef) =>
    showActionSheet(`‘${t.name}’`, [
      { label: '고치기', onPress: () => openSheet(t) },
      { label: '지우기', destructive: true, onPress: () => askDelete(t) },
    ]);

  const current = templates.find((t) => t.id === template);
  const hasCustom = templates.some((t) => !t.builtin);
  const hasRecord = mood !== null || saved.length > 0 || hasItems;

  const header = (
    <PageHeader
      title="하루 마무리"
      subtitle={`오늘을 덮으며 · ${formatLongDate(today)}`}
      onBack={onClose}
      backAccessibilityLabel="하루 마무리 닫기"
    />
  );

  const moodSection = (
    <View style={styles.section}>
      <Txt variant="hand" accessibilityRole="header" style={styles.h2}>
        오늘 마음은 어땠나요?
      </Txt>
      <View style={styles.moods}>
        {MOODS.map((m) => {
          const selected = mood === m;
          return (
            <Pressable
              key={m}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`기분 ${m}점, ${moodWord(m)}`}
              accessibilityState={{ selected }}
              style={dimPressed(styles.mood)}
              onPress={() => pickMood(m)}
            >
              <MoodWell selected={selected} animate={moodPicked}>
                <Inkwell
                  id={`well${m}`}
                  mood={m}
                  size="large"
                  scale={WELL_SCALE[layout]}
                  selected={selected}
                  animate={moodPicked}
                  color={selected ? colors.navy : colors.line}
                  paper={LAMP_PAPER}
                />
              </MoodWell>
              <Txt
                variant={selected ? 'medium' : 'body'}
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={[styles.moodWord, { fontSize: MOOD_WORD[layout] }, selected ? styles.moodWordOn : styles.moodWordOff]}
              >
                {moodWord(m)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const templateSection = (
    <View style={styles.section}>
      <View>
        <Txt variant="medium" style={styles.question}>
          오늘은 어떤 날이었나요?
        </Txt>
        <Txt style={styles.hint}>건너뛰어도 괜찮아요</Txt>
      </View>
      <View style={styles.chips}>
        {templates.map((t) => {
          const selected = template === t.id;
          return (
            <Chip
              key={t.id}
              label={t.name}
              selected={selected}
              accessibilityHint={t.builtin ? undefined : '길게 누르면 고치거나 지울 수 있어요'}
              accessibilityActions={
                t.builtin
                  ? undefined
                  : [
                      { name: 'edit', label: '고치기' },
                      { name: 'delete', label: '지우기' },
                    ]
              }
              onAccessibilityAction={
                t.builtin
                  ? undefined
                  : (e) => {
                      if (e.nativeEvent.actionName === 'edit') openSheet(t);
                      else if (e.nativeEvent.actionName === 'delete') askDelete(t);
                    }
              }
              onPress={() => setTemplate(selected ? null : t.id)}
              onLongPress={t.builtin ? undefined : () => templateActions(t)}
            />
          );
        })}
        <Chip label="새 템플릿" symbol="+" dashed onPress={() => openSheet(null)} />
      </View>
      {hasCustom && <Txt style={styles.hint}>내가 만든 템플릿은 길게 눌러 고치거나 지울 수 있어요</Txt>}
    </View>
  );

  const form = current && (
    <View>
      <View accessible={false} style={styles.tape} />
      <ReflectionForm
        questions={current.questions}
        values={answers[current.id] ?? {}}
        onChange={(key, v) => setAnswers((prev) => ({ ...prev, [current.id]: { ...prev[current.id], [key]: v } }))}
        submitLabel="회고 남기기"
        canSubmit={hasAnswer(answers[current.id])}
        onSubmit={save}
        keep={keep}
        top={FORM_TOP}
      />
    </View>
  );

  const errorText = error && (
    <Txt style={styles.error} accessibilityLiveRegion="polite">
      {error}
    </Txt>
  );

  // 카드 글자도 줄 노트 눈금(rule)을 따라야 선 위에 앉는다
  const handLine = { fontSize: rule.hand, lineHeight: rule.lineHeight };
  const answerLine = { fontSize: rule.body - 1, lineHeight: rule.lineHeight };
  const savedSection = saved.length > 0 && (
    <View style={styles.section}>
      <Txt variant="medium" style={styles.question}>
        오늘 남긴 회고
      </Txt>
      {saved.map((r) =>
        editing?.id === r.id ? (
          <ReflectionForm
            key={r.id}
            title={r.templateName}
            questions={r.questions}
            values={editing.answers}
            onChange={(key, v) => setEditing((e) => e && { ...e, answers: { ...e.answers, [key]: v } })}
            submitLabel="저장"
            canSubmit={hasAnswer(editing.answers)}
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)}
            keep={keep}
            style={styles.savedCard}
          />
        ) : (
          // 카드를 누르면 바로 고친다. 글은 줄마다 따로 읽히도록 카드는 접근성 요소로 묶지 않고, 제목을 고치기 버튼으로 읽힌다.
          <Pressable key={r.id} accessible={false} onPress={() => startEdit(r)}>
            <RuledPaper lineHeight={rule.line} firstLineTop={rule.line - rule.sit} style={styles.savedCard}>
              <View style={[styles.cardHead, { height: rule.line }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`‘${r.templateName}’ 회고 고치기`}
                  style={styles.flexText}
                  onPress={() => startEdit(r)}
                >
                  <Txt variant="hand" style={handLine}>
                    {r.templateName}
                  </Txt>
                </Pressable>
                <TrashButton label={`‘${r.templateName}’ 회고 지우기`} height={rule.line} onPress={() => askDeleteReflection(r)} />
              </View>
              {r.questions
                .filter((q) => r.answers[q.key])
                .map((q) =>
                  r.id === freshId ? (
                    <WetInk key={q.key} label={`${q.text} ${r.answers[q.key]}`} text={r.answers[q.key]} style={answerLine} />
                  ) : (
                    <Txt key={q.key} style={answerLine} accessibilityLabel={`${q.text} ${r.answers[q.key]}`}>
                      {r.answers[q.key]}
                    </Txt>
                  ),
                )}
            </RuledPaper>
          </Pressable>
        ),
      )}
    </View>
  );

  const stamp = (
    <View style={styles.stampBox}>
      <Animated.View
        accessible={false}
        style={[
          styles.stamp,
          {
            opacity: stampIn,
            transform: [
              { rotate: '-10deg' },
              { scale: reduce ? 1 : stampIn.interpolate({ inputRange: [0, 1], outputRange: [1.15, 1] }) },
            ],
          },
        ]}
      >
        <Txt
          variant="title"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={styles.stampText}
        >
          {recordedDays}일
        </Txt>
      </Animated.View>
      <Txt style={styles.stampCopy}>
        {hasRecord
          ? '오늘도 한 장을 채웠어요. 내일 아침에 이어서 적어요.'
          : '오늘 장은 아직 비어 있어요. 마음 하나만 골라도 충분해요.'}
      </Txt>
    </View>
  );

  const doneList = done.length > 0 && (
    <View style={styles.done}>
      <Txt style={styles.doneLabel}>오늘 끝낸 일</Txt>
      {done.slice(0, DONE_MAX).map((d) => (
        <Txt key={d.id} variant="hand" style={styles.doneItem} numberOfLines={1}>
          – {d.text}
        </Txt>
      ))}
      {done.length > DONE_MAX && (
        <Txt variant="hand" style={styles.doneItem}>
          외 {done.length - DONE_MAX}개
        </Txt>
      )}
    </View>
  );

  const sheet = (
    <TemplateSheet
      db={db}
      visible={sheetVisible}
      editing={sheetEditing}
      onClose={() => setSheetVisible(false)}
      onSaved={(t) => {
        setSheetVisible(false);
        setTemplate(t.id);
        onChanged();
      }}
      onDelete={askDelete}
    />
  );

  return (
    <View ref={frame} style={styles.flex}>
      <Paper />
      {/* 앱 화면이 이미 키보드만큼 줄어들므로(KeyboardResize) 인셋은 더하지 않고, 쓰는 칸 쪽으로 스크롤만 옮긴다 */}
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.container, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {header}
        {moodSection}
        {templateSection}
        {form}
        {errorText}
        {savedSection}
        {stamp}
        {askNotify && <NotifyAsk db={db} onDone={() => setAskNotify(false)} />}
        {doneList}
      </ScrollView>
      {sheet}
    </View>
  );
}

const DIM = 0.55;
const DONE_MAX = 5;
const TEXT_MAX_SCALE = 1.3; // 큰 글씨에서도 잉크병 줄과 도장이 무너지지 않을 만큼만 키운다
// 넓은 화면에서는 잉크병과 이름표를 키운다
const WELL_SCALE: Record<LayoutClass, number> = { compact: 1, regular: 1.1, wide: 1.3 };
const MOOD_WORD: Record<LayoutClass, number> = { compact: 13, regular: 14, wide: 15 };
const WET_INK = colors.navy; // 막 쓴 잉크는 남색으로 젖어 있다가 먹색으로 마른다

// 색은 네이티브 드라이버로 바꿀 수 없어서, 먹색 글씨 위에 남색 글씨를 겹쳐 두고 남색만 흐리게 한다.
function WetInk({ text, label, style }: { text: string; label: string; style: StyleProp<TextStyle> }) {
  const wet = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.timing(wet, { toValue: 0, duration: 1200, easing: EASE_IN_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [wet]);
  return (
    <View>
      <Txt style={style} accessibilityLabel={label}>
        {text}
      </Txt>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { opacity: wet }]}
      >
        <Txt style={[style, { color: WET_INK }]}>{text}</Txt>
      </Animated.View>
    </View>
  );
}

// 고르지 않은 병은 따뜻한 연필색 윤곽, 고른 병만 남색 잉크. 직접 골랐을 때만 남색이 짧게 배어 나온다.
function MoodWell({ selected, animate, children }: { selected: boolean; animate: boolean; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate || !selected) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(DIM);
    const anim = Animated.timing(opacity, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [selected, animate, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

const FORM_TOP = 22;

const styles = StyleSheet.create({
  // 바탕은 Main의 EveningBackdrop(등잔 불빛)과 같은 종이색. 이 화면도 직접 칠한다:
  // 아이패드·Mac에서 사이드바를 접어 칸이 넓어지면 화면 틀(stack)이 예전 폭에 머물러 오른쪽에 오늘 화면 종이가 비쳤다
  flex: { flex: 1, backgroundColor: LAMP_PAPER },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 4, paddingBottom: 24, gap: 20 },
  section: { gap: 10 },
  h2: { fontSize: 26 },
  // 큰 글씨로 다섯 병이 한 줄에 안 들어가면 다음 줄로 넘기고 가운데로 모은다
  moods: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-evenly', rowGap: 8 },
  mood: { minWidth: 60, padding: 4, alignItems: 'center', gap: 6 },
  // 넓은 칸에서는 다섯 병을 한 줄에 고르게 늘어놓는다
  moodWord: { paddingBottom: 2, borderBottomWidth: 2 },
  moodWordOn: { borderBottomColor: colors.navy },
  moodWordOff: { color: colors.inkSoft, borderBottomColor: 'transparent' },
  question: { fontSize: 14, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }, // 줄 사이 10: 칩 hitSlop이 겹치지 않게
  hint: { fontSize: 12, color: colors.muted },
  tape: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 88,
    height: 22,
    zIndex: 1,
    backgroundColor: colors.tape,
    transform: [{ rotate: '-2deg' }],
  },
  flexText: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  error: { color: colors.danger, fontSize: 14 },
  savedCard: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint },
  blank: { opacity: 0.7 },
  blankText: { color: colors.muted },
  stampBox: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: 10,
  },
  stamp: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: colors.navy,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center', // -10° 기울기는 찍히는 애니메이션과 함께 넣는다
  },
  stampText: { alignSelf: 'stretch', fontSize: 13, color: colors.navy, textAlign: 'center' }, // 폭을 정해 줘야 숫자가 길 때 줄어든다
  stampCopy: { flex: 1, fontSize: 14, color: colors.inkSoft },
  done: { paddingHorizontal: 14 },
  doneLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  doneItem: { fontSize: 20, lineHeight: 26, color: colors.muted },
  // 넓은 화면의 한 칸 배치: 읽기 폭으로 가운데
  centered: { width: '100%', maxWidth: WIDE.readingWidth + WIDE.pageX * 2, alignSelf: 'center', paddingHorizontal: WIDE.pageX }, // 테이프가 칸 위로 잘리지 않게
});
