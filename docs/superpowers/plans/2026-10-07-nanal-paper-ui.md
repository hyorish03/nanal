# 나날 종이 다이어리 UI 구현 계획 (계획 B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목업 캔버스에서 확정한 종이 다이어리 디자인(스펙 11절)을 실제 앱의 로그인, 온보딩, 오늘, 저녁 마무리, 템플릿 시트, 지난 기록 화면에 적용한다.

**Architecture:** 색·글꼴·크기는 `src/ui/theme.ts` 한 곳에 두고, 표지·잉크병·상태 기호·형광펜·줄 노트·팝오버 같은 공통 조각은 `src/ui/`에 만든다. 화면 전환은 지금처럼 `Main`의 상태 하나로 한다(오늘 ↔ 저녁 ↔ 지난 기록은 뒤로 쌓이는 흐름이 없고 항상 오늘로 돌아오므로 react-navigation이 필요 없다). 애니메이션은 RN 기본 `Animated`(네이티브 드라이버, `perspective` + `rotateY`, `transformOrigin`)로 만들어 reanimated를 들이지 않는다. 데이터 규칙은 기존 저장소 함수에 그대로 두고, 지난 기록 화면에 필요한 조회 두 개만 저장소에 추가한다.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-font + @expo-google-fonts(Gowun Batang, IBM Plex Sans KR, Nanum Pen Script), react-native-svg, Jest

**Spec:** `docs/superpowers/specs/2026-10-06-daily-log-app-design.md` 11절. 목업: https://claude.ai/artifact/1YTaE6tf1SP4rSBeu8rbMz (Today, Evening, Archive, Onboarding, Login, TemplateSheet 보드)

**공통 규칙**
- 명령은 별도 표기가 없으면 `mobile/`에서 실행한다.
- 모든 커밋은 `git commit -m "<메시지>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` 형식. push 하지 않는다.
- DB 규칙: 쿼리 메서드는 params 배열이 필수(`[]`). 쓰기는 저장소 함수만 쓴다(화면에서 SQL을 직접 쓰지 않는다).
- 테스트는 Jest `node` 환경이다. 테스트하는 순수 함수 파일은 `react-native`를 import하지 않는다(타입 import는 괜찮다).
- 화면 작업 확인: `npx jest && npm run typecheck`, 그리고 번들 확인
  `EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"` (결과물은 커밋하지 않는다).
- 글꼴: RN에서 사용자 글꼴은 `fontWeight` 대신 굵기별 `fontFamily`를 쓴다. 굵은 글자는 쓰지 않고 강조는 `fonts.medium`(500)까지만.
- 접근성: 누르는 곳은 최소 44pt, 아이콘 버튼에는 `accessibilityLabel`, 장식 요소는 `accessible={false}`.

**결정 사항 (사용자 확인 대상)**
- 말로 적기(마이크) 버튼은 계획 D(개발용 빌드)까지 숨긴다. 눌러도 동작하지 않는 버튼을 두지 않기 위해서다.
- 템플릿 시트는 iOS 기본 시트(`Modal presentationStyle="pageSheet"`), 템플릿 길게 누르기 메뉴는 iOS 기본 액션 시트(`ActionSheetIOS`)로 만든다. 목업과 모양이 거의 같고 접근성과 제스처가 기본 제공된다.
- 줄 오른쪽 ⋯ 메뉴와 기호 설명 (i)는 목업처럼 버튼 아래에 뜨는 팝오버로 만든다.
- 지난 기록의 "<지난달> 돌아보기" 배너는 계획 C(월간 AI 회고)에서 붙인다.
- 형광펜은 글자 아래쪽 띠로 그린다. 두 줄 이상으로 넘어가는 긴 항목은 띠가 마지막 줄 아래에만 보인다.
- 온보딩 완료 표시는 기기에 저장한다(`AsyncStorage`). 읽기에 실패하면 이미 본 것으로 친다(매번 온보딩이 뜨지 않게).

---

## 파일 구조

| 파일 | 변경 | 책임 |
|---|---|---|
| `src/ui/theme.ts` | 신규 | 색, 글꼴 이름, 공통 크기 |
| `src/ui/Txt.tsx` | 신규 | 글꼴이 적용된 `Text` (`body`/`medium`/`title`/`hand`) |
| `src/ui/useReduceMotion.ts` | 신규 | 동작 줄이기 설정 구독 |
| `src/ui/Cover.tsx` | 신규 | 화면 전체 하드커버 표지(펼치기/덮기 애니메이션) |
| `src/ui/BookCover.tsx` | 신규 | 로그인·온보딩의 작은 다이어리 표지 그림 |
| `src/ui/Inkwell.tsx` | 신규 | 기분 잉크병(큰 것: 저녁, 작은 것: 달력) |
| `src/ui/StatusSymbol.tsx` | 신규 | • ◐ ●✓ › – 기호 |
| `src/ui/Highlight.tsx` | 신규 | 형광펜 띠 |
| `src/ui/RuledPaper.tsx` | 신규 | 줄 노트 카드 |
| `src/ui/Popover.tsx` | 신규 | 버튼 아래에 뜨는 팝오버 + `useAnchor` |
| `src/ui/dialogs.ts` | 신규 | 액션 시트, 지우기 확인 창 |
| `src/ui/symbols.ts` | 신규 | 항목 → 기호 종류, 접근성 문구, 기호 설명 목록 (순수) |
| `src/lib/date.ts` | 수정 | 날짜·달 표시 함수 |
| `src/lib/calendar.ts` | 신규 | 달력 칸 만들기 (순수) |
| `src/lib/onboarding.ts` | 신규 | 온보딩 완료 표시 읽기/쓰기 |
| `src/days/moods.ts` | 신규 | 기분 낱말, 잉크 높이 (순수) |
| `src/archive/repo.ts` | 신규 | 한 달 날짜별 요약 조회 |
| `src/archive/filters.ts` | 신규 | 회고 모아보기 필터 목록 (순수) |
| `src/reflections/repo.ts` | 수정 | 모든 회고를 기분과 함께 최신순으로 조회 |
| `App.tsx` | 수정 | 글꼴 불러오기, 종이 배경 |
| `src/screens/LoginScreen.tsx` | 교체 | 표지 그림 + 밑줄 입력 |
| `src/screens/OnboardingScreen.tsx` | 신규 | 4단계 온보딩 |
| `src/screens/Main.tsx` | 수정 | 화면 상태(온보딩/오늘/저녁/지난 기록), 표지, 뒤로 가기 |
| `src/screens/today/PostIt.tsx` | 신규 | 지난 할 일 포스트잇과 정리 애니메이션 |
| `src/screens/today/ItemRow.tsx` | 신규 | 할 일·메모 한 줄과 ⋯ 메뉴 |
| `src/screens/today/SymbolLegend.tsx` | 신규 | (i) 기호 설명 내용 |
| `src/screens/TodayScreen.tsx` | 교체 | 오늘 화면 |
| `src/screens/evening/TemplateSheet.tsx` | 신규 | 템플릿 만들기·고치기 시트 |
| `src/screens/EveningScreen.tsx` | 교체 | 저녁 마무리 |
| `src/screens/ArchiveScreen.tsx` | 신규 | 지난 기록(달력, 회고 모아보기) |

---

### Task 1: 의존성, 테마, 글꼴

**Files:**
- Modify: `mobile/package.json` (명령으로), `mobile/App.tsx`
- Create: `mobile/src/ui/theme.ts`, `mobile/src/ui/Txt.tsx`

- [ ] **Step 1: 패키지 설치** — SDK 57에 맞는 버전으로 설치한다.

```bash
npx expo install expo-font react-native-svg @expo-google-fonts/gowun-batang @expo-google-fonts/ibm-plex-sans-kr @expo-google-fonts/nanum-pen-script
node -e "for (const p of ['gowun-batang','ibm-plex-sans-kr','nanum-pen-script']) console.log(p, Object.keys(require('@expo-google-fonts/'+p)).filter(k => /_\d{3}/.test(k)).join(' '))"
```

Expected: `gowun-batang GowunBatang_400Regular GowunBatang_700Bold`, `ibm-plex-sans-kr ... IBMPlexSansKR_400Regular IBMPlexSansKR_500Medium ...`, `nanum-pen-script NanumPenScript_400Regular`. 이름이 다르면 아래 코드의 이름을 실제 이름으로 바꾼다.

- [ ] **Step 2: `src/ui/theme.ts` 작성**

```ts
// 종이 다이어리 색과 글꼴(스펙 11.1). 화면은 여기 값만 쓴다.
export const colors = {
  paper: '#F6F0E4', // 화면 배경(크림 종이)
  paperEvening: '#F3EBDA', // 저녁 마무리 배경
  card: '#FBF7EE', // 회고 카드, 칩
  popover: '#FFFDF8',
  chipSelected: '#EDE4D2',
  ink: '#2A2520', // 먹색 글씨
  inkSoft: '#4A4234',
  muted: '#6E6456',
  faint: '#8A8070',
  line: '#B9AC96',
  lineSoft: '#D8CDB9',
  lineFaint: '#E4DACA',
  ruled: '#DCD1BE', // 줄 노트 선
  navy: '#1E2F4D', // 키 컬러, 표지, 손글씨
  navyDeep: '#0B1424',
  coverText: '#E9DFC8',
  highlight: '#F1DE8A', // 형광펜
  postit: '#F3E4A8',
  postitText: '#6B5D3F',
  danger: '#9A2B1E',
  onDark: '#F6F0E4',
} as const;

export const fonts = {
  title: 'GowunBatang_400Regular',
  body: 'IBMPlexSansKR_400Regular',
  medium: 'IBMPlexSansKR_500Medium',
  hand: 'NanumPenScript_400Regular',
} as const;

export const HIT = 44; // 최소 터치 크기
export const SCREEN_X = 22; // 화면 좌우 여백
```

- [ ] **Step 3: `src/ui/Txt.tsx` 작성**

```tsx
import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fonts } from './theme';

export type TxtVariant = 'body' | 'medium' | 'title' | 'hand';

// 글꼴이 적용된 Text. hand(손글씨)는 기본으로 네이비 잉크색이다.
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: TxtVariant }) {
  return <Text {...rest} style={[styles.base, styles[variant], style]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.ink, fontSize: 16 },
  body: { fontFamily: fonts.body },
  medium: { fontFamily: fonts.medium },
  title: { fontFamily: fonts.title },
  hand: { fontFamily: fonts.hand, fontSize: 22, color: colors.navy },
});
```

- [ ] **Step 4: `App.tsx`에서 글꼴을 불러오고 배경을 종이색으로 바꾼다**

import 추가:

```tsx
import { GowunBatang_400Regular } from '@expo-google-fonts/gowun-batang';
import { IBMPlexSansKR_400Regular, IBMPlexSansKR_500Medium } from '@expo-google-fonts/ibm-plex-sans-kr';
import { NanumPenScript_400Regular } from '@expo-google-fonts/nanum-pen-script';
import { useFonts } from 'expo-font';
import { colors } from './src/ui/theme';
```

`App()` 첫 줄에:

```tsx
  // 글꼴을 못 불러와도 시스템 글꼴로 계속 연다.
  const [fontsLoaded, fontError] = useFonts({
    GowunBatang_400Regular,
    IBMPlexSansKR_400Regular,
    IBMPlexSansKR_500Medium,
    NanumPenScript_400Regular,
  });
  const fontsReady = fontsLoaded || fontError !== null;
```

로딩 조건 `else if (!db || !authReady)`를 `else if (!db || !authReady || !fontsReady)`로 바꾸고, `ActivityIndicator`에 `color={colors.navy}`를 준다. 스타일의 `root`를 `{ flex: 1, backgroundColor: colors.paper }`로 바꾼다.

- [ ] **Step 5: 확인** — `npx jest && npm run typecheck` 통과, 공통 규칙의 export 명령 성공.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json App.tsx src/ui/theme.ts src/ui/Txt.tsx
git commit -m "feat: 종이 다이어리 테마와 글꼴" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 날짜·달력·기호·기분·온보딩 순수 함수

**Files:**
- Modify: `mobile/src/lib/date.ts`, `mobile/src/lib/date.test.ts`
- Create: `mobile/src/lib/calendar.ts`, `mobile/src/lib/calendar.test.ts`, `mobile/src/ui/symbols.ts`, `mobile/src/ui/symbols.test.ts`, `mobile/src/days/moods.ts`, `mobile/src/days/moods.test.ts`, `mobile/src/lib/onboarding.ts`, `mobile/src/lib/onboarding.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/date.test.ts` 맨 위 import를 다음으로 바꾸고 테스트를 끝에 추가한다.

