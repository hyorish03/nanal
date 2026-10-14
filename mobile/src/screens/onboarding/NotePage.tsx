import { Fragment, useId, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { logicalDate } from '../../lib/date';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { colors } from '../../ui/theme';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { DownArrow, InfoMark, InkBottle, LongArrow, RibbonTab, Star, TimeIcon, Timeline, UpArrow } from './NoteDoodles';
import { Ink, Marked, NOTE_FONT_SCALE, NoteContext, NoteText, useNote } from './NoteInk';
import { MARGIN_X, NOTE_BAR_H, type NoteMode, noteScale, type NoteStep, ROW_TOP, RULE_FIRST, RULE_GAP, TEXT_X } from './notebook';
import { noteDateText, noteLabel } from './notePages';

const EDGE = 16; // 글이 종이 오른쪽 끝에 닿지 않게 남기는 폭
const NOTE_X = 236; // 둘째 장 기호 설명(← 할 일)이 시작하는 x
const BIND_W = 20; // 제본 쪽 그늘 폭

// 노트 한 장(종이·줄·여백선·그 장의 손글씨 메모)을 width×height로 그린다.
// 자리는 모두 폭 390 기준 목업 치수에 noteScale을 곱한다. 장 하나가 스크린 리더에는 한 덩어리 글로 읽힌다.
export function NotePage({ step, mode, width, height }: { step: NoteStep; mode: NoteMode; width: number; height: number }) {
  const reduce = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const s = noteScale(width);
  const [date] = useState(() => logicalDate(new Date()));
  // 글자 크기 설정만큼 줄 높이도 커지니, 늘어난 절반만큼 올려 글줄을 칸 가운데에 둔다
  const nudge = -((Math.min(fontScale, NOTE_FONT_SCALE) - 1) * RULE_GAP * s) / 2;
  const ctx = useMemo(() => ({ mode, reduce, s, width, height, nudge }), [mode, reduce, s, width, height, nudge]);
  const blank = mode === 'blank';
  const Page = PAGES[step];
  return (
    <View
      accessible={!blank}
      accessibilityRole={blank ? undefined : 'text'}
      accessibilityLabel={blank ? undefined : noteLabel(step, date)}
      style={[styles.sheet, { width, height }]}
    >
      <Paper s={s} height={height} />
      {!blank && (
        <NoteContext.Provider value={ctx}>
          <Page date={date} />
        </NoteContext.Provider>
      )}
    </View>
  );
}

// 줄(높이 끝까지), 붉은 여백선, 제본 쪽 그늘
function Paper({ s, height }: { s: number; height: number }) {
  const id = `bind${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const first = RULE_FIRST * s;
  const gap = RULE_GAP * s;
  const count = height > first ? Math.floor((height - first) / gap) + 1 : 0;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, n) => (
        <View key={n} style={[styles.rule, { top: first + gap * n }]} />
      ))}
      <Svg width={BIND_W} height={height} style={styles.bind} accessible={false}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.shadow} stopOpacity={0.13} />
            <Stop offset="1" stopColor={colors.shadow} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={BIND_W} height={height} fill={`url(#${id})`} />
      </Svg>
      <View style={[styles.margin, { left: MARGIN_X * s }]} />
    </View>
  );
}

// 목업 치수 → 화면 자리. row r의 위쪽, x에서 오른쪽 끝까지 남은 폭, 오른쪽으로 삐져나가지 않게 당긴 그림 x
function useGrid() {
  const { s, width, height } = useNote();
  return {
    s,
    // 아래 조작 줄 바로 위까지 남은 높이(그림이 버튼을 덮지 않게)
    above: (top: number) => height - NOTE_BAR_H - 8 * s - top,
    x: (n: number) => n * s,
    row: (r: number) => (ROW_TOP + RULE_GAP * r) * s,
    room: (x: number) => width - x * s - EDGE,
    fitX: (x: number, w: number) => Math.min(x * s, width - (w + 6) * s),
  };
}

// 1장: 인사
function Greeting({ date }: { date: string }) {
  const { s, x, row, room, fitX, above } = useGrid();
  return (
    <>
      <Ink i={0} right={x(28)} top={row(-1)}>
        <NoteText face="date">{noteDateText(date)}</NoteText>
      </Ink>
      <Ink i={1} left={x(TEXT_X)} top={row(0)} maxWidth={room(TEXT_X)}>
        <Marked kind="title">
          <NoteText face="title">나날 쓰는 법</NoteText>
        </Marked>
      </Ink>
      <Ink i={2} left={x(236)} top={x(108)} grid={false}>
        <Star s={s} />
      </Ink>
      <Body i={3} r={2} text="하루를 한 줄씩 적는 다이어리예요." />
      <Body i={4} r={3} text="아침엔 할 일을 정하고," />
      <Body i={5} r={4} text="저녁엔 오늘의 마음을 남겨요." />
      <Ink i={7} left={x(TEXT_X)} top={row(6)} maxWidth={room(TEXT_X)}>
        <NoteText face="note">한 장씩 넘기면서 알려 줄게요</NoteText>
      </Ink>
      <Ink i={8} left={fitX(210, 140)} top={x(372)} grid={false}>
        <LongArrow s={s} maxH={above(x(372))} />
      </Ink>
    </>
  );
}

// 2장: 기호. 왼쪽은 기호와 예시 줄, 오른쪽은 붉은 글씨 설명
function Symbols() {
  const { s, x, row, room } = useGrid();
  const rows = [
    { kind: 'open', text: '보고서 초안', note: '← 할 일', marked: true },
    { kind: 'doing', text: '3시 팀 회의', note: '← 하는 중' },
    { kind: 'done', text: '우유 사기', note: '← 끝!' },
    { kind: 'note', text: '창가 자리 최고', note: '← 메모' },
    { kind: 'migrated', text: '은행 들르기', note: '← 내일로 옮김' },
  ] as const;
  const line = [styles.line, { gap: 10 * s }];
  return (
    <>
      <Title i={0} text="기호 읽는 법" />
      {rows.map((r, n) => (
        <Fragment key={r.kind}>
          <Ink i={1 + n * 2} left={x(TEXT_X)} top={row(2 + n)} maxWidth={Math.min(x(NOTE_X - TEXT_X - 12), room(TEXT_X))} style={line}>
            <StatusSymbol kind={r.kind} size={18 * s} />
            {'marked' in r ? (
              <Marked kind="word" shrink>
                <NoteText face="body">{r.text}</NoteText>
              </Marked>
            ) : (
              <NoteText face="body" shrink>
                {r.text}
              </NoteText>
            )}
          </Ink>
          <Ink i={2 + n * 2} left={x(NOTE_X)} top={row(2 + n)} maxWidth={room(NOTE_X)}>
            <NoteText face="note">{r.note}</NoteText>
          </Ink>
        </Fragment>
      ))}
      <Ink i={12} left={x(TEXT_X)} top={row(8)} maxWidth={room(TEXT_X)} style={[styles.line, { gap: 8 * s }]}>
        <NoteText face="note" shrink>
          기호를 톡 누르면
        </NoteText>
        <StatusSymbol kind="open" size={15 * s} />
        <NoteText face="note">→</NoteText>
        <StatusSymbol kind="doing" size={15 * s} />
        <NoteText face="note">→</NoteText>
        <StatusSymbol kind="done" size={15 * s} />
      </Ink>
      <Ink i={13} left={x(TEXT_X)} top={row(9)} maxWidth={room(TEXT_X)} style={styles.line}>
        <Marked kind="word">
          <NoteText face="note">형광펜</NoteText>
        </Marked>
        <NoteText face="note" shrink>
          은 중요한 일 · 하루 3개까지
        </NoteText>
      </Ink>
      <Note i={14} r={10} text="줄을 밀면 → 형광펜 · ← 미루기·지우기" />
    </>
  );
}

// 3장: 하루의 흐름. 왼쪽 여백에 점선과 아침·낮·저녁 아이콘
function Flow() {
  const { s, x, fitX } = useGrid();
  return (
    <>
      <Title i={0} text="하루는 이렇게" />
      <Ink i={1} left={x(25)} top={x(212)} grid={false}>
        <Timeline s={s} />
      </Ink>
      <Ink i={1} pop left={x(13)} top={x(189)} grid={false}>
        <TimeIcon kind="sun" s={s} />
      </Ink>
      <Head i={2} r={2} text="아침" />
      <Body i={3} r={3} text="어제 넘어온 일을 골라요" />
      <Note i={4} r={4} text="오늘 할까 · 내일로 · 지울까" />
      <Ink i={5} pop left={x(13)} top={x(297)} grid={false}>
        <TimeIcon kind="pencil" s={s} />
      </Ink>
      <Head i={5} r={5} text="낮" />
      <Body i={6} r={6} text="떠오를 때마다 한 줄씩 적어요" />
      <Ink i={7} pop left={x(13)} top={x(405)} grid={false}>
        <TimeIcon kind="moon" s={s} />
      </Ink>
      <Head i={7} r={8} text="저녁" />
      <Body i={8} r={9} text="잉크병에 오늘 기분을 담고" />
      <Ink i={9} pop left={fitX(300, 34)} top={x(428)} grid={false}>
        <InkBottle s={s} />
      </Ink>
      <Note i={10} r={10} text="짧은 회고는 원할 때만 남겨요" />
    </>
  );
}

// 4장: 책갈피와 다시 보기
function Finale() {
  const { s, x, row, room, fitX, above } = useGrid();
  const { width } = useNote();
  const postW = Math.min(x(258), width - x(66) - EDGE);
  return (
    <>
      <Ink i={0} pop right={x(30)} top={0} grid={false}>
        <RibbonTab s={s} />
      </Ink>
      <Title i={1} text="마지막으로" />
      <Body i={2} r={2} text="책갈피 끈을 누르면" />
      <Body i={3} r={3} text="지난 날들을 볼 수 있어요" />
      <Ink i={4} left={fitX(252, 90)} top={x(128)} grid={false}>
        <UpArrow s={s} />
      </Ink>
      <Ink i={5} left={x(TEXT_X)} top={row(5)} maxWidth={room(TEXT_X)} style={[styles.line, { gap: 6 * s }]}>
        <InfoMark s={s} />
        <NoteText face="body" shrink>
          를 누르면 기호 설명을 다시 봐요
        </NoteText>
      </Ink>
      <Ink i={7} pop left={x(66)} top={x(372)} grid={false}>
        <View style={[styles.postit, { width: postW, paddingTop: 22 * s, paddingHorizontal: 22 * s, paddingBottom: 24 * s }]}>
          <NoteText face="postit">며칠 쉬어도 괜찮아요.</NoteText>
          <NoteText face="postit">쌓인 날은 줄어들지 않아요.</NoteText>
          <View style={[styles.tape, { top: -12 * s, width: 80 * s, height: 24 * s, marginLeft: -40 * s }]} />
        </View>
      </Ink>
      <Note i={9} r={12} text="이제 오늘의 첫 줄을 써 볼까요" />
      <Ink i={10} left={fitX(270, 80)} top={x(590)} grid={false}>
        <DownArrow s={s} maxH={above(x(590))} />
      </Ink>
    </>
  );
}

const PAGES = [Greeting, Symbols, Flow, Finale] as const;

// 한 칸짜리 글줄들(TEXT_X에서 시작)
function Title({ i, text }: { i: number; text: string }) {
  const { x, row, room } = useGrid();
  return (
    <Ink i={i} left={x(TEXT_X)} top={row(0)} maxWidth={room(TEXT_X)}>
      <Marked kind="title">
        <NoteText face="title">{text}</NoteText>
      </Marked>
    </Ink>
  );
}

function Line({ face, i, r, text }: { face: 'head' | 'body' | 'note'; i: number; r: number; text: string }) {
  const { x, row, room } = useGrid();
  return (
    <Ink i={i} left={x(TEXT_X)} top={row(r)} maxWidth={room(TEXT_X)}>
      <NoteText face={face}>{text}</NoteText>
    </Ink>
  );
}

const Head = (p: { i: number; r: number; text: string }) => <Line face="head" {...p} />;
const Body = (p: { i: number; r: number; text: string }) => <Line face="body" {...p} />;
const Note = (p: { i: number; r: number; text: string }) => <Line face="note" {...p} />;

const styles = StyleSheet.create({
  sheet: { backgroundColor: colors.paper, overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.ruled },
  margin: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.marginRule },
  bind: { position: 'absolute', left: 0, top: 0 },
  line: { flexDirection: 'row', alignItems: 'center' },
  postit: {
    backgroundColor: colors.postit,
    transform: [{ rotate: '-2.5deg' }],
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  tape: { position: 'absolute', left: '50%', backgroundColor: colors.tape, transform: [{ rotate: '4deg' }] },
});