```ts
import { addDays, addMonths, formatLongDate, formatMonth, formatShortDate, logicalDate, monthOf, weekdayOf } from './date';
```

```ts
test('날짜를 한국어로 표시한다', () => {
  expect(weekdayOf('2026-10-07')).toBe(3);
  expect(formatLongDate('2026-10-07')).toBe('10월 7일 수요일');
  expect(formatShortDate('2026-10-06')).toBe('10/6');
});

test('달을 다룬다', () => {
  expect(monthOf('2026-10-07')).toBe('2026-10');
  expect(addMonths('2026-12', 1)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(formatMonth('2026-10')).toBe('2026년 10월');
});
```

`src/lib/calendar.test.ts`:

```ts
import { monthGrid } from './calendar';

test('일요일부터 시작하고 1일 앞은 빈 칸이다', () => {
  const cells = monthGrid('2026-10'); // 10월 1일은 목요일
  expect(cells).toHaveLength(35);
  expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
  expect(cells[4]).toBe('2026-10-01');
  expect(cells[34]).toBe('2026-10-31');
});

test('일요일에 시작하는 2월은 빈 칸이 없다', () => {
  const cells = monthGrid('2026-02');
  expect(cells).toHaveLength(28);
  expect(cells[0]).toBe('2026-02-01');
});
```

`src/ui/symbols.test.ts`:

```ts
import { canAdvance, itemA11yLabel, symbolKind } from './symbols';

const task = (status: 'open' | 'doing' | 'done' | 'migrated', priority = false) =>
  ({ kind: 'task' as const, status, priority, text: '보고서' });

test('항목의 기호 종류', () => {
  expect(symbolKind(task('open'))).toBe('open');
  expect(symbolKind(task('doing'))).toBe('doing');
  expect(symbolKind(task('migrated'))).toBe('migrated');
  expect(symbolKind({ kind: 'note', status: null })).toBe('note');
});

test('옮긴 일과 메모는 탭해도 상태가 바뀌지 않는다', () => {
  expect(canAdvance(task('open'))).toBe(true);
  expect(canAdvance(task('done'))).toBe(true);
  expect(canAdvance(task('migrated'))).toBe(false);
  expect(canAdvance({ kind: 'note', status: null })).toBe(false);
});

test('스크린 리더 문구에 중요, 상태, 다음 동작을 담는다', () => {
  expect(itemA11yLabel(task('open', true))).toBe('중요, 할 일, 보고서. 탭하면 진행 중');
  expect(itemA11yLabel(task('doing'))).toBe('진행 중, 보고서. 탭하면 끝냄');
  expect(itemA11yLabel(task('done'))).toBe('끝낸 일, 보고서. 탭하면 다시 할 일');
  expect(itemA11yLabel({ kind: 'note', status: null, priority: false, text: '비' })).toBe('메모, 비');
});
```

`src/days/moods.test.ts`:

```ts
import { inkLevel, moodWord } from './moods';

test('기분 낱말과 잉크 높이', () => {
  expect(moodWord(1)).toBe('힘듦');
  expect(moodWord(5)).toBe('좋음');
  expect(moodWord(null)).toBeNull();
  expect(inkLevel(1)).toBe(0);
  expect(inkLevel(3)).toBe(0.5);
  expect(inkLevel(5)).toBe(1);
});
```

`src/lib/onboarding.test.ts`:

```ts
import { hasSeenOnboarding, markOnboardingSeen, ONBOARDING_KEY } from './onboarding';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

test('처음에는 보지 않았고, 표시하면 본 것이 된다', async () => {
  const store = memoryStore();
  expect(await hasSeenOnboarding(store)).toBe(false);
  await markOnboardingSeen(store);
  expect(store.data.get(ONBOARDING_KEY)).toBe('1');
  expect(await hasSeenOnboarding(store)).toBe(true);
});

test('저장소 오류가 나도 앱을 멈추지 않는다', async () => {
  const broken = {
    getItem: async () => {
      throw new Error('x');
    },
    setItem: async () => {
      throw new Error('x');
    },
  };
  expect(await hasSeenOnboarding(broken)).toBe(true);
  await expect(markOnboardingSeen(broken)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/lib src/ui src/days/moods` → FAIL (`Cannot find module` 또는 `is not a function`)

- [ ] **Step 3: 구현**

`src/lib/date.ts` 끝에 추가:

```ts
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function partsOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

// 0=일요일
export function weekdayOf(date: string): number {
  const { y, m, d } = partsOf(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatLongDate(date: string): string {
  const { m, d } = partsOf(date);
  return `${m}월 ${d}일 ${WEEKDAYS[weekdayOf(date)]}요일`;
}

export function formatShortDate(date: string): string {
  const { m, d } = partsOf(date);
  return `${m}/${d}`;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}
```

`src/lib/calendar.ts`:

```ts
import { weekdayOf } from './date';

// 일요일부터 시작하는 달력 칸. 1일 앞의 빈 칸은 null, 나머지는 'YYYY-MM-DD'.
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekdayOf(`${month}-01`)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  return cells;
}
```

`src/ui/symbols.ts`:

```ts
import type { Item } from '../items/repo';

export type SymbolKind = 'open' | 'doing' | 'done' | 'migrated' | 'note';

type ItemLike = Pick<Item, 'kind' | 'status'>;

export function symbolKind(item: ItemLike): SymbolKind {
  if (item.kind === 'note') return 'note';
  return item.status ?? 'open';
}

// 기호를 탭하면 할 일 → 진행 중 → 끝냄 → 할 일로 돈다(스펙 11.2).
export function canAdvance(item: ItemLike): boolean {
  const k = symbolKind(item);
  return k === 'open' || k === 'doing' || k === 'done';
}

const WORD: Record<SymbolKind, string> = {
  open: '할 일',
  doing: '진행 중',
  done: '끝낸 일',
  migrated: '옮긴 일',
  note: '메모',
};
const HINT: Partial<Record<SymbolKind, string>> = {
  open: '탭하면 진행 중',
  doing: '탭하면 끝냄',
  done: '탭하면 다시 할 일',
};

export function itemA11yLabel(item: ItemLike & Pick<Item, 'priority' | 'text'>): string {
  const k = symbolKind(item);
  const hint = HINT[k];
  return `${item.priority ? '중요, ' : ''}${WORD[k]}, ${item.text}${hint ? `. ${hint}` : ''}`;
}

export type LegendEntry = {
  symbol: SymbolKind | 'highlight' | 'more';
  name: string;
  desc: string;
  kind?: 'task' | 'note'; // 입력 칩에서 고른 종류와 같으면 강조한다
};

export const LEGEND: LegendEntry[] = [
  { symbol: 'open', kind: 'task', name: '할 일', desc: '해야 할 일과 약속. 시간은 글에 함께 적어요(예: 15:00 팀 회의). 탭하면 진행 중' },
  { symbol: 'note', kind: 'note', name: '메모', desc: '생각, 느낌, 기억하고 싶은 것' },
  { symbol: 'doing', name: '진행 중', desc: '하고 있는 일. 탭하면 끝낸 일이 돼요' },
  { symbol: 'done', name: '끝낸 일', desc: '동그라미가 채워지고 줄이 그어져요. 탭하면 다시 할 일로' },
  { symbol: 'highlight', name: '형광펜 = 중요', desc: '⋯를 눌러 칠해요. 하루 3개까지, 위로 올라가요' },
  { symbol: 'migrated', name: '옮긴 일', desc: '다른 날로 옮겨 간 일' },
  { symbol: 'more', name: '더보기', desc: '줄 오른쪽 ⋯에서 형광펜이나 지우기를 골라요' },
];
```

`src/days/moods.ts`:

```ts
export const MOOD_WORDS = ['힘듦', '가라앉음', '보통', '괜찮음', '좋음'] as const;
export const MOODS = [1, 2, 3, 4, 5] as const;

export function moodWord(mood: number | null): string | null {
  return mood === null ? null : (MOOD_WORDS[mood - 1] ?? null);
}

// 잉크병에 찬 잉크 비율(1점=0, 5점=1)
export function inkLevel(mood: number): number {
  return (mood - 1) / 4;
}
```

`src/lib/onboarding.ts`:

```ts
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const ONBOARDING_KEY = 'nanal.onboarded';

// 저장소를 읽지 못하면 이미 본 것으로 친다(앱을 열 때마다 온보딩이 뜨지 않게).
export async function hasSeenOnboarding(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.getItem(ONBOARDING_KEY)) === '1';
  } catch {
    return true;
  }
}

export async function markOnboardingSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.setItem(ONBOARDING_KEY, '1');
  } catch {
    // 못 저장하면 다음에 한 번 더 보일 뿐이다.
  }
}
```

- [ ] **Step 4: 통과 확인** — `npx jest && npm run typecheck` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib src/ui/symbols.ts src/ui/symbols.test.ts src/days/moods.ts src/days/moods.test.ts
git commit -m "feat: 날짜 표시, 달력 칸, 기호 문구, 기분 낱말, 온보딩 표시" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 지난 기록 조회

**Files:**
- Create: `mobile/src/archive/repo.ts`, `mobile/src/archive/repo.test.ts`, `mobile/src/archive/filters.ts`, `mobile/src/archive/filters.test.ts`
- Modify: `mobile/src/reflections/repo.ts`, `mobile/src/reflections/repo.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/archive/repo.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { setMood } from '../days/repo';
import { migrate } from '../db/schema';
import type { Db } from '../db/types';
import { addItem, advanceStatus, deleteItem, migrateToToday } from '../items/repo';
import { addReflection } from '../reflections/repo';
import { listMonthSummary } from './repo';

let db: Db;
beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
});

const at = (d: number, h = 12) => new Date(2026, 9, d, h, 0);

test('기록이 있는 날만 기분, 회고 여부, 할 일 수와 함께 돌려준다', async () => {
  const a = await addItem(db, { kind: 'task', text: '보고서' }, at(5));
  await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  await addItem(db, { kind: 'note', text: '비' }, at(5));
  await advanceStatus(db, a.id, at(5));
  await advanceStatus(db, a.id, at(5)); // done
  await setMood(db, '2026-10-06', 2, at(6));
  await addReflection(db, { templateId: 'free', answers: { body: '조용한 날' } }, at(6));
  await setMood(db, '2026-09-30', 4, at(30)); // 다른 달

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 1, tasksTotal: 2 },
    { date: '2026-10-06', mood: 2, hasReflection: true, tasksDone: 0, tasksTotal: 0 },
  ]);
});

test('지운 항목과 다른 날로 옮긴 원래 항목은 세지 않는다', async () => {
  const a = await addItem(db, { kind: 'task', text: '장보기' }, at(5));
  const b = await addItem(db, { kind: 'task', text: '책 반납' }, at(5));
  await deleteItem(db, b.id, at(5));
  await migrateToToday(db, a.id, at(7));

  expect(await listMonthSummary(db, '2026-10')).toEqual([
    { date: '2026-10-05', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 0 },
    { date: '2026-10-07', mood: null, hasReflection: false, tasksDone: 0, tasksTotal: 1 },
  ]);
});
```

`src/reflections/repo.test.ts` 맨 위 import에 `listReflectionHistory`를 더하고(`import { addReflection, listReflectionHistory, listReflections } from './repo';`), `setMood` import(`import { setMood } from '../days/repo';`)를 추가한 뒤 끝에 테스트를 추가한다.

```ts
test('모든 회고를 최신순으로 그날 기분과 함께 돌려준다', async () => {
  await addReflection(db, { templateId: 'gratitude', answers: { good: '커피' } }, new Date(2026, 9, 2, 22, 0));
  await addReflection(db, { templateId: 'lethargy', answers: { cause: '잠' } }, new Date(2026, 9, 5, 22, 0));
  await setMood(db, '2026-10-05', 1, new Date(2026, 9, 5, 22, 0));

  const all = await listReflectionHistory(db);
  expect(all.map((r) => [r.date, r.templateName, r.mood])).toEqual([
    ['2026-10-05', '무기력했던 날', 1],
    ['2026-10-02', '감사한 날', null],
  ]);
});
```

`src/archive/filters.test.ts`:

```ts
import { reflectionFilters } from './filters';

test('회고에 쓰인 템플릿을 처음 나온 순서로, 개수와 함께 모은다', () => {
  const entries = [
    { template: 'gratitude', templateName: '감사한 날' },
    { template: 'lethargy', templateName: '무기력했던 날' },
    { template: 'gratitude', templateName: '감사한 날' },
  ];
  expect(reflectionFilters(entries)).toEqual([
    { id: 'gratitude', name: '감사한 날', count: 2 },
    { id: 'lethargy', name: '무기력했던 날', count: 1 },
  ]);
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/archive src/reflections` → FAIL

- [ ] **Step 3: 구현**

`src/archive/repo.ts`:

```ts
import type { Db } from '../db/types';

export type DaySummary = {
  date: string;
  mood: number | null;
  hasReflection: boolean;
  tasksDone: number;
  tasksTotal: number; // 다른 날로 옮겨 간 원래 항목은 빼고 센다
};

// 한 달('YYYY-MM') 중 기록이 있는 날의 요약. 기록한 날 세기(stats/recordedDays)와 같은 기준이다.
export async function listMonthSummary(db: Db, month: string): Promise<DaySummary[]> {
  const rows = await db.getAllAsync<{ date: string; mood: number | null; refl: number; done: number; total: number }>(
    `SELECT d.date AS date,
       (SELECT mood FROM days WHERE date = d.date AND deleted_at IS NULL) AS mood,
       EXISTS (SELECT 1 FROM reflections WHERE date = d.date AND deleted_at IS NULL) AS refl,
       (SELECT COUNT(*) FROM items WHERE date = d.date AND deleted_at IS NULL AND kind = 'task'
          AND status = 'done') AS done,
       (SELECT COUNT(*) FROM items WHERE date = d.date AND deleted_at IS NULL AND kind = 'task'
          AND status != 'migrated') AS total
     FROM (
       SELECT date FROM items WHERE deleted_at IS NULL
       UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
       UNION SELECT date FROM reflections WHERE deleted_at IS NULL
     ) d
     WHERE d.date BETWEEN ? AND ?
     ORDER BY d.date`,
    [`${month}-01`, `${month}-31`],
  );
  return rows.map((r) => ({
    date: r.date,
    mood: r.mood,
    hasReflection: r.refl === 1,
    tasksDone: r.done,
    tasksTotal: r.total,
  }));
}
```

`src/archive/filters.ts`:

```ts
export type ReflectionFilter = { id: string; name: string; count: number };

// 회고 모아보기의 템플릿 필터. 지운 템플릿도 회고가 남아 있으면 보인다.
export function reflectionFilters(entries: { template: string; templateName: string }[]): ReflectionFilter[] {
  const byId = new Map<string, ReflectionFilter>();
  for (const e of entries) {
    const f = byId.get(e.template);
    if (f) f.count += 1;
    else byId.set(e.template, { id: e.template, name: e.templateName, count: 1 });
  }
  return [...byId.values()];
}
```

`src/reflections/repo.ts`: `listReflections` 안의 `rows.map((r) => { ... })` 본문을 모듈 함수로 꺼내고, 새 조회를 추가한다.

```ts
function toReflection(r: ReflectionRow): Reflection {
  const snap = resolveSnapshot(r);
  return {
    id: r.id, date: r.date, template: r.template, templateName: snap.name, questions: snap.questions,
    answers: JSON.parse(r.answers) as Record<string, string>,
    created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
  };
}
```

`listReflections`의 마지막 줄은 `return rows.map(toReflection);`로 바꾼다. 파일 끝에 추가:

```ts
export type ReflectionEntry = Reflection & { mood: number | null };

// 지난 기록의 회고 모아보기: 모든 회고를 최신순으로, 그날 기분과 함께.
export async function listReflectionHistory(db: Db): Promise<ReflectionEntry[]> {
  const rows = await db.getAllAsync<ReflectionRow & { mood: number | null }>(
    `SELECT r.id, r.date, r.template, r.answers, r.snapshot, r.created_at, r.updated_at, r.deleted_at,
       (SELECT mood FROM days WHERE date = r.date AND deleted_at IS NULL) AS mood
     FROM reflections r WHERE r.deleted_at IS NULL
     ORDER BY r.date DESC, r.created_at DESC`,
    [],
  );
  return rows.map((r) => ({ ...toReflection(r), mood: r.mood }));
}
```

- [ ] **Step 4: 통과 확인** — `npx jest && npm run typecheck` → PASS

- [ ] **Step 5: 커밋**

```bash
git add src/archive src/reflections
git commit -m "feat: 지난 기록용 한 달 요약과 회고 모아보기 조회" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 공통 그림 조각 (표지, 잉크병, 기호, 형광펜, 줄 노트)

**Files:**
- Create: `mobile/src/ui/useReduceMotion.ts`, `mobile/src/ui/Cover.tsx`, `mobile/src/ui/BookCover.tsx`, `mobile/src/ui/Inkwell.tsx`, `mobile/src/ui/StatusSymbol.tsx`, `mobile/src/ui/Highlight.tsx`, `mobile/src/ui/RuledPaper.tsx`

화면 조각이라 단위 테스트 대신 typecheck와 번들로 확인하고, Task 6 이후 시뮬레이터에서 눈으로 본다.

- [ ] **Step 1: `src/ui/useReduceMotion.ts`**

```ts
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// iOS '동작 줄이기'가 켜져 있으면 true. 표지, 포스트잇 애니메이션을 건너뛴다.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
```

- [ ] **Step 2: `src/ui/Cover.tsx`** — 목업의 `.nanal-cover`(950ms, `cubic-bezier(0.32, 0.72, 0.2, 1)`, 왼쪽 축으로 -172도)

```tsx
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, fonts } from './theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

type Props = {
  open: boolean; // true면 펼쳐져 사라지고, false면 덮인다
  line: string; // 표지 아래 문구
  onClosed?: () => void; // 덮기가 끝났을 때
  children?: ReactNode; // 덮인 표지 위에 올릴 버튼 등
};

const DURATION = 950;

export function Cover({ open, line, onClosed, children }: Props) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [visible, setVisible] = useState(!open);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (!open) setVisible(true);
    const finish = () => {
      if (open) setVisible(false);
      else onClosedRef.current?.();
    };
    if (reduce) {
      progress.setValue(open ? 1 : 0);
      finish();
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      easing: Easing.bezier(0.32, 0.72, 0.2, 1),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) finish();
    });
    return () => anim.stop();
  }, [open, reduce, progress]);

  if (!visible) return null;
  const rotateY = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-172deg'] });
  return (
    <Animated.View
      pointerEvents={open ? 'none' : 'auto'}
      accessibilityViewIsModal={!open}
      style={[styles.cover, { transform: [{ perspective: 1800 }, { rotateY }] }]}
    >
      <View style={styles.spine} />
      <View style={styles.frame} />
      <View style={styles.band} />
      <View style={styles.titleBox}>
        <Txt variant="title" style={styles.title}>
          나날
        </Txt>
        <View style={styles.rule} />
        <Txt variant="title" style={styles.line}>
          {line}
        </Txt>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: colors.navy,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.06)',
  },
  frame: {
    position: 'absolute',
    top: 22,
    bottom: 22,
    left: 36,
    right: 22,
    borderWidth: 1,
    borderColor: 'rgba(233, 223, 200, 0.45)',
    borderRadius: 2,
  },
  band: { position: 'absolute', top: 0, bottom: 0, right: 46, width: 9, backgroundColor: colors.navyDeep },
  titleBox: { position: 'absolute', top: '36%', left: 18, right: 0, alignItems: 'center', gap: 14 },
  title: { fontFamily: fonts.title, fontSize: 52, letterSpacing: 8, color: colors.coverText },
  rule: { width: 32, height: 1, backgroundColor: 'rgba(233, 223, 200, 0.7)' },
  line: { fontSize: 14, letterSpacing: 3, color: 'rgba(233, 223, 200, 0.85)' },
});
```

- [ ] **Step 3: `src/ui/BookCover.tsx`** — 로그인(262×354)과 온보딩(164×216)의 정지된 표지 그림

```tsx
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';
import { Txt } from './Txt';

type Props = { width: number; height: number; titleSize: number; subtitle?: string; footer?: string };

// 종이 묶음 위에 놓인 하드커버 다이어리. 장식이므로 스크린 리더에서 숨긴다.
export function BookCover({ width, height, titleSize, subtitle, footer }: Props) {
  const scale = width / 262;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: width + 6, height: height + 6 }}>
      <View style={[styles.pages, { width, height }]} />
      <View style={[styles.cover, { width, height, paddingTop: height * 0.24 }]}>
        <View style={[styles.spine, { width: 16 * scale }]} />
        <View style={[styles.frame, { top: 14 * scale, bottom: 14 * scale, left: 30 * scale, right: 14 * scale }]} />
        <View style={[styles.band, { right: 34 * scale, width: 7 * scale }]} />
        <Txt variant="title" style={[styles.title, { fontSize: titleSize, letterSpacing: titleSize / 8 }]}>
          나날
        </Txt>
        {subtitle && (
          <>
            <View style={styles.rule} />
            <Txt variant="title" style={styles.subtitle}>
              {subtitle}
            </Txt>
          </>
        )}
        {footer && (
          <Txt variant="title" style={styles.footer}>
            {footer}
          </Txt>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pages: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: '#EFE6D3',
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#DCD0BA',
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    alignItems: 'center',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: colors.navy,
  },
  spine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
  },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(233, 223, 200, 0.45)', borderRadius: 2 },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.navyDeep },
  title: { color: colors.coverText },
  rule: { marginTop: 14, width: 28, height: 1, backgroundColor: 'rgba(233, 223, 200, 0.7)' },
  subtitle: { marginTop: 14, fontSize: 13, letterSpacing: 3, color: 'rgba(233, 223, 200, 0.85)' },
  footer: { position: 'absolute', bottom: 30, fontSize: 11, letterSpacing: 4, color: 'rgba(233, 223, 200, 0.6)' },
});
```

- [ ] **Step 4: `src/ui/Inkwell.tsx`** — 목업 Evening(큰 병 48×72)과 Archive(작은 병 16×20)의 SVG 그대로

```tsx
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { inkLevel } from '../days/moods';
import { colors } from './theme';

const WELL = 'M8 70H40C43 70 44.5 67 43 64L36 50C35 48 33 47 31 47H17C15 47 13 48 12 50L5 64C3.5 67 5 70 8 70Z';

type Props = {
  id: string; // clipPath id (화면 안에서 겹치지 않게)
  mood: number | null; // 없으면 빈 병
  size: 'large' | 'small';
  selected?: boolean; // 큰 병: 깃펜을 꽂는다
  color?: string;
  paper?: string; // 병 안쪽 바탕색
};

export function Inkwell({ id, mood, size, selected = false, color = colors.navy, paper = colors.paperEvening }: Props) {
  const fillY = mood === null ? 80 : 70 - 23 * inkLevel(mood);
  if (size === 'small') {
    return (
      <Svg width={16} height={20} viewBox="0 36 48 36" fill="none" accessible={false}>
        <Defs>
          <ClipPath id={id}>
            <Path d={WELL} />
          </ClipPath>
        </Defs>
        <Rect x={4} y={fillY} width={40} height={30} fill={color} clipPath={`url(#${id})`} />
        <Path d={WELL} stroke={color} strokeWidth={3} />
        <Rect x={17} y={40} width={14} height={7} stroke={color} strokeWidth={3} />
      </Svg>
    );
  }
  return (
    <Svg width={48} height={72} viewBox="0 0 48 72" fill="none" accessible={false}>
      <Defs>
        <ClipPath id={id}>
          <Path d={WELL} />
        </ClipPath>
      </Defs>
      <G opacity={selected ? 1 : 0}>
        <Path d="M23 56L40 9" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
        <Path d="M29.5 37C25.5 27 30 13 43.5 2C45 15.5 40.5 29 29.5 37Z" fill={color} />
        <Path
          d="M31 31L37 29M32.5 26L39 23.5M34.5 21L40.5 17.5M36.5 16L41.5 12M38.5 11L42.5 7"
          stroke={paper}
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      </G>
      <Path d={WELL} fill={paper} />
      <Rect x={4} y={fillY} width={40} height={30} fill={color} clipPath={`url(#${id})`} />
      <Path d={WELL} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Rect x={18} y={41} width={12} height={6} fill={paper} stroke={color} strokeWidth={1.5} />
      <Rect x={15.5} y={37} width={17} height={4.5} rx={1.2} fill={color} />
      <Path d="M33 54L38 64" stroke={colors.card} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M27 43V46" stroke={colors.card} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}
```

- [ ] **Step 5: `src/ui/StatusSymbol.tsx`**

```tsx
import { StyleSheet, View } from 'react-native';
import type { SymbolKind } from './symbols';
import { colors } from './theme';
import { Txt } from './Txt';

const TEXT: Partial<Record<SymbolKind, string>> = { open: '•', note: '–', migrated: '›' };

// 줄 앞의 상태 기호 하나(스펙 11.2). 의미는 줄의 접근성 문구가 전한다.
export function StatusSymbol({ kind, size = 18 }: { kind: SymbolKind; size?: number }) {
  if (kind === 'doing') {
    return (
      <View accessible={false} style={[styles.circle, styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[styles.half, { width: size / 2 }]} />
      </View>
    );
  }
  if (kind === 'done') {
    return (
      <View accessible={false} style={[styles.circle, styles.filled, { width: size, height: size, borderRadius: size / 2 }]}>
        <Txt style={[styles.check, { fontSize: size * 0.6 }]}>✓</Txt>
      </View>
    );
  }
  return (
    <Txt accessible={false} style={[styles.glyph, { width: size, fontSize: kind === 'open' ? 20 : 18 }]}>
      {TEXT[kind]}
    </Txt>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5, borderColor: colors.navy, alignItems: 'flex-start' },
  half: { height: '100%', backgroundColor: colors.navy },
  filled: { backgroundColor: colors.navy },
  check: { color: colors.card },
  glyph: { textAlign: 'center', color: colors.ink },
});
```

- [ ] **Step 6: `src/ui/Highlight.tsx`**

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

// 글자 아래쪽에 칠한 형광펜 띠(목업: 55%~92% 높이).
export function Highlight({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.band} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, paddingHorizontal: 3 },
  band: { position: 'absolute', left: 0, right: 0, top: '55%', bottom: '8%', backgroundColor: colors.highlight },
});
```

- [ ] **Step 7: `src/ui/RuledPaper.tsx`**

```tsx
import { type ReactNode, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

type Props = { lineHeight?: number; style?: StyleProp<ViewStyle>; children: ReactNode };

// 줄 노트 카드. 높이에 맞춰 lineHeight 간격으로 선을 긋는다.
export function RuledPaper({ lineHeight = 32, style, children }: Props) {
  const [height, setHeight] = useState(0);
  const count = Math.floor(height / lineHeight);
  return (
    <View style={[styles.paper, style]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} pointerEvents="none" style={[styles.line, { top: (i + 1) * lineHeight - 1 }]} />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.card, borderRadius: 2, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.ruled },
});
```

- [ ] **Step 8: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 9: 커밋**

```bash
git add src/ui
git commit -m "feat: 표지, 잉크병, 상태 기호, 형광펜, 줄 노트 조각" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 팝오버와 확인 창

**Files:**
- Create: `mobile/src/ui/Popover.tsx`, `mobile/src/ui/dialogs.ts`

- [ ] **Step 1: `src/ui/Popover.tsx`**

```tsx
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from './theme';

export type Anchor = { x: number; y: number; width: number; height: number };

// 버튼 위치를 재서 그 아래에 팝오버를 띄운다.
export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { ref, anchor, open, close };
}

type Props = {
  anchor: Anchor | null;
  align: 'left' | 'right'; // 버튼 왼쪽 끝 또는 오른쪽 끝에 맞춘다
  width: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function Popover({ anchor, align, width, label, onClose, children }: Props) {
  const screen = useWindowDimensions();
  if (!anchor) return null;
  const left =
    align === 'left'
      ? Math.max(12, Math.min(anchor.x - 4, screen.width - width - 12))
      : Math.max(12, anchor.x + anchor.width - width + 6);
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[styles.box, { top: anchor.y + anchor.height + 4, left, width }]}
      >
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    padding: 4,
    backgroundColor: colors.popover,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
});
```

- [ ] **Step 2: `src/ui/dialogs.ts`**

```ts
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

// iOS는 기본 액션 시트, 그 외는 Alert 버튼으로 같은 선택지를 보여준다.
export function showActionSheet(title: string, actions: SheetAction[]): void {
  if (Platform.OS === 'ios') {
    const destructive = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.label), '취소'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      },
      (i) => actions[i]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...actions.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })),
    { text: '취소', style: 'cancel' as const },
  ]);
}

// 지우기 전에 한 번 묻는다(스펙 11.2, 11.8).
export function confirmDelete(title: string, message: string | undefined, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '지우기', style: 'destructive', onPress: onConfirm },
  ]);
}
```

- [ ] **Step 3: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/ui/Popover.tsx src/ui/dialogs.ts
git commit -m "feat: 팝오버, 액션 시트, 지우기 확인 창" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 로그인, 온보딩, 화면 전환과 표지

**Files:**
- Replace: `mobile/src/screens/LoginScreen.tsx`
- Create: `mobile/src/screens/OnboardingScreen.tsx`
- Modify: `mobile/src/screens/Main.tsx`

- [ ] **Step 1: `LoginScreen.tsx`를 다음으로 교체** (로그인 로직은 그대로, 모양만 목업 Login)

```tsx
import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { BookCover } from '../ui/BookCover';
import { colors, fonts } from '../ui/theme';
import { Txt } from '../ui/Txt';

function authErrorMessage(e: AuthError): string {
  if (isAuthRetryableFetchError(e)) return '네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도하세요';
  if (e.code === 'invalid_credentials' || e.message.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다';
  }
  if (e.code === 'email_not_confirmed' || e.message.includes('Email not confirmed')) {
    return '이메일 인증이 필요합니다';
  }
  return e.message;
}

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) setError(authErrorMessage(e));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !email || !password;
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.cover}>
            <BookCover width={262} height={354} titleSize={46} subtitle="오늘도 한 줄씩" footer="2026" />
          </View>
          <Txt variant="title" accessibilityRole="header" style={styles.srOnly}>
            나날 로그인
          </Txt>
          <View style={styles.form}>
            <View style={styles.field}>
              <Txt style={styles.label}>이메일</Txt>
              <TextInput
                style={styles.input}
                placeholder="me@example.com"
                placeholderTextColor={colors.faint}
                accessibilityLabel="이메일"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.field}>
              <Txt style={styles.label}>비밀번호</Txt>
              <TextInput
                style={styles.input}
                placeholder="비밀번호"
                placeholderTextColor={colors.faint}
                accessibilityLabel="비밀번호"
                secureTextEntry
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={signIn}
              />
            </View>
            {error && (
              <Txt style={styles.error} accessibilityRole="alert">
                {error}
              </Txt>
            )}
            <Pressable
              style={[styles.button, disabled && styles.disabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              onPress={signIn}
            >
              <Txt variant="medium" style={styles.buttonText}>
                {busy ? '펼치는 중…' : '노트 펼치기'}
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 40, paddingBottom: 40, gap: 40 },
  cover: { alignSelf: 'center' },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  form: { gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 14, color: colors.muted },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 14 },
  button: {
    marginTop: 10,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onDark },
});
```

- [ ] **Step 2: `OnboardingScreen.tsx` 작성** (목업 Onboarding 4단계)

```tsx
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BookCover } from '../ui/BookCover';
import { Highlight } from '../ui/Highlight';
import { Inkwell } from '../ui/Inkwell';
import { StatusSymbol } from '../ui/StatusSymbol';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { useReduceMotion } from '../ui/useReduceMotion';

const STEPS = 4;

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const reduce = useReduceMotion();
  const book = useRef(new Animated.Value(0)).current;
  const opening = useRef(false);

  // 첫 단계의 "시작하기"는 작은 다이어리 표지를 펼친 뒤 다음 단계로 간다.
  const next = () => {
    if (step > 0) {
      setStep(Math.min(step + 1, STEPS - 1));
      return;
    }
    if (opening.current) return;
    if (reduce) {
      setStep(1);
      return;
    }
    opening.current = true;
    Animated.timing(book, {
      toValue: 1,
      duration: 800,
      easing: Easing.bezier(0.32, 0.72, 0.2, 1),
      useNativeDriver: true,
    }).start(() => {
      opening.current = false;
      book.setValue(0);
      setStep(1);
    });
  };
  const rotateY = book.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-165deg'] });

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`${STEPS}단계 중 ${step + 1}단계`} style={styles.dots}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" style={styles.skip} onPress={onDone}>
          <Txt style={styles.skipText}>건너뛰기</Txt>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step === 0 && (
          <View style={styles.centered}>
            <Animated.View style={[styles.book, { transform: [{ rotate: '-4deg' }, { perspective: 900 }, { rotateY }] }]}>
              <BookCover width={164} height={216} titleSize={28} />
            </Animated.View>
            <View style={styles.copy}>
              <Txt variant="title" accessibilityRole="header" style={styles.h1}>
                {'할 일은 놓치지 않게,\n마음은 차곡차곡.'}
              </Txt>
              <Txt style={styles.lead}>하루를 한 줄씩 적는 다이어리예요. 아침엔 할 일을 정하고, 저녁엔 오늘의 마음을 남겨요.</Txt>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.section}>
            <Txt variant="title" accessibilityRole="header" style={styles.h2}>
              기호 두 개면 충분해요
            </Txt>
            <View style={styles.card}>
              <View style={styles.badge}>
                <Txt style={styles.badgeText}>•</Txt>
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">할 일</Txt>
                <Txt style={styles.small}>보고서 초안 마무리 · 15:00 팀 회의</Txt>
              </View>
            </View>
            <View style={styles.card}>
              <View style={styles.badge}>
                <Txt style={styles.badgeText}>–</Txt>
              </View>
              <View style={styles.cardText}>
                <Txt variant="medium">메모</Txt>
                <Txt variant="hand" style={styles.handSmall}>
                  비 오는 날 창가 자리가 좋았다
                </Txt>
              </View>
            </View>
            <View style={styles.dashedTop}>
              <Txt style={styles.small}>할 일은 이렇게 바뀌어요</Txt>
              <View style={styles.flow}>
                <StatusSymbol kind="open" size={16} />
                <Txt style={styles.flowText}>할 일</Txt>
                <Txt style={styles.arrow}>→</Txt>
                <StatusSymbol kind="doing" size={16} />
                <Txt style={styles.flowText}>진행 중</Txt>
                <Txt style={styles.arrow}>→</Txt>
                <StatusSymbol kind="done" size={16} />
                <Txt style={styles.flowText}>끝냄</Txt>
              </View>
              <Txt style={styles.note}>기호를 누를 때마다 다음 단계로 바뀌어요.</Txt>
              <View style={styles.wrapRow}>
                <View style={styles.inline}>
                  <Highlight on>
                    <Txt>형광펜</Txt>
                  </Highlight>
                  <Txt>중요한 일 (하루 3개)</Txt>
                </View>
                <View style={styles.inline}>
                  <StatusSymbol kind="migrated" size={16} />
                  <Txt>다른 날로 옮김</Txt>
                </View>
                <View style={styles.inline}>
                  <Txt style={styles.muted}>×</Txt>
                  <Txt style={styles.muted}>지우기</Txt>
                </View>
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Txt variant="title" accessibilityRole="header" style={styles.h2}>
              하루는 이렇게 흘러가요
            </Txt>
            <View style={styles.flowItem}>
              <View style={styles.postit} />
              <View style={styles.cardText}>
                <Txt variant="medium">아침</Txt>
                <Txt style={styles.small}>어제에서 넘어온 일을 오늘 할지, 내일로 미룰지, 지울지 골라요.</Txt>
              </View>
            </View>
            <View style={styles.flowItem}>
              <View style={styles.dotPaper} />
              <View style={styles.cardText}>
                <Txt variant="medium">낮</Txt>
                <Txt style={styles.small}>떠오를 때마다 할 일이나 메모로 한 줄씩 적어요.</Txt>
              </View>
            </View>
            <View style={styles.flowItem}>
              <Inkwell id="onboarding-well" mood={4} size="large" paper={colors.paper} />
              <View style={styles.cardText}>
                <Txt variant="medium">저녁</Txt>
                <Txt style={styles.small}>잉크병에 오늘 기분을 담고, 원하면 짧게 돌아봐요.</Txt>
              </View>
            </View>
            <View style={styles.tip}>
              <Txt variant="hand">기호가 헷갈리면 (i)를 눌러요</Txt>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.centered}>
            <View accessible={false} style={styles.stamp}>
              <Txt variant="title" style={styles.stampSmall}>
                기록한 날
              </Txt>
              <Txt variant="title" style={styles.stampBig}>
                1
              </Txt>
              <Txt variant="title" style={styles.stampSmall}>
                일째
              </Txt>
            </View>
            <View style={styles.copy}>
              <Txt variant="title" accessibilityRole="header" style={styles.h1}>
                {'오늘의 첫 줄을\n적어볼까요?'}
              </Txt>
              <Txt style={styles.lead}>며칠 쉬어도 괜찮아요. 쌓인 날은 줄어들지 않아요.</Txt>
              <Txt style={styles.note}>기호 설명은 오늘 화면의 (i)에서 언제든 다시 볼 수 있어요.</Txt>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {step > 0 && (
          <Pressable accessibilityRole="button" style={styles.back} onPress={() => setStep(step - 1)}>
            <Txt>이전</Txt>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" style={styles.primary} onPress={step === STEPS - 1 ? onDone : next}>
          <Txt variant="medium" style={styles.primaryText}>
            {step === 0 ? '시작하기' : step === STEPS - 1 ? '첫 줄 쓰기' : '다음'}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 24, gap: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9BCA5' },
  dotOn: { width: 22, backgroundColor: colors.ink },
  skip: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  skipText: { fontSize: 14, color: colors.inkSoft },
  body: { flexGrow: 1 },
  centered: { flexGrow: 1, justifyContent: 'center', gap: 28 },
  book: { alignSelf: 'center', transformOrigin: 'left center' },
  copy: { gap: 12 },
  h1: { fontSize: 28, lineHeight: 38 },
  h2: { fontSize: 26, lineHeight: 35 },
  lead: { fontSize: 16, lineHeight: 26, color: colors.inkSoft },
  section: { gap: 16 },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 10,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 22 },
  cardText: { flex: 1, gap: 2 },
  small: { fontSize: 14, lineHeight: 22, color: colors.inkSoft },
  handSmall: { fontSize: 21 },
  dashedTop: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flowText: { fontSize: 15 },
  arrow: { color: colors.faint },
  note: { fontSize: 13, color: colors.muted },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { color: colors.inkSoft },
  flowItem: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  postit: { width: 44, height: 40, backgroundColor: colors.postit, transform: [{ rotate: '-4deg' }] },
  dotPaper: { width: 44, height: 40, borderRadius: 4, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft },
  tip: { padding: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.navy, borderRadius: 12 },
  stamp: {
    alignSelf: 'center',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1.5,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  stampSmall: { fontSize: 14, color: colors.navy },
  stampBig: { fontSize: 38, lineHeight: 44, color: colors.navy },
  actions: { flexDirection: 'row', gap: 10 },
  back: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.ink,
    justifyContent: 'center',
  },
  primary: { flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark },
});
```

- [ ] **Step 3: `Main.tsx`의 `MainContent`를 다음으로 교체**

import를 다음으로 맞춘다(`Text`는 `blocked` 문구에서 계속 쓴다).

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Db } from '../db/types';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
import { supabase } from '../supabase';
import { claimOwner } from '../sync/owner';
import { createSupabaseRemote } from '../sync/supabaseRemote';
import { useSync } from '../sync/useSync';
import { Cover } from '../ui/Cover';
import { colors } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { EveningScreen } from './EveningScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { TodayScreen } from './TodayScreen';
```

지난 기록 화면은 아직 없으므로 `TodayScreen`의 `onOpenArchive`는 Task 8에서, `ArchiveScreen` 분기는 Task 11에서 연결한다. `Screen` 타입에는 `'archive'`를 미리 둔다. 아래 `styles`는 파일의 기존 `styles`를 대체한다(`Main`의 `blocked`, `container`도 여기서 쓴다). `MainContent`:

```tsx
type Screen = 'onboarding' | 'today' | 'evening' | 'archive';

function MainContent({ db, userId }: { db: Db; userId: string }) {
  const remote = useMemo(() => createSupabaseRemote(supabase, userId), [userId]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const { pending, error, requestSync } = useSync(db, remote, refresh);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [dayClosed, setDayClosed] = useState(false); // 저녁 마무리에서 "닫기"를 눌렀다
  const [closedShown, setClosedShown] = useState(false); // 덮기 애니메이션이 끝났다

  useEffect(() => {
    hasSeenOnboarding(AsyncStorage).then((seen) => setScreen(seen ? 'today' : 'onboarding'));
  }, []);

  // 첫 화면이 정해지면 잠깐 표지를 보여준 뒤 펼친다(스펙 11.1).
  const ready = screen !== null;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setCoverOpen(true), 450);
    return () => clearTimeout(t);
  }, [ready]);

  // 앱을 다시 열면 날짜(새벽 4시 경계)가 바뀌었을 수 있으므로 다시 그린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Android 뒤로 가기: 저녁·지난 기록에서는 오늘로 돌아간다.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'evening' || screen === 'archive') {
        setScreen('today');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const onChanged = useCallback(() => {
    refresh();
    requestSync();
  }, [refresh, requestSync]);

  const finishOnboarding = useCallback(() => {
    markOnboardingSeen(AsyncStorage);
    setScreen('today');
  }, []);

  const closeDay = useCallback(() => {
    setDayClosed(true);
    setCoverOpen(false);
  }, []);

  const reopen = useCallback(() => {
    setScreen('today');
    setDayClosed(false);
    setClosedShown(false);
    setCoverOpen(true);
  }, []);

  const background = screen === 'evening' ? colors.paperEvening : colors.paper;
  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <SafeAreaView style={styles.container}>
        {(pending > 0 || error) && (
          <Txt style={styles.syncBar} accessibilityLiveRegion="polite">
            {error
              ? pending > 0
                ? `동기화 실패, 자동으로 다시 시도합니다 (${pending}건 대기)`
                : '동기화 실패, 자동으로 다시 시도합니다'
              : `동기화 대기 ${pending}건`}
          </Txt>
        )}
        {screen === 'onboarding' && <OnboardingScreen onDone={finishOnboarding} />}
        {screen === 'today' && (
          <TodayScreen
            db={db}
            version={version}
            onChanged={onChanged}
            onOpenEvening={() => setScreen('evening')}
          />
        )}
        {screen === 'evening' && <EveningScreen db={db} version={version} onChanged={onChanged} onClose={closeDay} />}
      </SafeAreaView>
      <Cover
        open={coverOpen}
        line={dayClosed ? '오늘도 수고했어요' : '오늘도 한 줄씩'}
        onClosed={() => setClosedShown(true)}
      >
        {dayClosed && closedShown && (
          <Pressable accessibilityRole="button" style={styles.reopen} onPress={reopen}>
            <Txt style={styles.reopenText}>내일 다시 펼치기</Txt>
          </Pressable>
        )}
      </Cover>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 }, // 배경은 root와 각 화면이 칠한다(저녁은 paperEvening)
  blocked: { padding: 24, fontSize: 16, lineHeight: 24, color: colors.ink },
  syncBar: { backgroundColor: colors.postit, color: colors.postitText, paddingVertical: 6, paddingHorizontal: 16, fontSize: 13 },
  reopen: {
    marginTop: 120,
    width: 164,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 223, 200, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reopenText: { color: colors.coverText, fontSize: 15 },
});
```

- [ ] **Step 4: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/LoginScreen.tsx src/screens/OnboardingScreen.tsx src/screens/Main.tsx
git commit -m "feat: 로그인과 온보딩, 표지가 펼쳐지고 덮이는 화면 전환" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 오늘 화면 조각 (포스트잇, 한 줄, 기호 설명)

**Files:**
- Create: `mobile/src/screens/today/PostIt.tsx`, `mobile/src/screens/today/ItemRow.tsx`, `mobile/src/screens/today/SymbolLegend.tsx`

- [ ] **Step 1: `PostIt.tsx`** — 목업: 항목은 260ms 동안 오른쪽으로 48px 밀리며 사라지고, 마지막 항목이면 포스트잇 전체가 500ms 동안 떼어진다.

```tsx
import { useRef } from 'react';
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import type { Item } from '../../items/repo';
import { formatShortDate } from '../../lib/date';
import { confirmDelete } from '../../ui/dialogs';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useReduceMotion } from '../../ui/useReduceMotion';

export type SettleHow = 'today' | 'tomorrow' | 'delete';

type Props = {
  candidates: Item[];
  // 저장소 작업을 실행하고 성공 여부를 돌려준다(실패 문구는 화면이 보여준다).
  onSettle: (item: Item, how: SettleHow) => Promise<boolean>;
};

export function PostIt({ candidates, onSettle }: Props) {
  const reduce = useReduceMotion();
  const peel = useRef(new Animated.Value(0)).current;
  const leaving = useRef(new Set<string>()).current;

  const settle = async (item: Item, how: SettleHow, row: Animated.Value) => {
    if (leaving.has(item.id)) return;
    leaving.add(item.id);
    const last = candidates.filter((c) => !leaving.has(c.id)).length === 0;
    if (!reduce) {
      const anims = [
        Animated.timing(row, { toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ];
      if (last) anims.push(Animated.timing(peel, { toValue: 1, duration: 500, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }));
      await new Promise<void>((resolve) => Animated.parallel(anims).start(() => resolve()));
    }
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const ok = await onSettle(item, how);
    leaving.delete(item.id);
    if (!ok) {
      row.setValue(0);
      peel.setValue(0);
    }
  };

  const rotate = peel.interpolate({ inputRange: [0, 1], outputRange: ['-1deg', '8deg'] });
  const translateX = peel.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const translateY = peel.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const opacity = peel.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.note, { opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
      <Txt variant="hand" accessibilityRole="header" style={styles.title}>
        어제에서 넘어온 일이 있어요
      </Txt>
      {candidates.map((c) => (
        <CandidateRow key={c.id} item={c} onSettle={settle} />
      ))}
    </Animated.View>
  );
}

function CandidateRow({ item, onSettle }: { item: Item; onSettle: (item: Item, how: SettleHow, row: Animated.Value) => void }) {
  const row = useRef(new Animated.Value(0)).current;
  const translateX = row.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const opacity = row.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateX }] }]}>
      <Txt style={styles.text}>
        • {item.text} <Txt style={styles.from}>{formatShortDate(item.date)}</Txt>
      </Txt>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 오늘 하기`}
          style={styles.action}
          onPress={() => onSettle(item, 'today', row)}
        >
          <Txt variant="medium" style={styles.today}>
            오늘 하기
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 내일로`}
          style={styles.action}
          onPress={() => onSettle(item, 'tomorrow', row)}
        >
          <Txt style={styles.tomorrow}>내일로</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.text} 지우기`}
          style={styles.remove}
          onPress={() => confirmDelete('항목 지우기', `"${item.text}"을(를) 지울까요?`, () => onSettle(item, 'delete', row))}
        >
          <Txt style={styles.removeText}>×</Txt>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: colors.postit,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderRadius: 2,
    gap: 4,
    transformOrigin: 'top right',
    shadowColor: '#503C1E',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  title: { fontSize: 24, color: colors.ink },
  row: { paddingVertical: 6, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(42, 37, 32, 0.25)' },
  text: { fontSize: 15 },
  from: { fontSize: 12, color: colors.postitText },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  today: { fontSize: 14, color: colors.navy },
  tomorrow: { fontSize: 14, color: colors.inkSoft },
  remove: { marginLeft: 'auto', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 20, color: colors.postitText },
});
```

- [ ] **Step 2: `SymbolLegend.tsx`**

```tsx
import { Pressable, StyleSheet, View } from 'react-native';
import type { ItemKind } from '../../items/repo';
import { Highlight } from '../../ui/Highlight';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { LEGEND, type LegendEntry } from '../../ui/symbols';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

function Glyph({ symbol }: { symbol: LegendEntry['symbol'] }) {
  if (symbol === 'highlight') {
    return (
      <Highlight on>
        <Txt style={styles.hl}>가</Txt>
      </Highlight>
    );
  }
  if (symbol === 'more') return <Txt style={styles.more}>⋯</Txt>;
  return <StatusSymbol kind={symbol} />;
}

// (i) 팝오버 안의 기호 설명. 지금 고른 입력 종류는 형광펜으로 표시한다.
export function SymbolLegend({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  return (
    <View style={styles.box}>
      <Txt variant="hand">기호는 이렇게 읽어요</Txt>
      {LEGEND.map((g) => (
        <View key={g.name} style={[styles.row, g.kind === kind && styles.current]}>
          <View style={styles.glyph}>
            <Glyph symbol={g.symbol} />
          </View>
          <View style={styles.text}>
            <Txt variant="medium" style={styles.name}>
              {g.name}
            </Txt>
            <Txt style={styles.desc}>{g.desc}</Txt>
          </View>
        </View>
      ))}
      <Pressable accessibilityRole="button" style={styles.ok} onPress={onClose}>
        <Txt variant="medium" style={styles.okText}>
          알겠어요
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingTop: 10, paddingHorizontal: 12, gap: 2 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 6, borderRadius: 6 },
  current: { backgroundColor: colors.highlight },
  glyph: { width: 22, minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  hl: { fontSize: 14 },
  more: { fontSize: 18, color: colors.faint },
  text: { flex: 1 },
  name: { fontSize: 14 },
  desc: { fontSize: 13, color: colors.muted },
  ok: { alignSelf: 'flex-end', minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  okText: { fontSize: 14 },
});
```

- [ ] **Step 3: `ItemRow.tsx`**

```tsx
import { Pressable, StyleSheet, View } from 'react-native';
import type { Item } from '../../items/repo';
import { confirmDelete } from '../../ui/dialogs';
import { Highlight } from '../../ui/Highlight';
import { Popover, useAnchor } from '../../ui/Popover';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { canAdvance, itemA11yLabel, symbolKind } from '../../ui/symbols';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

type Props = {
  item: Item;
  priorityFull: boolean; // 오늘 중요 표시가 이미 3개
  onAdvance: () => void;
  onTogglePriority: () => void;
  onDelete: () => void;
};

export function ItemRow({ item, priorityFull, onAdvance, onTogglePriority, onDelete }: Props) {
  const menu = useAnchor();
  const kind = symbolKind(item);
  const advance = canAdvance(item);
  const markDisabled = !item.priority && priorityFull;
  const done = kind === 'done';

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.main}
        disabled={!advance}
        accessibilityRole={advance ? 'button' : 'text'}
        accessibilityLabel={itemA11yLabel(item)}
        onPress={onAdvance}
      >
        <View style={styles.symbol}>
          <StatusSymbol kind={kind} />
        </View>
        <Highlight on={item.priority && !done}>
          <Txt
            variant={kind === 'note' ? 'hand' : 'body'}
            style={[kind === 'note' ? styles.note : styles.text, done && styles.done]}
          >
            {item.text}
          </Txt>
        </Highlight>
      </Pressable>
      <Pressable
        ref={menu.ref}
        accessibilityRole="button"
        accessibilityLabel={`${item.text} 더보기`}
        accessibilityState={{ expanded: menu.anchor !== null }}
        style={styles.more}
        onPress={menu.open}
      >
        <Txt style={styles.moreText}>⋯</Txt>
      </Pressable>
      <Popover anchor={menu.anchor} align="right" width={220} label={`${item.text} 메뉴`} onClose={menu.close}>
        {item.kind === 'task' && (
          <Pressable
            accessibilityRole="menuitem"
            disabled={markDisabled}
            accessibilityState={{ disabled: markDisabled }}
            style={styles.menuItem}
            onPress={() => {
              menu.close();
              onTogglePriority();
            }}
          >
            <View style={styles.swatch} />
            <Txt style={[styles.menuText, markDisabled && styles.menuDisabled]}>
              {item.priority ? '형광펜 지우기' : markDisabled ? '중요는 하루 3개까지예요' : '형광펜 칠하기 (중요)'}
            </Txt>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="menuitem"
          style={styles.menuItem}
          onPress={() => {
            menu.close();
            confirmDelete('항목 지우기', `"${item.text}"을(를) 지울까요?`, onDelete);
          }}
        >
          <Txt style={[styles.menuText, styles.danger, styles.swatchText]}>×</Txt>
          <Txt style={[styles.menuText, styles.danger]}>지우기</Txt>
        </Pressable>
      </Popover>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  symbol: { width: 18, alignItems: 'center' },
  text: { fontSize: 16, flexShrink: 1 },
  note: { fontFamily: fonts.hand, fontSize: 22, flexShrink: 1 },
  done: { color: colors.faint, textDecorationLine: 'line-through' },
  more: { width: 44, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, color: colors.faint },
  menuItem: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 18, height: 8, backgroundColor: colors.highlight },
  swatchText: { width: 18, textAlign: 'center' },
  menuText: { fontSize: 14 },
  menuDisabled: { color: colors.faint },
  danger: { color: colors.danger },
});
```

- [ ] **Step 4: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/today
git commit -m "feat: 오늘 화면의 포스트잇, 한 줄, 기호 설명 조각" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 오늘 화면

**Files:**
- Replace: `mobile/src/screens/TodayScreen.tsx`
- Modify: `mobile/src/screens/Main.tsx` (`onOpenArchive` 연결)

- [ ] **Step 1: `TodayScreen.tsx`를 다음으로 교체**

```tsx
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Db } from '../db/types';
import {
  addItem,
  advanceStatus,
  deleteItem,
  type Item,
  type ItemKind,
  listItemsForDate,
  listMigrationCandidates,
  MAX_PRIORITY_PER_DAY,
  migrateToToday,
  migrateToTomorrow,
  setPriority,
} from '../items/repo';
import { formatLongDate, logicalDate } from '../lib/date';
import { countRecordedDays } from '../stats/recordedDays';
import { Popover, useAnchor } from '../ui/Popover';
import { colors, fonts, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { ItemRow } from './today/ItemRow';
import { PostIt, type SettleHow } from './today/PostIt';
import { SymbolLegend } from './today/SymbolLegend';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void; onOpenArchive: () => void };

const KINDS: { kind: ItemKind; symbol: string; label: string }[] = [
  { kind: 'task', symbol: '•', label: '할 일' },
  { kind: 'note', symbol: '–', label: '메모' },
];

export function TodayScreen({ db, version, onChanged, onOpenEvening, onOpenArchive }: Props) {
  const today = logicalDate(new Date());
  const [items, setItems] = useState<Item[]>([]);
  const [candidates, setCandidates] = useState<Item[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [kind, setKind] = useState<ItemKind>('task');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const info = useAnchor();

  useEffect(() => {
    let cancelled = false;
    Promise.all([listItemsForDate(db, today), listMigrationCandidates(db, today), countRecordedDays(db)])
      .then(([i, c, n]) => {
        if (cancelled) return;
        setItems(i);
        setCandidates(c);
        setRecordedDays(n);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  // 저장소 작업을 하나씩 실행하고, 실패하면 문구를 보여준다. 성공 여부를 돌려준다.
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
      setError(null);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const submit = () =>
    run(async () => {
      await addItem(db, { kind, text });
      setText('');
    });

  const settle = (item: Item, how: SettleHow) =>
    run(() =>
      how === 'today' ? migrateToToday(db, item.id) : how === 'tomorrow' ? migrateToTomorrow(db, item.id) : deleteItem(db, item.id),
    );

  const priorityCount = items.filter((i) => i.priority && (i.status === 'open' || i.status === 'doing')).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="title" accessibilityRole="header" style={styles.date}>
            {formatLongDate(today)}
          </Txt>
          <Txt variant="hand">기록한 날 {recordedDays}일째</Txt>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="지난 기록" style={styles.iconButton} onPress={onOpenArchive}>
            <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
              <Path d="M3 2.5h9.5a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2v-11Z" stroke={colors.ink} strokeWidth={1.3} strokeLinejoin="round" />
              <Path d="M3 13.5a2 2 0 0 1 2-2h9.5M6.5 6h5M6.5 8.5h3.5" stroke={colors.ink} strokeWidth={1.3} strokeLinecap="round" />
            </Svg>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.evening} onPress={onOpenEvening}>
            <Txt variant="medium" style={styles.eveningText}>
              저녁 마무리
            </Txt>
          </Pressable>
        </View>
      </View>

      {candidates.length > 0 && <PostIt candidates={candidates} onSettle={settle} />}

      <View style={styles.inputBlock}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            autoFocus
            placeholder="한 줄로 남기기"
            placeholderTextColor={colors.faint}
            accessibilityLabel="새 항목"
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            submitBehavior="submit"
            returnKeyType="done"
          />
        </View>
        <View style={styles.kindRow}>
          {KINDS.map((k) => {
            const selected = kind === k.kind;
            return (
              <Pressable
                key={k.kind}
                accessibilityRole="button"
                accessibilityLabel={k.label}
                accessibilityState={{ selected }}
                style={[styles.kind, selected && styles.kindSelected]}
                onPress={() => setKind(k.kind)}
              >
                <Txt style={styles.kindText}>
                  {k.symbol} {k.label}
                </Txt>
              </Pressable>
            );
          })}
          <Pressable
            ref={info.ref}
            accessibilityRole="button"
            accessibilityLabel="기호 설명"
            accessibilityState={{ expanded: info.anchor !== null }}
            style={styles.info}
            onPress={info.open}
          >
            <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
              <Circle cx={10} cy={10} r={8.2} stroke={colors.muted} strokeWidth={1.3} />
              <Path d="M10 9v5" stroke={colors.muted} strokeWidth={1.4} strokeLinecap="round" />
              <Circle cx={10} cy={6.2} r={1.1} fill={colors.muted} />
            </Svg>
          </Pressable>
        </View>
      </View>

      <Popover anchor={info.anchor} align="left" width={300} label="기호 설명" onClose={info.close}>
        <SymbolLegend kind={kind} onClose={info.close} />
      </Popover>

      {error && (
        <Txt style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Txt style={styles.empty}>아직 적은 줄이 없어요</Txt>}
        ListFooterComponent={
          <Txt variant="hand" style={styles.footer}>
            오늘도 한 줄씩.
          </Txt>
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            priorityFull={priorityCount >= MAX_PRIORITY_PER_DAY}
            onAdvance={() => run(() => advanceStatus(db, item.id))}
            onTogglePriority={() => run(() => setPriority(db, item.id, !item.priority))}
            onDelete={() => run(() => deleteItem(db, item.id))}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingTop: 16, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flexShrink: 1, gap: 2 },
  date: { fontSize: 30, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evening: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.ink,
    justifyContent: 'center',
  },
  eveningText: { fontSize: 14 },
  inputBlock: { gap: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.ink, paddingBottom: 4 },
  input: { flex: 1, height: 44, paddingHorizontal: 6, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  kindSelected: { backgroundColor: colors.chipSelected, borderColor: colors.ink },
  kindText: { fontSize: 14 },
  info: { width: 44, height: 44, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 14 },
  list: { flex: 1 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  footer: { alignSelf: 'center', marginTop: 24, marginBottom: 24, fontSize: 20, color: colors.muted },
});
```

- [ ] **Step 2: `Main.tsx`** — `TodayScreen`에 지난 기록 열기를 넘긴다. 이 Task 동안 버튼을 누르면 `screen`이 `'archive'`가 되어 빈 화면이 되므로, Task 11 전까지는 지난 기록 버튼을 누르지 않는다(뒤로 가기/다시 실행으로 돌아온다).

```tsx
            onOpenEvening={() => setScreen('evening')}
            onOpenArchive={() => setScreen('archive')}
```

- [ ] **Step 3: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/TodayScreen.tsx src/screens/Main.tsx
git commit -m "feat: 종이 다이어리 오늘 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 템플릿 만들기·고치기 시트

**Files:**
- Create: `mobile/src/screens/evening/TemplateSheet.tsx`

- [ ] **Step 1: `TemplateSheet.tsx`** — 목업 TemplateSheet(new/edit)

```tsx
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Db } from '../../db/types';
import { createTemplate, updateTemplate } from '../../reflections/templateRepo';
import { MAX_TEMPLATE_QUESTIONS, type TemplateDef } from '../../reflections/templates';
import { RuledPaper } from '../../ui/RuledPaper';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';

type Props = {
  db: Db;
  visible: boolean;
  editing: TemplateDef | null; // null이면 새 템플릿
  onClose: () => void;
  onSaved: (template: TemplateDef) => void;
  onDelete: (template: TemplateDef) => void;
};

const PLACEHOLDERS = ['예: 오늘 어떤 운동을 했나요?', '예: 몸과 마음은 어땠나요?', ''];

export function TemplateSheet({ db, visible, editing, onClose, onSaved, onDelete }: Props) {
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setQuestions(editing ? editing.questions.map((q) => q.text) : ['']);
    setError(null);
  }, [visible, editing]);

  const filled = questions.map((q) => q.trim()).filter(Boolean);
  const valid = name.trim().length > 0 && filled.length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const input = { name, questions };
      if (editing) {
        await updateTemplate(db, editing.id, input);
        onSaved({ ...editing, name: name.trim(), questions: filled.map((text, i) => ({ key: `q${i + 1}`, text })) });
      } else {
        onSaved(await createTemplate(db, input));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable accessibilityRole="button" style={styles.headerButton} onPress={onClose}>
              <Txt style={styles.headerText}>취소</Txt>
            </Pressable>
            <Txt variant="medium" accessibilityRole="header">
              {editing ? '템플릿 수정' : '새 템플릿'}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving }}
              disabled={!valid || saving}
              style={styles.headerButton}
              onPress={save}
            >
              <Txt variant="medium" style={[styles.headerText, { color: valid ? colors.navy : colors.faint }]}>
                저장
              </Txt>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>이름</Txt>
            <TextInput
              style={styles.name}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              placeholder="예: 운동한 날"
              placeholderTextColor={colors.faint}
              accessibilityLabel="템플릿 이름"
            />
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>질문 (최대 {MAX_TEMPLATE_QUESTIONS}개)</Txt>
            {questions.map((q, i) => (
              <View key={i} style={styles.question}>
                <Txt style={styles.no}>{i + 1}</Txt>
                <TextInput
                  style={styles.questionInput}
                  value={q}
                  onChangeText={(v) => {
                    setQuestions(questions.map((x, j) => (j === i ? v : x)));
                    setError(null);
                  }}
                  placeholder={PLACEHOLDERS[i]}
                  placeholderTextColor={colors.faint}
                  accessibilityLabel={`질문 ${i + 1}`}
                />
                {questions.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`질문 ${i + 1} 빼기`}
                    style={styles.removeQ}
                    onPress={() => setQuestions(questions.filter((_, j) => j !== i))}
                  >
                    <Txt style={styles.removeText}>×</Txt>
                  </Pressable>
                )}
              </View>
            ))}
            {questions.length < MAX_TEMPLATE_QUESTIONS && (
              <Pressable accessibilityRole="button" style={styles.add} onPress={() => setQuestions([...questions, ''])}>
                <Txt style={styles.addText}>+ 질문 추가</Txt>
              </Pressable>
            )}
          </View>

          <View style={styles.field}>
            <Txt style={styles.label}>미리보기</Txt>
            <RuledPaper style={styles.preview}>
              <Txt variant="hand" style={styles.previewName}>
                {name.trim() || '템플릿 이름'}
              </Txt>
              {(filled.length ? filled : ['질문을 적으면 여기에 보여요']).map((q, i) => (
                <Txt key={i} style={styles.previewQ}>
                  {q}
                </Txt>
              ))}
            </RuledPaper>
          </View>

          {error && (
            <Txt style={styles.error} accessibilityRole="alert">
              {error}
            </Txt>
          )}

          {editing ? (
            <Pressable accessibilityRole="button" style={styles.delete} onPress={() => onDelete(editing)}>
              <Txt style={styles.deleteText}>템플릿 삭제</Txt>
            </Pressable>
          ) : (
            <Txt style={styles.hint}>만든 템플릿은 저녁 마무리에서 길게 눌러 고치거나 지울 수 있어요.</Txt>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  sheet: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerButton: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  headerText: { fontSize: 15 },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.inkSoft },
  name: {
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    fontSize: 17,
    fontFamily: fonts.body,
    color: colors.ink,
    paddingHorizontal: 2,
  },
  question: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  no: { width: 18, fontSize: 13, color: colors.muted },
  questionInput: { flex: 1, height: 46, fontSize: 16, fontFamily: fonts.body, color: colors.ink },
  removeQ: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 18, color: colors.faint },
  add: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  addText: { fontSize: 14, color: colors.navy },
  preview: { paddingVertical: 0, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.lineFaint },
  previewName: { fontSize: 22, lineHeight: 32 },
  previewQ: { fontSize: 14, lineHeight: 32, color: colors.inkSoft },
  error: { color: colors.danger, fontSize: 14 },
  delete: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 15, color: colors.danger },
  hint: { marginTop: 12, fontSize: 12, color: colors.muted },
});
```

- [ ] **Step 2: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/screens/evening/TemplateSheet.tsx
git commit -m "feat: 템플릿 만들기·고치기 시트" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 저녁 마무리 화면

**Files:**
- Replace: `mobile/src/screens/EveningScreen.tsx`

- [ ] **Step 1: `EveningScreen.tsx`를 다음으로 교체**

```tsx
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { MOODS, moodWord } from '../days/moods';
import { getMood, setMood } from '../days/repo';
import type { Db } from '../db/types';
import { formatLongDate, logicalDate } from '../lib/date';
import { addReflection, listReflections, type Reflection } from '../reflections/repo';
import { deleteTemplate, listTemplates } from '../reflections/templateRepo';
import type { TemplateDef } from '../reflections/templates';
import { countRecordedDays } from '../stats/recordedDays';
import { confirmDelete, showActionSheet } from '../ui/dialogs';
import { Inkwell } from '../ui/Inkwell';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, fonts, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';
import { TemplateSheet } from './evening/TemplateSheet';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

export function EveningScreen({ db, version, onChanged, onClose }: Props) {
  const today = logicalDate(new Date());
  const [mood, setMoodState] = useState<number | null>(null);
  const [saved, setSaved] = useState<Reflection[]>([]);
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [recordedDays, setRecordedDays] = useState(0);
  const [template, setTemplate] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [sheet, setSheet] = useState<{ editing: TemplateDef | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    setTemplate(null);
    setAnswers({});
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMood(db, today), listReflections(db, today), listTemplates(db), countRecordedDays(db)])
      .then(([m, r, t, n]) => {
        if (cancelled) return;
        setMoodState(m);
        setSaved(r);
        setTemplates(t);
        setRecordedDays(n);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, today, version]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await action();
      setError(null);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const pickMood = (value: number) => run(() => setMood(db, today, mood === value ? null : value));

  const save = () =>
    run(async () => {
      if (!template) return;
      await addReflection(db, { templateId: template, answers: answers[template] ?? {} });
      setTemplate(null);
      setAnswers((prev) => ({ ...prev, [template]: {} }));
    });

  const askDelete = (t: TemplateDef) =>
    confirmDelete(`‘${t.name}’ 템플릿을 지울까요?`, '이미 쓴 회고는 그대로 남아요. 앞으로 저녁 마무리에서만 안 보여요.', () =>
      run(async () => {
        await deleteTemplate(db, t.id);
        setSheet(null);
        if (template === t.id) setTemplate(null);
      }),
    );

  const templateActions = (t: TemplateDef) =>
    showActionSheet(`‘${t.name}’ 템플릿`, [
      { label: '수정하기', onPress: () => setSheet({ editing: t }) },
      { label: '삭제하기', destructive: true, onPress: () => askDelete(t) },
    ]);

  const current = templates.find((t) => t.id === template);
  const hasCustom = templates.some((t) => !t.builtin);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Txt variant="title" accessibilityRole="header" style={styles.title}>
              오늘을 덮으며
            </Txt>
            <Txt style={styles.sub}>{formatLongDate(today)}</Txt>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="저녁 마무리 닫기" style={styles.close} onPress={onClose}>
            <Txt style={styles.closeText}>닫기</Txt>
          </Pressable>
        </View>

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
                  accessibilityRole="button"
                  accessibilityLabel={`기분 ${m}점, ${moodWord(m)}`}
                  accessibilityState={{ selected }}
                  style={styles.mood}
                  onPress={() => pickMood(m)}
                >
                  <View style={!selected && styles.dim}>
                    <Inkwell id={`well${m}`} mood={m} size="large" selected={selected} />
                  </View>
                  <Txt
                    variant={selected ? 'medium' : 'body'}
                    style={[styles.moodWord, selected ? styles.moodWordOn : styles.moodWordOff]}
                  >
                    {moodWord(m)}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="medium" style={styles.question}>
            오늘은 어떤 날이었나요? (건너뛰어도 괜찮아요)
          </Txt>
          <View style={styles.chips}>
            {templates.map((t) => {
              const selected = template === t.id;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityHint={t.builtin ? undefined : '길게 누르면 고치거나 지울 수 있어요'}
                  style={[styles.chip, selected && styles.chipOn]}
                  onPress={() => setTemplate(selected ? null : t.id)}
                  onLongPress={t.builtin ? undefined : () => templateActions(t)}
                >
                  <Txt variant={selected ? 'medium' : 'body'} style={styles.chipText}>
                    {t.name}
                  </Txt>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" style={styles.newChip} onPress={() => setSheet({ editing: null })}>
              <Txt style={styles.newChipText}>+ 새 템플릿</Txt>
            </Pressable>
          </View>
          {hasCustom && <Txt style={styles.hint}>내가 만든 템플릿은 길게 눌러 고치거나 지울 수 있어요</Txt>}
        </View>

        {current && (
          <View>
            <View accessible={false} style={styles.tape} />
            <RuledPaper style={styles.form}>
              {current.questions.map((q) => (
                <View key={q.key}>
                  <Txt variant="hand" style={styles.formQ} accessible={false} importantForAccessibility="no">
                    {q.text}
                  </Txt>
                  <TextInput
                    style={styles.answer}
                    multiline
                    accessibilityLabel={q.text}
                    value={answers[current.id]?.[q.key] ?? ''}
                    onChangeText={(v) =>
                      setAnswers((prev) => ({ ...prev, [current.id]: { ...prev[current.id], [q.key]: v } }))
                    }
                  />
                </View>
              ))}
              <Pressable accessibilityRole="button" style={styles.save} onPress={save}>
                <Txt variant="medium" style={styles.saveText}>
                  남겨두기
                </Txt>
              </Pressable>
            </RuledPaper>
          </View>
        )}

        {error && (
          <Txt style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        )}

        {saved.length > 0 && (
          <View style={styles.section}>
            <Txt variant="medium" style={styles.question}>
              오늘 남긴 회고
            </Txt>
            {saved.map((r) => (
              <RuledPaper key={r.id} style={styles.savedCard}>
                <Txt variant="hand" style={styles.formQ}>
                  {r.templateName}
                </Txt>
                {r.questions
                  .filter((q) => r.answers[q.key])
                  .map((q) => (
                    <Txt key={q.key} style={styles.savedAnswer} accessibilityLabel={`${q.text} ${r.answers[q.key]}`}>
                      {r.answers[q.key]}
                    </Txt>
                  ))}
              </RuledPaper>
            ))}
          </View>
        )}

        <View style={styles.stampBox}>
          <View accessible={false} style={styles.stamp}>
            <Txt variant="title" style={styles.stampText}>
              {recordedDays}일
            </Txt>
          </View>
          <Txt style={styles.stampCopy}>오늘도 한 장을 채웠어요. 내일 아침에 이어서 적어요.</Txt>
        </View>
      </ScrollView>

      <TemplateSheet
        db={db}
        visible={sheet !== null}
        editing={sheet?.editing ?? null}
        onClose={() => setSheet(null)}
        onSaved={(t) => {
          setSheet(null);
          setTemplate(t.id);
          onChanged();
        }}
        onDelete={askDelete}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paperEvening },
  container: { paddingHorizontal: SCREEN_X, paddingTop: 16, paddingBottom: 24, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 28 },
  sub: { fontSize: 14, color: colors.muted },
  close: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  closeText: { fontSize: 15 },
  section: { gap: 10 },
  h2: { fontSize: 26 },
  moods: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { minWidth: 60, padding: 4, alignItems: 'center', gap: 6 },
  dim: { opacity: 0.55 },
  moodWord: { fontSize: 13, paddingBottom: 2, borderBottomWidth: 2 },
  moodWordOn: { borderBottomColor: colors.navy },
  moodWordOff: { color: colors.inkSoft, borderBottomColor: 'transparent' },
  question: { fontSize: 14, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CFC3AE',
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.highlight, borderColor: colors.ink },
  chipText: { fontSize: 14 },
  newChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.faint,
    justifyContent: 'center',
  },
  newChipText: { fontSize: 14, color: colors.inkSoft },
  hint: { fontSize: 12, color: colors.muted },
  tape: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 88,
    height: 22,
    zIndex: 1,
    backgroundColor: 'rgba(30, 47, 77, 0.22)',
    transform: [{ rotate: '-2deg' }],
  },
  form: { paddingTop: 22, paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  formQ: { fontSize: 23, lineHeight: 32 },
  answer: { minHeight: 64, fontSize: 15, lineHeight: 32, fontFamily: fonts.body, color: colors.ink, padding: 0, textAlignVertical: 'top' },
  save: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  saveText: { color: colors.card, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14 },
  savedCard: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint },
  savedAnswer: { fontSize: 14, lineHeight: 32 },
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
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  stampText: { fontSize: 13, color: colors.navy },
  stampCopy: { flex: 1, fontSize: 14, color: colors.inkSoft },
});
```

- [ ] **Step 2: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/screens/EveningScreen.tsx
git commit -m "feat: 잉크병 기분과 줄 노트 회고의 저녁 마무리 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 지난 기록 화면

**Files:**
- Create: `mobile/src/screens/ArchiveScreen.tsx`
- Modify: `mobile/src/screens/Main.tsx` (`ArchiveScreen` 연결)

- [ ] **Step 1: `ArchiveScreen.tsx`** (목업 Archive. 월간 회고 배너는 계획 C)

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { reflectionFilters } from '../archive/filters';
import { type DaySummary, listMonthSummary } from '../archive/repo';
import { moodWord } from '../days/moods';
import type { Db } from '../db/types';
import { monthGrid } from '../lib/calendar';
import { addMonths, formatLongDate, formatMonth, logicalDate, monthOf } from '../lib/date';
import { listReflectionHistory, listReflections, type Reflection, type ReflectionEntry } from '../reflections/repo';
import { Inkwell } from '../ui/Inkwell';
import { RuledPaper } from '../ui/RuledPaper';
import { colors, SCREEN_X } from '../ui/theme';
import { Txt } from '../ui/Txt';

type Props = { db: Db; version: number; onClose: () => void };
type Tab = 'calendar' | 'collection';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function answersOf(r: Reflection): string[] {
  return r.questions.map((q) => r.answers[q.key]).filter((a): a is string => !!a);
}

export function ArchiveScreen({ db, version, onClose }: Props) {
  const today = logicalDate(new Date());
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [dayReflections, setDayReflections] = useState<Reflection[]>([]);
  const [history, setHistory] = useState<ReflectionEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMonthSummary(db, month)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, month, version]);

  useEffect(() => {
    let cancelled = false;
    listReflections(db, selected)
      .then((r) => !cancelled && setDayReflections(r))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, selected, version]);

  useEffect(() => {
    if (tab !== 'collection') return;
    let cancelled = false;
    listReflectionHistory(db)
      .then((h) => !cancelled && setHistory(h))
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [db, tab, version]);

  const byDate = useMemo(() => new Map(summary.map((s) => [s.date, s])), [summary]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const day = byDate.get(selected);
  const filters = useMemo(() => reflectionFilters(history), [history]);
  const entries = filter ? history.filter((h) => h.template === filter) : history;
  const filterName = filters.find((f) => f.id === filter)?.name;
  const isCurrentMonth = month >= monthOf(today);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" style={styles.back} onPress={onClose}>
          <Txt style={styles.backText}>오늘로</Txt>
        </Pressable>
        <Txt variant="title" accessibilityRole="header" style={styles.title}>
          지난 기록
        </Txt>
        <View style={styles.backSpacer} />
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {(
          [
            ['calendar', '달력'],
            ['collection', '회고 모아보기'],
          ] as const
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setTab(key)}
            >
              <Txt variant={on ? 'medium' : 'body'} style={[styles.tabText, !on && styles.tabTextOff]}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {error && <Txt style={styles.error}>{error}</Txt>}

      {tab === 'calendar' && (
        <>
          <View style={styles.monthRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" style={styles.arrow} onPress={() => setMonth(addMonths(month, -1))}>
              <Txt style={styles.arrowText}>‹</Txt>
            </Pressable>
            <Txt variant="title" style={styles.monthText}>
              {formatMonth(month)}
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 달"
              accessibilityState={{ disabled: isCurrentMonth }}
              disabled={isCurrentMonth}
              style={styles.arrow}
              onPress={() => setMonth(addMonths(month, 1))}
            >
              <Txt style={[styles.arrowText, isCurrentMonth && styles.arrowOff]}>›</Txt>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((w) => (
              <Txt key={w} style={[styles.cell, styles.weekday]}>
                {w}
              </Txt>
            ))}
            {cells.map((date, i) => {
              if (!date) return <View key={`b${i}`} style={styles.cell} />;
              const s = byDate.get(date);
              const future = date > today;
              const on = date === selected;
              const word = moodWord(s?.mood ?? null);
              const d = Number(date.slice(8));
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${Number(date.slice(5, 7))}월 ${d}일${word ? `, 기분 ${word}` : ''}${s?.hasReflection ? ', 회고 있음' : ''}`}
                  accessibilityState={{ selected: on, disabled: future }}
                  disabled={future}
                  style={[styles.cell, styles.dayCell, on && styles.dayOn]}
                  onPress={() => setSelected(date)}
                >
                  <Txt
                    variant={date === today ? 'medium' : 'body'}
                    style={[styles.dayNum, date === today && styles.today, future && styles.future]}
                  >
                    {d}
                  </Txt>
                  {!future && (
                    <View style={{ opacity: s?.mood ? 1 : 0.35 }}>
                      <Inkwell id={`cal${date}`} mood={s?.mood ?? null} size="small" />
                    </View>
                  )}
                  <View style={[styles.dot, s?.hasReflection && styles.dotOn]} />
                </Pressable>
              );
            })}
          </View>
          <Txt style={styles.legend}>잉크가 찰수록 좋았던 날. 아래 점은 회고를 남긴 날이에요.</Txt>

          <View style={styles.detail}>
            <View style={styles.detailHead}>
              <Txt variant="title" style={styles.detailTitle}>
                {formatLongDate(selected)}
              </Txt>
              <Txt style={styles.small}>{day?.mood ? `기분 · ${moodWord(day.mood)}` : '기분 기록 없음'}</Txt>
            </View>
            <Txt style={styles.small}>
              {day ? `할 일 ${day.tasksTotal}개 중 ${day.tasksDone}개 끝냄` : '기록이 없는 날이에요'}
            </Txt>
            {dayReflections.length === 0 ? (
              <Txt style={styles.muted}>이 날은 회고를 남기지 않았어요. 괜찮아요.</Txt>
            ) : (
              dayReflections.map((r) => (
                <RuledPaper key={r.id} lineHeight={30} style={styles.card}>
                  <Txt variant="hand" style={styles.cardTitle}>
                    {r.templateName}
                  </Txt>
                  {answersOf(r).map((a, i) => (
                    <Txt key={i} style={styles.cardLine}>
                      {a}
                    </Txt>
                  ))}
                </RuledPaper>
              ))
            )}
          </View>
        </>
      )}

      {tab === 'collection' && (
        <>
          <View style={styles.filters}>
            {[{ id: null, name: '전체' }, ...filters].map((f) => {
              const on = filter === f.id;
              return (
                <Pressable
                  key={f.id ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.filter, on && styles.filterOn]}
                  onPress={() => setFilter(f.id)}
                >
                  <Txt style={styles.filterText}>{f.name}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt style={styles.small}>
            {filter ? `${filterName} ${entries.length}번` : history.length ? `회고 ${history.length}개` : '아직 남긴 회고가 없어요'}
          </Txt>
          {entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={styles.entryHead}>
                <Txt variant="hand" style={styles.entryTitle}>
                  {e.templateName}
                </Txt>
                <Txt style={styles.entryMeta}>
                  {formatLongDate(e.date)} · 기분 {moodWord(e.mood) ?? '-'}
                </Txt>
              </View>
              {answersOf(e).map((a, i) => (
                <Txt key={i} style={styles.entryLine}>
                  {a}
                </Txt>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: SCREEN_X - 2, paddingTop: 8, paddingBottom: 24, gap: 14 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  backText: { fontSize: 15 },
  backSpacer: { width: 48 },
  title: { fontSize: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.navy },
  tabText: { fontSize: 15 },
  tabTextOff: { color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18, color: colors.muted },
  arrowOff: { color: colors.lineSoft },
  monthText: { fontSize: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  weekday: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingBottom: 4 },
  dayCell: { minHeight: 52, paddingVertical: 4, borderRadius: 8, gap: 2 },
  dayOn: { backgroundColor: colors.chipSelected },
  dayNum: { fontSize: 13 },
  today: { color: colors.navy, textDecorationLine: 'underline' },
  future: { color: colors.line },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotOn: { backgroundColor: colors.navy },
  legend: { fontSize: 12, color: colors.muted },
  detail: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.line },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  detailTitle: { fontSize: 20 },
  small: { fontSize: 13, color: colors.inkSoft },
  muted: { fontSize: 14, color: colors.muted },
  card: { paddingHorizontal: 14, paddingVertical: 0, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4 },
  cardTitle: { fontSize: 21, lineHeight: 30 },
  cardLine: { fontSize: 14, lineHeight: 30 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1, borderColor: '#CFC3AE', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.highlight, borderColor: colors.ink },
  filterText: { fontSize: 13 },
  entry: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 4, padding: 12, gap: 6 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryTitle: { fontSize: 20, flexShrink: 1 },
  entryMeta: { fontSize: 12, color: colors.muted },
  entryLine: { fontSize: 14, lineHeight: 22 },
});
```

필터 칩은 목업(36px)보다 크게 44px로 둔다(터치 크기 규칙).

- [ ] **Step 2: `Main.tsx`** — `import { ArchiveScreen } from './ArchiveScreen';`를 추가하고, 저녁 마무리 분기 아래에 넣는다.

```tsx
        {screen === 'archive' && <ArchiveScreen db={db} version={version} onClose={() => setScreen('today')} />}
```

- [ ] **Step 3: 확인** — `npx jest && npm run typecheck` 통과, export 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/ArchiveScreen.tsx src/screens/Main.tsx
git commit -m "feat: 잉크병 달력과 회고 모아보기의 지난 기록 화면" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 스펙 기록과 시뮬레이터 확인

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-daily-log-app-design.md` (11절)

- [ ] **Step 1: 스펙 11.2의 입력 줄 문장을 실제와 맞춘다** — "아래 줄에 종류 칩(• 할 일 / ○ 일정 / – 메모)과 (i)"를 "아래 줄에 종류 칩(• 할 일 / – 메모)과 (i). 말로 적기 버튼은 계획 D에서 붙인다"로 바꾼다.

- [ ] **Step 2: 11.4 끝에 한 줄 추가** — "- 화면 전환은 Main의 상태로 한다(오늘 ↔ 저녁 마무리 ↔ 지난 기록). 템플릿 시트는 iOS 기본 시트, 템플릿 길게 누르기는 기본 액션 시트."

- [ ] **Step 3: 시뮬레이터 확인** (사람 또는 리뷰어가 실행) — `npx expo start --ios`

  1. 로그인 화면이 표지 그림과 "노트 펼치기"로 보인다.
  2. 처음 로그인하면 표지가 펼쳐지고 온보딩 4단계가 나온다. "시작하기"에서 작은 표지가 넘어간다. 건너뛰기/첫 줄 쓰기 후 다시 실행하면 온보딩이 나오지 않는다.
  3. 오늘: 날짜 제목(Gowun Batang), "기록한 날 N일째"(손글씨). 할 일을 적고 기호를 탭하면 • → ◐ → ●✓(취소선) → •.
  4. ⋯ → 형광펜 칠하기: 노란 띠가 생기고 위로 올라간다. 4번째는 "중요는 하루 3개까지예요"로 막힌다. ⋯ → 지우기는 확인 창을 거친다.
  5. (i)를 누르면 기호 설명이 뜨고, 고른 종류 줄이 노랗다.
  6. 지난 날짜 할 일이 있으면 포스트잇이 보인다. 오늘 하기/내일로/× 하나씩 밀려 사라지고 마지막에 포스트잇이 떼어진다.
  7. 저녁 마무리: 잉크병 5개, 고른 병에 깃펜. 템플릿 고르기 → 줄 노트 → 남겨두기. "+ 새 템플릿" 시트에서 만들면 그 템플릿이 선택된다. 내 템플릿 칩을 길게 누르면 수정하기/삭제하기.
  8. 닫기: 표지가 덮이고 "오늘도 수고했어요", "내일 다시 펼치기"를 누르면 다시 펼쳐진다.
  9. 지난 기록: 달력 잉크병과 회고 점, 날짜를 고르면 아래에 요약. 회고 모아보기 필터.
  10. 설정 → 손쉬운 사용 → 동작 줄이기를 켜면 표지와 포스트잇 애니메이션 없이 바로 바뀐다.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-10-06-daily-log-app-design.md
git commit -m "docs: 종이 다이어리 UI 적용 결정 기록" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
