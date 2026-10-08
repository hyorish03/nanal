# 나날 말로 적기와 위젯 구현 계획 (계획 D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개발용 빌드로 옮겨 기기 음성 인식으로 말한 내용을 계획 C의 "정리해서 넣기"에 넘기고, 잠금화면·홈 화면 위젯과 컨트롤에서 오늘 할 일을 보고 상태를 바꾸게 한다.

**Architecture:** Expo Go 대신 `expo-dev-client` 개발용 빌드를 쓰고, `ios/`는 지금처럼 만들어 쓰고 버린다(CNG, `npx expo prebuild`). 음성 인식은 `expo-speech-recognition`(기기 인식 우선, 음성 파일 저장 안 함)으로 받아 적고, 순수 상태 기계(`src/voice/machine.ts`)가 녹음 → 받아 적기 → 정리 흐름을 정한다. 위젯은 `@bacons/apple-targets`가 `mobile/targets/widget`의 Swift 파일을 Xcode 타깃으로 붙인다. 앱 SQLite 파일을 App Group 공유 폴더로 한 번 옮기고(복사 → 검증 → 이름 바꾸기, 원본은 남김), 위젯은 같은 파일을 SQLite3 C API로 읽고 쓴다. 위젯이 쓰는 SQL은 `src/widget/sql.ts`에 한 번 적고 Swift(`targets/widget/SharedSQL.swift`)에 똑같이 옮긴 뒤, jest가 두 파일의 SQL이 같은지와 그 SQL이 앱의 `advanceStatus`와 같은 결과를 내는지 확인한다. 위젯에서 바꾼 항목은 outbox에도 기록되고, 동기화는 앱이 열릴 때 기존 엔진이 한다.

**Tech Stack:** Expo SDK 57 / RN 0.86, `expo-dev-client@57.0.19`, `expo-speech-recognition@57.1.0`, `@bacons/apple-targets@5.0.0`, `expo-file-system@57.0.7`(`Paths.appleSharedContainers`), `expo-sqlite@57.0.4`(`openDatabaseAsync` directory 인자, `backupDatabaseAsync`), SwiftUI·WidgetKit·AppIntents, Xcode 27.0, Jest

**Spec:** `docs/superpowers/specs/2026-10-06-daily-log-app-design.md` 11.5(말로 적기), 11.6(위젯). 목업: Voice, LockScreen, HomeWidgets, HomeWidgetLarge 보드.

**공통 규칙**
- 앱 명령은 `mobile/`에서 실행한다. 모든 커밋은 `git commit -m "<메시지>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` 형식. push 하지 않는다.
- 앱 DB 규칙: 쿼리 메서드는 params 배열이 필수(`[]`). 트랜잭션 안에서는 `tx`만 쓴다. 테스트하는 순수 함수 파일은 `react-native`, `expo-*`를 import하지 않는다.
- 화면 확인: `npx jest && npm run typecheck`, 그리고 `EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"`(결과물은 커밋하지 않는다). RN 0.86에는 `StyleSheet.absoluteFillObject`가 없다.
- 네이티브 빌드: `npx expo prebuild --platform ios --clean` 뒤 `npx expo run:ios --device "iPhone 16 Pro" --no-bundler`(시뮬레이터, 5~15분). 번들러는 따로 `npx expo start --dev-client --port 8081`. 8081을 다른 Expo 서버가 쓰고 있으면 그 서버를 끄라고 보고하거나 `--port 8082`를 쓴다. 시뮬레이터 확인은 `xcrun simctl io booted screenshot <경로>`.
- `ios/`는 커밋하지 않는다(이미 `.gitignore`). Xcode에서 손으로 바꾼 설정은 다음 prebuild에서 사라지니, 설정은 `app.json`과 `targets/widget/expo-target.config.js`에만 둔다.
- 운영 Supabase에 닿는 명령은 이 계획에 없다. 음성 파일은 어디에도 저장하지 않는다(`recordingOptions.persist: false`). 받아 적은 글을 로그에 남기지 않는다.

**결정 사항 (사용자 확인 대상)**
1. **Apple 개발자 계정:** 시뮬레이터에서는 계정 없이 끝까지 만든다. 실제 아이폰에 위젯까지 넣으려면 App Groups 권한이 필요하고, 이 권한은 유료 Apple Developer Program($99/년)에서만 쓸 수 있다(무료 개인 팀은 안 됨). 기기 설치 단계(Task 11 끝)는 계정이 준비된 뒤로 미룬다.
2. **번들 ID와 App Group:** 앱 `com.hyorish03.nanal`, 위젯 `com.hyorish03.nanal.widget`, App Group `group.com.hyorish03.nanal`. 한 번 출시하면 바꾸기 어렵다.
3. **`ios/`를 만들어 쓰고 버리기(CNG):** 위젯 타깃(`@bacons/apple-targets`), 권한 문구(`expo-speech-recognition` 플러그인), App Group(`ios.entitlements`), URL scheme(`scheme`)이 모두 설정 파일로 표현되므로 `ios/`를 커밋할 이유가 없다.
4. **음성 인식:** `expo-speech-recognition@57.1.0`(SDK 57과 같은 주 버전, 플러그인으로 권한 문구 설정). 한국어(`ko-KR`), 계속 듣기, 중간 결과 표시, 문장부호 추가. 기기 인식을 지원하면(`supportsOnDeviceRecognition()`) 기기 인식만 쓴다. 지원하지 않으면 Apple 서버 인식으로 넘어간다(이때 인터넷 필요). 음성 파일은 저장하지 않는다.
5. **마이크와 연필:** 음성 인식 모듈이 있는 빌드(개발용·출시 빌드)에서는 입력줄의 연필 자리에 마이크를 둔다. Expo Go에서는 지금처럼 연필이다. 권한이 거절되면 말로 적기 시트가 "글로 적기" 버튼을 보여 주고 연필과 같은 "정리해서 넣기"를 연다.
6. **위젯 탭 규칙:** 위젯의 상태 버튼은 앱의 기호 탭과 같이 한 단계씩 바꾼다(• → ◐ → ●✓ → •). 잠금화면 목업은 "완료" 버튼이지만, 규칙을 하나로 맞추려고 두 번 누르면 완료가 되게 한다. 버튼 아래 안내는 "눌러서 진행 중으로" / "눌러서 완료".
7. **다음 할 일:** 진행 중 → 형광펜(중요) → 오늘 목록 순서. 밀린 일은 개수로만 보여준다. 정렬은 SQL 한 곳(`WIDGET_SQL.items`)에서 정하고 앱 목록 정렬(`items/repo.ts`의 ORDER)과 같다.
8. **위젯 새로 고침:** 앱이 화면을 다시 그릴 때(`refresh`)마다 `ExtensionStorage.reloadWidget()`(@bacons/apple-targets)을 부른다. 앱이 앞에 있을 때 부르는 새로 고침은 WidgetKit 하루 예산을 쓰지 않는다. 위젯 스스로는 30분마다, 그리고 새벽 4시 경계에 새로 고친다.
9. **위젯에서 바꾼 기록의 동기화:** 위젯은 outbox에만 남기고 네트워크를 쓰지 않는다. 앱이 앞으로 오면 기존 동기화가 올린다.
10. **DB 옮기기 안전장치:** 공유 폴더에 `daily-log.db.part`로 복사(`backupDatabaseAsync`) → 모든 표의 행 수와 `user_version`이 같은지 확인 → `daily-log.db`로 이름 바꾸기. 원래 파일은 지우지 않고 그대로 둔다(나중에 지울지 정한다). 공유 폴더를 못 얻으면(Expo Go, 권한 없는 빌드) 원래 자리를 계속 쓰고, 위젯은 "앱을 한 번 열어 주세요"를 보여준다.
11. **컨트롤(iOS 18):** "말로 적기"(`nanal://voice`), "한 줄 적기"(`nanal://today?focus=1`) 두 개. 위젯 안 글 입력과 녹음은 iOS에서 안 되므로 앱을 연다.
12. **알려진 위험:** 계정 없는 시뮬레이터 빌드에서 App Group 권한이 서명에 들어가는지는 Task 6에서 확인한다. 들어가지 않으면(공유 폴더가 `undefined`) 앱은 원래 자리 DB로 계속 동작하고, 위젯 확인은 계정이 생긴 뒤로 미룬다. 이 경우 보고만 하고 우회 서명 설정을 만들지 않는다.

---

## 파일 구조

| 파일 | 변경 | 책임 |
|---|---|---|
| `mobile/app.json` | 수정 | 번들 ID, `scheme: nanal`, App Group, 플러그인(음성 인식, apple-targets) |
| `mobile/package.json` | 수정 | 의존성, `ios:dev`, `start:dev` 스크립트 |
| `mobile/src/lib/deepLink.ts` (+test) | 신규 | `nanal://voice`, `nanal://today?focus=1` 해석 (순수) |
| `mobile/src/voice/machine.ts` (+test) | 신규 | 녹음 상태 기계 (순수) |
| `mobile/src/voice/errors.ts` (+test) | 신규 | 음성 인식 오류 → 한국어 문구 (순수) |
| `mobile/src/voice/available.ts` | 신규 | 음성 인식 네이티브 모듈이 있는지 |
| `mobile/src/screens/today/VoiceSheet.tsx` | 신규 | 말로 적기 시트 |
| `mobile/src/screens/today/OrganizeSheet.tsx` | 수정 | 받아 적은 글로 바로 정리(`autoOrganize`) |
| `mobile/src/screens/TodayScreen.tsx` | 수정 | 마이크/연필, 링크로 온 동작 처리 |
| `mobile/src/screens/Main.tsx` | 수정 | 딥 링크, 위젯 새로 고침 |
| `mobile/src/widget/sql.ts` (+test) | 신규 | 위젯과 같이 쓰는 SQL, 그 SQL의 TS 실행본 |
| `mobile/src/widget/swiftParity.test.ts` | 신규 | Swift SQL·상수가 TS와 같은지 |
| `mobile/src/widget/reload.ts` | 신규 | 위젯 새로 고침(모듈 없으면 무시) |
| `mobile/src/stats/recordedDays.ts` | 수정 | 기록한 날 SQL을 `WIDGET_SQL`에서 가져온다 |
| `mobile/src/db/location.ts` (+test) | 신규 | DB 위치 결정, 경로 변환, 복사 검증 (순수 + Db) |
| `mobile/src/db/client.ts` | 수정 | 공유 폴더로 옮기기, WAL |
| `mobile/targets/widget/expo-target.config.js` | 신규 | 위젯 타깃 설정 |
| `mobile/targets/widget/SharedSQL.swift` | 신규 | `sql.ts`와 같은 SQL |
| `mobile/targets/widget/NanalDB.swift` | 신규 | 공유 DB 열기, 읽기, 상태 바꾸기 |
| `mobile/targets/widget/LogicalDate.swift` | 신규 | 새벽 4시 경계 날짜, 새로 고침 시각 |
| `mobile/targets/widget/Intents.swift` | 신규 | 상태 바꾸기, 앱 열기 AppIntent |
| `mobile/targets/widget/Views.swift` | 신규 | 위젯 화면 |
| `mobile/targets/widget/Widgets.swift` | 신규 | 위젯 정의, 번들 |
| `mobile/targets/widget/Controls.swift` | 신규 | iOS 18 컨트롤 |
| `docs/superpowers/specs/2026-10-06-daily-log-app-design.md`, `docs/TODO.md` | 수정 | 결정 기록 |

---

### Task 1: 개발용 빌드 준비

**Files:**
- Modify: `mobile/app.json`, `mobile/package.json`(`npx expo install`이 lock 파일도 바꾼다)

- [ ] **Step 1: 설치**

```bash
cd mobile && npx expo install expo-dev-client
```

Expected: `package.json` dependencies에 `"expo-dev-client": "~57.0.19"`.

- [ ] **Step 2: `app.json`에 번들 ID와 URL scheme**

`expo` 객체에 `"scheme": "nanal"`을 넣고, `ios`를 아래처럼 바꾼다(다른 키는 그대로).

```json
    "scheme": "nanal",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.hyorish03.nanal"
    },
```

- [ ] **Step 3: 스크립트**

`package.json`의 `scripts`에 두 줄을 더한다.

```json
    "ios:dev": "expo run:ios --device \"iPhone 16 Pro\"",
    "start:dev": "expo start --dev-client",
```

- [ ] **Step 4: 시뮬레이터 빌드**

```bash
cd mobile && npx expo prebuild --platform ios --clean
npx expo run:ios --device "iPhone 16 Pro" --no-bundler
```

Expected: `Build Succeeded`, 시뮬레이터에 "나날" 앱이 설치된다. `ios/`가 생기지만 `.gitignore`에 있어 `git status`에 보이지 않는다.

- [ ] **Step 5: 번들러를 띄우고 앱 열기**

```bash
npx expo start --dev-client --port 8081   # run_in_background
xcrun simctl openurl booted "nanal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
xcrun simctl io booted screenshot "$TMPDIR/nanal-dev.png"
```

Expected: 개발용 빌드에서 오늘 화면(또는 로그인·온보딩)이 빨간 오류 화면 없이 뜬다. 확인 뒤 번들러는 끈다.

- [ ] **Step 6: 확인과 커밋**

```bash
npx jest && npm run typecheck
git add app.json package.json package-lock.json
git commit -m "chore: 개발용 빌드와 번들 ID, nanal URL scheme" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 딥 링크 (`nanal://voice`, `nanal://today`)

위젯·컨트롤이 앱을 열 때 쓰는 주소를 해석하고, 오늘 화면에서 해당 동작을 한다. 말로 적기 시트는 Task 4에서 붙이므로 이 Task에서 `voice`는 "정리해서 넣기" 시트를 연다.

**Files:**
- Create: `mobile/src/lib/deepLink.ts`, `mobile/src/lib/deepLink.test.ts`
- Modify: `mobile/src/screens/Main.tsx`, `mobile/src/screens/TodayScreen.tsx`

- [ ] **Step 1: 실패하는 테스트**

`mobile/src/lib/deepLink.test.ts`:

```ts
import { parseDeepLink } from './deepLink';

describe('parseDeepLink', () => {
  it('말로 적기를 연다', () => {
    expect(parseDeepLink('nanal://voice')).toEqual({ action: 'voice' });
    expect(parseDeepLink('nanal://voice/')).toEqual({ action: 'voice' });
  });

  it('오늘 화면을 열고, focus=1이면 입력칸에 포커스한다', () => {
    expect(parseDeepLink('nanal://today')).toEqual({ action: null });
    expect(parseDeepLink('nanal://today?focus=1')).toEqual({ action: 'focus' });
    expect(parseDeepLink('nanal://today?focus=0')).toEqual({ action: null });
  });

  it('모르는 주소와 개발용 빌드 주소는 무시한다', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('https://example.com/voice')).toBeNull();
    expect(parseDeepLink('nanal://settings')).toBeNull();
    expect(parseDeepLink('nanal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/lib/deepLink.test.ts` → FAIL (`Cannot find module './deepLink'`)

- [ ] **Step 3: 구현**

`mobile/src/lib/deepLink.ts`:

```ts
// 위젯·컨트롤이 앱을 여는 주소(스펙 11.6). Hermes의 URL 지원에 기대지 않고 직접 읽는다.
export type LinkAction = 'voice' | 'focus';
export type DeepLink = { action: LinkAction | null };

const PATTERN = /^nanal:\/\/([a-z-]+)\/?(?:\?(.*))?$/;

export function parseDeepLink(url: string | null): DeepLink | null {
  const m = url ? PATTERN.exec(url) : null;
  if (!m) return null;
  const [, host, query = ''] = m;
  if (host === 'voice') return { action: 'voice' };
  if (host === 'today') return { action: query.split('&').includes('focus=1') ? 'focus' : null };
  return null;
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/lib/deepLink.test.ts` → PASS

- [ ] **Step 5: `Main.tsx`에서 링크 받기**

import에 `Linking`을 더하고(`react-native`에서), `parseDeepLink`, `LinkAction`을 가져온다.

```ts
import { AppState, BackHandler, Keyboard, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { type LinkAction, parseDeepLink } from '../lib/deepLink';
```

`MainContent` 안, `focusPending` 상태 아래에 넣는다.

```ts
  const [linkAction, setLinkAction] = useState<LinkAction | null>(null);

  // 위젯·컨트롤에서 연 주소: 오늘 화면으로 가서(덮여 있으면 펼친 뒤) 동작을 넘긴다. 온보딩 중이면 화면은 그대로 둔다.
  const handleLink = useCallback((url: string | null) => {
    const link = parseDeepLink(url);
    if (!link) return;
    setScreen((s) => (s === null || s === 'onboarding' ? s : 'today'));
    setDayClosed(false);
    setClosedShown(false);
    setCoverOpen(true);
    setLinkAction(link.action);
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(handleLink, () => {});
    const sub = Linking.addEventListener('url', (e) => handleLink(e.url));
    return () => sub.remove();
  }, [handleLink]);
```

`TodayScreen`을 그리는 곳에 두 prop을 더한다(다른 prop은 그대로).

```tsx
            pendingAction={coverOpen ? linkAction : null}
            onActionHandled={() => setLinkAction(null)}
```

- [ ] **Step 6: `TodayScreen.tsx`에서 동작 처리**

`Props`에 두 필드를 더한다.

```ts
import type { LinkAction } from '../lib/deepLink';

type Props = {
  db: Db;
  version: number;
  onChanged: () => void;
  onOpenEvening: () => void;
  onOpenArchive?: () => void;
  focusReady?: boolean;
  onFocused?: () => void;
  pendingAction?: LinkAction | null;
  onActionHandled?: () => void;
};
```

함수 인자에 `pendingAction = null, onActionHandled`를 더하고, 첫 포커스 effect 아래에 넣는다.

```ts
  // 위젯·컨트롤에서 온 동작. 표지가 펼쳐지는 시간만큼 기다린 뒤 실행한다.
  useEffect(() => {
    if (!pendingAction) return;
    const t = setTimeout(() => {
      if (pendingAction === 'focus') inputRef.current?.focus();
      else {
        setNotice(null);
        setOrganizeOpen(true);
      }
      onActionHandled?.();
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(t);
    // onActionHandled는 매 렌더 새 함수라 의존성에서 뺀다
  }, [pendingAction]);
```

- [ ] **Step 7: 확인과 커밋**

```bash
npx jest && npm run typecheck
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"
git add src/lib/deepLink.ts src/lib/deepLink.test.ts src/screens/Main.tsx src/screens/TodayScreen.tsx
git commit -m "feat: nanal:// 링크로 오늘 화면과 정리 시트 열기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

개발용 빌드가 떠 있으면 `xcrun simctl openurl booted "nanal://today?focus=1"`로 입력칸에 포커스가 가는지, `nanal://voice`로 정리 시트가 열리는지 본다.

---

### Task 3: 말로 적기 상태 기계와 오류 문구

화면과 네이티브 모듈 없이 시험할 수 있게, 녹음 흐름을 순수 reducer로 둔다. 이벤트 이름은 `expo-speech-recognition`의 `start`, `result`, `end`, `error`와 맞춘다.

**Files:**
- Create: `mobile/src/voice/machine.ts`, `mobile/src/voice/machine.test.ts`, `mobile/src/voice/errors.ts`, `mobile/src/voice/errors.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`mobile/src/voice/machine.test.ts`:

```ts
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
```

`mobile/src/voice/errors.test.ts`:

```ts
import { voiceErrorMessage } from './errors';

describe('voiceErrorMessage', () => {
  it('알려진 코드는 그에 맞는 문구', () => {
    expect(voiceErrorMessage('not-allowed')).toBe('마이크와 음성 인식 권한이 필요해요. 설정에서 켜 주세요.');
    expect(voiceErrorMessage('no-speech')).toBe('말소리를 듣지 못했어요. 다시 말해 볼까요?');
    expect(voiceErrorMessage('network')).toBe('음성 인식에 인터넷이 필요해요. 글로 적어 주세요.');
    expect(voiceErrorMessage('interrupted')).toBe('전화나 알림 때문에 멈췄어요. 다시 말해 주세요.');
    expect(voiceErrorMessage('busy')).toBe('음성 인식이 바빠요. 잠시 뒤 다시 해 주세요.');
    expect(voiceErrorMessage('language-not-supported')).toBe('이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.');
    expect(voiceErrorMessage('service-not-allowed')).toBe('이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.');
  });

  it('모르는 코드는 일반 문구', () => {
    expect(voiceErrorMessage('audio-capture')).toBe('음성 인식이 멈췄어요. 다시 해 주세요.');
    expect(voiceErrorMessage('something-new')).toBe('음성 인식이 멈췄어요. 다시 해 주세요.');
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/voice` → FAIL (`Cannot find module './machine'`, `'./errors'`)

- [ ] **Step 3: 구현**

`mobile/src/voice/machine.ts`:

```ts
// 말로 적기 흐름(스펙 11.5): 권한 묻기 → 듣기(중간 결과) → 멈춤 → 받아 적은 글. 음성은 다루지 않고 글만 들고 간다.
export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'listening'; text: string }
  | { kind: 'stopping'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'failed'; code: string; text: string };

export type VoiceEvent =
  | { type: 'start' } // 사용자가 말하기를 시작했다(권한 요청 전)
  | { type: 'denied' } // 권한이 거절됐다
  | { type: 'started' } // 인식기가 듣기 시작했다
  | { type: 'result'; text: string } // 지금까지 받아 적은 전체 글
  | { type: 'stop' } // 사용자가 "다 말했어요"를 눌렀다
  | { type: 'end' } // 인식기가 끝났다
  | { type: 'error'; code: string }
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
    case 'started':
      return state.kind === 'asking' ? { kind: 'listening', text: '' } : state;
    case 'result':
      return isActive(state) ? { ...state, text: event.text } : state;
    case 'stop':
      return state.kind === 'listening' ? { kind: 'stopping', text: state.text } : state;
    case 'end': {
      if (!isActive(state)) return state;
      const text = state.text.trim();
      return text ? { kind: 'done', text } : { kind: 'failed', code: 'no-speech', text: '' };
    }
    case 'error': {
      if (event.code === 'aborted') return initialVoiceState;
      const text = isActive(state) ? state.text.trim() : '';
      if (event.code === 'no-speech' && text) return { kind: 'done', text };
      return { kind: 'failed', code: event.code, text };
    }
  }
}
```

`mobile/src/voice/errors.ts`:

```ts
// expo-speech-recognition 오류 코드(Web Speech API 이름) → 한국어 문구
const MESSAGES: Record<string, string> = {
  'not-allowed': '마이크와 음성 인식 권한이 필요해요. 설정에서 켜 주세요.',
  'no-speech': '말소리를 듣지 못했어요. 다시 말해 볼까요?',
  network: '음성 인식에 인터넷이 필요해요. 글로 적어 주세요.',
  interrupted: '전화나 알림 때문에 멈췄어요. 다시 말해 주세요.',
  busy: '음성 인식이 바빠요. 잠시 뒤 다시 해 주세요.',
  'language-not-supported': '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.',
  'service-not-allowed': '이 기기에서는 음성 인식을 쓸 수 없어요. 글로 적어 주세요.',
};

export function voiceErrorMessage(code: string): string {
  return MESSAGES[code] ?? '음성 인식이 멈췄어요. 다시 해 주세요.';
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/voice` → PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
npx jest && npm run typecheck
git add src/voice
git commit -m "feat: 말로 적기 상태 기계와 오류 문구" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 말로 적기 시트 (음성 인식 → 정리해서 넣기)

**Files:**
- Modify: `mobile/app.json`, `mobile/package.json`
- Create: `mobile/src/voice/available.ts`, `mobile/src/screens/today/VoiceSheet.tsx`
- Modify: `mobile/src/screens/today/OrganizeSheet.tsx`, `mobile/src/screens/TodayScreen.tsx`

- [ ] **Step 1: 설치와 권한 문구**

```bash
cd mobile && npx expo install expo-speech-recognition
grep -rn "requireNativeModule\|requireOptionalNativeModule" node_modules/expo-speech-recognition/build/*.js | head -3
```

Expected: `"expo-speech-recognition": "~57.1.0"`(또는 `^57.1.0`). 두 번째 명령으로 네이티브 모듈 이름을 확인한다(`ExpoSpeechRecognition`이어야 한다. 다르면 Step 2의 이름을 그 값으로 바꾼다).

`app.json`의 `plugins` 배열 끝에 더한다.

```json
      [
        "expo-speech-recognition",
        {
          "microphonePermission": "말로 적기를 하려면 마이크가 필요해요. 음성은 저장하지 않아요.",
          "speechRecognitionPermission": "말한 내용을 글로 받아 적어 할 일로 정리해요. 음성은 저장하지 않아요."
        }
      ]
```

- [ ] **Step 2: 모듈이 있는지**

`mobile/src/voice/available.ts`:

```ts
import { requireOptionalNativeModule } from 'expo';

// 개발용·출시 빌드에만 음성 인식 네이티브 모듈이 있다. Expo Go에서는 false라 연필(글로 적기)을 쓴다.
export const voiceAvailable = requireOptionalNativeModule('ExpoSpeechRecognition') != null;
```

- [ ] **Step 3: `OrganizeSheet`가 받아 적은 글로 바로 정리하기**

`Props`에 `autoOrganize?: boolean`을 더하고(주석: `// 받아 적은 글이면 열자마자 정리한다`), 함수 인자에 `autoOrganize = false`를 더한다.

`organize`가 글을 인자로 받을 수 있게 첫 줄들을 바꾼다.

```ts
  const organize = async (input: string = text) => {
    const raw = input.trim();
    if (!raw || busy.current) return;
```

`visible`을 보는 effect를 바꾼다(정리 버튼의 `onPress`가 `organize`를 그대로 넘기고 있으면 `onPress={() => organize()}`로 바꿔 이벤트 객체가 글 자리에 들어가지 않게 한다).

```ts
  useEffect(() => {
    req.current += 1;
    busy.current = false;
    setSaving(false);
    if (!visible) return;
    setStep('write');
    setText(initialText);
    setDrafts([]);
    setError(null);
    if (autoOrganize && initialText.trim()) organize(initialText);
    // organize는 매 렌더 새 함수라 의존성에서 뺀다
  }, [visible, initialText, autoOrganize]);
```

- [ ] **Step 4: 말로 적기 시트**

`mobile/src/screens/today/VoiceSheet.tsx`:

```tsx
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, HIT, SCREEN_X } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { voiceErrorMessage } from '../../voice/errors';
import { initialVoiceState, voiceReducer } from '../../voice/machine';

type Props = {
  visible: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void; // 받아 적은 글로 정리하러 간다
  onTypeInstead: (text: string) => void; // 글로 적기로 바꾼다(권한 없음, 인식 불가)
  onDismissed?: () => void; // 시트가 완전히 내려간 뒤(iOS). 다음 시트는 여기서 연다
};

// 말로 적기(스펙 11.5, Voice 목업). 음성 파일은 남기지 않고 받아 적은 글만 넘긴다.
export function VoiceSheet({ visible, onClose, onTranscript, onTypeInstead, onDismissed }: Props) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const handedOff = useRef(false);

  useSpeechRecognitionEvent('start', () => dispatch({ type: 'started' }));
  useSpeechRecognitionEvent('result', (e) => dispatch({ type: 'result', text: e.results[0]?.transcript ?? '' }));
  useSpeechRecognitionEvent('end', () => dispatch({ type: 'end' }));
  useSpeechRecognitionEvent('error', (e) => dispatch({ type: 'error', code: e.error }));

  const start = async () => {
    dispatch({ type: 'start' });
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      dispatch({ type: 'denied' });
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      recordingOptions: { persist: false },
    });
  };

  // 열리면 바로 듣기 시작하고, 닫히면 인식을 버린다.
  useEffect(() => {
    if (!visible) return;
    handedOff.current = false;
    dispatch({ type: 'reset' });
    start().catch(() => dispatch({ type: 'error', code: 'client' }));
    return () => ExpoSpeechRecognitionModule.abort();
  }, [visible]);

  useEffect(() => {
    if (state.kind === 'done' && !handedOff.current) {
      handedOff.current = true;
      onTranscript(state.text);
    }
    // onTranscript는 매 렌더 새 함수라 의존성에서 뺀다
  }, [state]);

  const listening = state.kind === 'listening';
  const text = state.kind === 'listening' || state.kind === 'stopping' || state.kind === 'failed' ? state.text : '';
  const failed = state.kind === 'failed' ? state : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onDismissed}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.headerButton} onPress={onClose}>
            <Txt>닫기</Txt>
          </Pressable>
          <Txt variant="medium" accessibilityRole="header">
            말로 적기
          </Txt>
          <View style={styles.headerButton} />
        </View>

        <Txt variant="title" style={styles.lead}>
          편하게 말해 보세요
        </Txt>
        <Txt style={styles.hint}>정리되지 않아도 괜찮아요. 할 일만 골라 둘게요.</Txt>

        <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptInner}>
          <Txt style={text ? styles.transcript : styles.placeholder} accessibilityLiveRegion="polite">
            {text || (listening ? '듣고 있어요…' : ' ')}
          </Txt>
        </ScrollView>

        {failed ? (
          <View style={styles.actions}>
            <Txt style={styles.error} accessibilityRole="alert">
              {voiceErrorMessage(failed.code)}
            </Txt>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => start().catch(() => dispatch({ type: 'error', code: 'client' }))}>
              <Txt>다시 말하기</Txt>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.primary} onPress={() => onTypeInstead(failed.text)}>
              <Txt style={styles.primaryText}>글로 적기</Txt>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={listening ? '다 말했어요' : '받아 적는 중'}
              accessibilityState={{ disabled: !listening }}
              disabled={!listening}
              style={[styles.mic, !listening && styles.micBusy]}
              onPress={() => {
                dispatch({ type: 'stop' });
                ExpoSpeechRecognitionModule.stop();
              }}
            >
              {listening ? (
                <Svg width={28} height={28} viewBox="0 0 18 18" fill="none">
                  <Rect x={6} y={1.5} width={6} height={10} rx={3} stroke={colors.onDark} strokeWidth={1.4} />
                  <Path d="M3 8.5a6 6 0 0 0 12 0M9 14.5v2.5" stroke={colors.onDark} strokeWidth={1.4} strokeLinecap="round" />
                </Svg>
              ) : (
                <ActivityIndicator color={colors.onDark} />
              )}
            </Pressable>
            <Txt style={styles.micHint}>{listening ? '다 말했으면 눌러 주세요' : '받아 적고 있어요'}</Txt>
          </View>
        )}

        <Txt style={styles.privacy}>음성은 저장하지 않고, 받아 적은 글만 정리에 써요.</Txt>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: SCREEN_X, paddingBottom: 28, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 },
  headerButton: { minWidth: HIT, minHeight: HIT, justifyContent: 'center' },
  lead: { fontSize: 24, marginTop: 8 },
  hint: { color: colors.muted, fontSize: 14 },
  transcriptBox: { flexGrow: 0, maxHeight: 260, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft },
  transcriptInner: { paddingVertical: 16 },
  transcript: { fontSize: 18, lineHeight: 28 },
  placeholder: { fontSize: 18, lineHeight: 28, color: colors.faint },
  actions: { alignItems: 'center', gap: 12, marginTop: 'auto' },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  micBusy: { opacity: 0.6 },
  micHint: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, textAlign: 'center' },
  secondary: { minHeight: HIT, paddingHorizontal: 18, justifyContent: 'center' },
  primary: { minHeight: 48, alignSelf: 'stretch', borderRadius: 24, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onDark },
  privacy: { color: colors.faint, fontSize: 12, textAlign: 'center' },
});
```

- [ ] **Step 5: 오늘 화면에 마이크 연결**

`TodayScreen.tsx` 맨 위 import 아래에 넣는다. `VoiceSheet`는 모듈이 있을 때만 불러온다(Expo Go에서 `expo-speech-recognition`을 import하면 네이티브 모듈이 없어 바로 오류가 난다).

```ts
import { voiceAvailable } from '../voice/available';

// 개발용·출시 빌드에서만 말로 적기 시트를 불러온다.
const VoiceSheet: typeof import('./today/VoiceSheet').VoiceSheet | null = voiceAvailable
  ? require('./today/VoiceSheet').VoiceSheet
  : null;
```

상태를 더한다(`organizeOpen` 아래).

```ts
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [organizeInput, setOrganizeInput] = useState<{ text: string; auto: boolean }>({ text: '', auto: false });
  const afterVoice = useRef<{ text: string; auto: boolean } | null>(null); // 말로 적기 시트가 내려간 뒤 열 정리 시트
```

정리 시트를 여는 함수를 하나로 모은다.

```ts
  const openOrganize = (input: { text: string; auto: boolean } = { text: '', auto: false }) => {
    setNotice(null);
    setOrganizeInput(input);
    setOrganizeOpen(true);
  };
  const openCapture = () => {
    if (VoiceSheet) {
      setNotice(null);
      setVoiceOpen(true);
    } else openOrganize();
  };
```

입력줄의 연필 `Pressable`을 아래로 바꾼다(모듈이 있으면 마이크, 없으면 지금 연필).

```tsx
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={VoiceSheet ? '말로 적기' : '정리해서 넣기'}
            accessibilityHint={VoiceSheet ? '말한 내용을 할 일과 메모로 정리해요' : '두서없이 쓴 글을 할 일과 메모로 정리해요'}
            style={styles.organize}
            onPress={openCapture}
          >
            {VoiceSheet ? (
              <Svg width={22} height={22} viewBox="0 0 18 18" fill="none">
                <Rect x={6} y={1.5} width={6} height={10} rx={3} stroke={colors.inkSoft} strokeWidth={1.4} />
                <Path d="M3 8.5a6 6 0 0 0 12 0M9 14.5v2.5" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinecap="round" />
              </Svg>
            ) : (
              <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
                <Path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 0 1 3 3L8 15l-4 1Z" stroke={colors.inkSoft} strokeWidth={1.4} strokeLinejoin="round" />
                <Path d="M12 5l3 3" stroke={colors.inkSoft} strokeWidth={1.4} />
              </Svg>
            )}
          </Pressable>
```

`react-native-svg` import에 `Rect`를 더한다: `import Svg, { Circle, Path, Rect } from 'react-native-svg';`

Task 2의 링크 동작 effect에서 `else { setNotice(null); setOrganizeOpen(true); }`를 `else openCapture();`로 바꾼다.

`OrganizeSheet`에 넘기는 prop을 더하고, 아래에 `VoiceSheet`를 둔다.

```tsx
      <OrganizeSheet
        db={db}
        visible={organizeOpen}
        today={today}
        initialText={organizeInput.text}
        autoOrganize={organizeInput.auto}
        onClose={() => setOrganizeOpen(false)}
        onAdded={(message) => {
          setOrganizeOpen(false);
          setNotice(message ?? null);
          onChanged();
        }}
      />
      {VoiceSheet && (
        <VoiceSheet
          visible={voiceOpen}
          onClose={() => setVoiceOpen(false)}
          onTranscript={(spoken) => {
            afterVoice.current = { text: spoken, auto: true };
            setVoiceOpen(false);
          }}
          onTypeInstead={(spoken) => {
            afterVoice.current = { text: spoken, auto: false };
            setVoiceOpen(false);
          }}
          onDismissed={() => {
            const next = afterVoice.current;
            afterVoice.current = null;
            if (next) openOrganize(next);
          }}
        />
      )}
```

- [ ] **Step 6: 확인**

```bash
npx jest && npm run typecheck
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"
npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 16 Pro" --no-bundler
grep -A1 "NSSpeechRecognitionUsageDescription\|NSMicrophoneUsageDescription" ios/*/Info.plist
```

Expected: 테스트·타입·export 통과, 빌드 성공, Info.plist에 두 권한 문구가 한국어로 들어 있다. 번들러를 띄워(`npx expo start --dev-client`) 시뮬레이터에서 마이크 → 권한 창 → 듣기 화면이 뜨는지 스크린샷으로 본다(시뮬레이터 인식은 Mac 마이크를 쓰며, 실제 받아 적기 품질은 기기에서 확인한다).

- [ ] **Step 7: 커밋**

```bash
git add app.json package.json package-lock.json src/voice/available.ts src/screens/today/VoiceSheet.tsx src/screens/today/OrganizeSheet.tsx src/screens/TodayScreen.tsx
git commit -m "feat: 말로 적기(기기 음성 인식) → 정리해서 넣기" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 위젯과 같이 쓰는 SQL

위젯(Swift)이 읽고 쓰는 SQL을 TS에 한 번 적고, 그 SQL을 그대로 실행하는 TS 함수로 앱 규칙과 같은지 시험한다. Swift는 Task 8에서 이 문자열을 옮겨 쓰고, jest가 두 파일을 비교한다.

**Files:**
- Create: `mobile/src/widget/sql.ts`, `mobile/src/widget/sql.test.ts`
- Modify: `mobile/src/stats/recordedDays.ts`

- [ ] **Step 1: 실패하는 테스트**

`mobile/src/widget/sql.test.ts`:

```ts
import { migrate } from '../db/schema';
import { setMood } from '../days/repo';
import { addItem, advanceStatus, deleteItem, migrateToToday, setPriority } from '../items/repo';
import { countRecordedDays } from '../stats/recordedDays';
import { openTestDb } from '../../test/sqlite';
import { pickNext, readWidgetSnapshot, widgetAdvance } from './sql';

const NOW = new Date(2026, 9, 8, 9, 0); // 10월 8일 오전 9시(논리 날짜 2026-10-08)
const YESTERDAY = new Date(2026, 9, 7, 9, 0);
const TODAY = '2026-10-08';

async function setup() {
  const db = openTestDb();
  await migrate(db);
  return db;
}

const outboxVersion = async (db: Awaited<ReturnType<typeof setup>>, id: string) =>
  (await db.getFirstAsync<{ version: number }>("SELECT version FROM outbox WHERE table_name = 'items' AND row_key = ?", [id]))?.version ?? null;

describe('readWidgetSnapshot', () => {
  it('오늘 할 일만 진행 중 → 중요 → 입력 순 → 끝낸 일 순서로 읽는다', async () => {
    const db = await setup();
    const a = await addItem(db, { kind: 'task', text: '빨래' }, NOW);
    await addItem(db, { kind: 'task', text: '책 사기' }, new Date(NOW.getTime() + 1000));
    const c = await addItem(db, { kind: 'task', text: '전화' }, new Date(NOW.getTime() + 2000));
    const d = await addItem(db, { kind: 'task', text: '보고서' }, new Date(NOW.getTime() + 3000));
    await addItem(db, { kind: 'note', text: '메모는 빠진다' }, NOW);
    const gone = await addItem(db, { kind: 'task', text: '지운 일' }, NOW);
    await deleteItem(db, gone.id, NOW);
    await advanceStatus(db, a.id, NOW); // 진행 중
    await advanceStatus(db, a.id, NOW); // 끝냄
    await setPriority(db, c.id, true, NOW);
    await advanceStatus(db, d.id, NOW); // 진행 중

    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.items.map((i) => [i.text, i.status, i.priority])).toEqual([
      ['보고서', 'doing', false],
      ['전화', 'open', true],
      ['책 사기', 'open', false],
      ['빨래', 'done', false],
    ]);
    expect(pickNext(snap.items)?.id).toBe(d.id);
  });

  it('밀린 일은 개수만, 옮긴 원래 항목은 오늘 목록에서 빠진다', async () => {
    const db = await setup();
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await addItem(db, { kind: 'task', text: '어제 다른 일' }, YESTERDAY);
    await migrateToToday(db, old.id, NOW);
    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.carried).toBe(1);
    expect(snap.items.map((i) => i.text)).toEqual(['어제 일']);
  });

  it('기분과 기록한 날', async () => {
    const db = await setup();
    await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await setMood(db, TODAY, 4, NOW);
    const snap = await readWidgetSnapshot(db, TODAY);
    expect(snap.mood).toBe(4);
    expect(snap.recordedDays).toBe(await countRecordedDays(db));
    expect(snap.recordedDays).toBe(2);
  });

  it('다 끝냈으면 다음 할 일이 없다', async () => {
    expect(pickNext([{ id: 'a', text: 'x', status: 'done', priority: false }])).toBeNull();
    expect(pickNext([])).toBeNull();
  });
});

describe('widgetAdvance', () => {
  it('앱의 advanceStatus와 같은 순서로 바꾸고 outbox에 남긴다', async () => {
    const db = await setup();
    const app = await addItem(db, { kind: 'task', text: '앱에서' }, NOW);
    const widget = await addItem(db, { kind: 'task', text: '위젯에서' }, NOW);
    const later = new Date(NOW.getTime() + 60_000);
    const seen: [string | null, string | null][] = [];
    for (let i = 0; i < 3; i++) {
      await advanceStatus(db, app.id, later);
      expect(await widgetAdvance(db, widget.id, later)).toBe(true);
      const rows = await db.getAllAsync<{ id: string; status: string; updated_at: string }>(
        'SELECT id, status, updated_at FROM items WHERE id IN (?, ?) ORDER BY text',
        [app.id, widget.id],
      );
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[widget.id].updated_at).toBe(later.toISOString());
      seen.push([byId[app.id].status, byId[widget.id].status]);
      expect(await outboxVersion(db, widget.id)).toBe(await outboxVersion(db, app.id));
    }
    expect(seen).toEqual([
      ['doing', 'doing'],
      ['done', 'done'],
      ['open', 'open'],
    ]);
  });

  it('메모, 옮긴 일, 지운 일, 없는 id는 바꾸지 않고 outbox도 그대로', async () => {
    const db = await setup();
    const note = await addItem(db, { kind: 'note', text: '메모' }, NOW);
    const old = await addItem(db, { kind: 'task', text: '어제 일' }, YESTERDAY);
    await migrateToToday(db, old.id, NOW); // old는 migrated
    const gone = await addItem(db, { kind: 'task', text: '지운 일' }, NOW);
    await deleteItem(db, gone.id, NOW);
    for (const id of [note.id, old.id, gone.id, 'missing']) {
      const before = await outboxVersion(db, id);
      expect(await widgetAdvance(db, id, NOW)).toBe(false);
      expect(await outboxVersion(db, id)).toBe(before);
    }
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/widget/sql.test.ts` → FAIL (`Cannot find module './sql'`)

- [ ] **Step 3: 구현**

`mobile/src/widget/sql.ts`:

```ts
import type { Db } from '../db/types';

// 앱과 위젯(targets/widget/SharedSQL.swift)이 같이 쓰는 SQL. 하나를 바꾸면 다른 하나도 똑같이 바꾼다
// (swiftParity.test.ts가 두 파일을 비교한다). 아래 TS 함수는 Swift가 하는 일을 그대로 실행해 앱 규칙과 같은지 시험하는 용도다.
export const WIDGET_SQL = {
  // 오늘 할 일: 진행 중 → 형광펜(중요) → 입력 순 → 끝낸 일. 메모·옮긴 원래 항목·지운 일은 뺀다(items/repo.ts의 ORDER와 같다).
  items: `SELECT id, text, status, priority FROM items
WHERE date = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
ORDER BY CASE WHEN status = 'doing' THEN 0 WHEN status = 'done' THEN 3 WHEN priority = 1 THEN 1 ELSE 2 END, created_at`,
  // 밀린 일 개수(listMigrationCandidates와 같은 조건)
  carried: `SELECT COUNT(*) AS n FROM items
WHERE date < ? AND kind = 'task' AND status IN ('open', 'doing') AND deleted_at IS NULL`,
  mood: `SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL`,
  // 기록한 날(스펙 4절): 할 일·메모, 기분, 회고 중 하나라도 있는 날
  recordedDays: `SELECT COUNT(*) AS n FROM (
SELECT date FROM items WHERE deleted_at IS NULL
UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
UNION SELECT date FROM reflections WHERE deleted_at IS NULL
)`,
  // advanceStatus와 같은 순서(open → doing → done → open). 바뀐 행이 있을 때만 markDirty를 실행한다.
  advance: `UPDATE items
SET status = CASE status WHEN 'open' THEN 'doing' WHEN 'doing' THEN 'done' ELSE 'open' END, updated_at = ?
WHERE id = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')`,
  markDirty: `INSERT INTO outbox (table_name, row_key) VALUES ('items', ?)
ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1`,
} as const;

export type WidgetItem = { id: string; text: string; status: 'open' | 'doing' | 'done'; priority: boolean };
export type WidgetSnapshot = { items: WidgetItem[]; carried: number; mood: number | null; recordedDays: number };

export async function readWidgetSnapshot(db: Db, today: string): Promise<WidgetSnapshot> {
  const rows = await db.getAllAsync<Omit<WidgetItem, 'priority'> & { priority: number }>(WIDGET_SQL.items, [today]);
  const carried = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.carried, [today]);
  const mood = await db.getFirstAsync<{ mood: number | null }>(WIDGET_SQL.mood, [today]);
  const recorded = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.recordedDays, []);
  return {
    items: rows.map((r) => ({ ...r, priority: r.priority === 1 })),
    carried: carried?.n ?? 0,
    mood: mood?.mood ?? null,
    recordedDays: recorded?.n ?? 0,
  };
}

// 잠금화면 "다음 할 일": 정렬된 목록에서 끝내지 않은 첫 항목
export function pickNext(items: WidgetItem[]): WidgetItem | null {
  return items.find((i) => i.status !== 'done') ?? null;
}

export async function widgetAdvance(db: Db, id: string, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.runAsync(WIDGET_SQL.advance, [now.toISOString(), id]);
    if (r.changes === 0) return false;
    await tx.runAsync(WIDGET_SQL.markDirty, [id]);
    return true;
  });
}
```

`mobile/src/stats/recordedDays.ts`를 같은 SQL을 쓰도록 바꾼다.

```ts
import type { Db } from '../db/types';
import { WIDGET_SQL } from '../widget/sql';

// 스트릭 대신 줄어들지 않는 누적 일수를 보여준다(스펙 4절). 위젯과 같은 SQL을 쓴다.
export async function countRecordedDays(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(WIDGET_SQL.recordedDays, []);
  return row?.n ?? 0;
}
```

- [ ] **Step 4: 통과 확인** — `npx jest src/widget src/stats` → PASS

- [ ] **Step 5: 커밋**

```bash
npx jest && npm run typecheck
git add src/widget/sql.ts src/widget/sql.test.ts src/stats/recordedDays.ts
git commit -m "feat: 위젯과 같이 쓰는 SQL(오늘 목록, 다음 할 일, 상태 바꾸기)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: DB를 App Group 공유 폴더로 옮기기

앱과 위젯이 같은 SQLite 파일을 쓰도록 `<App Group>/nanal/daily-log.db`로 한 번 옮긴다. 데이터를 잃지 않는 것이 최우선이다: 임시 이름으로 복사 → 모든 표의 행 수와 스키마 버전 확인 → 이름 바꾸기. 원래 파일은 지우지 않는다. 공유 폴더를 얻지 못하면 원래 자리를 계속 쓴다.

**Files:**
- Modify: `mobile/app.json`, `mobile/package.json`
- Create: `mobile/src/db/location.ts`, `mobile/src/db/location.test.ts`
- Modify: `mobile/src/db/client.ts`

- [ ] **Step 1: 설치와 App Group 권한**

```bash
cd mobile && npx expo install expo-file-system
```

`app.json`의 `ios`에 권한을 더한다.

```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.hyorish03.nanal",
      "entitlements": {
        "com.apple.security.application-groups": ["group.com.hyorish03.nanal"]
      }
    },
```

- [ ] **Step 2: 실패하는 테스트**

`mobile/src/db/location.test.ts`:

```ts
import { openTestDb } from '../../test/sqlite';
import { migrate } from './schema';
import { planDbLocation, sameContents, toFsPath } from './location';

describe('toFsPath', () => {
  it('file:// URI를 SQLite가 받는 경로로 바꾼다', () => {
    expect(toFsPath('file:///private/var/group/nanal/')).toBe('/private/var/group/nanal');
    expect(toFsPath('file:///var/a%20b/nanal')).toBe('/var/a b/nanal');
    expect(toFsPath('/already/path/')).toBe('/already/path');
  });
});

describe('planDbLocation', () => {
  it('공유 폴더가 없으면 원래 자리', () => {
    expect(planDbLocation({ sharedDir: null, sharedExists: false, legacyExists: true })).toEqual({ kind: 'legacy' });
  });
  it('공유 폴더에 이미 있으면 그것을 연다(원래 파일이 남아 있어도)', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: true, legacyExists: true })).toEqual({ kind: 'shared', dir: '/g' });
  });
  it('원래 자리에만 있으면 옮긴다', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: false, legacyExists: true })).toEqual({ kind: 'move', dir: '/g' });
  });
  it('처음 설치면 공유 폴더에 새로 만든다', () => {
    expect(planDbLocation({ sharedDir: '/g', sharedExists: false, legacyExists: false })).toEqual({ kind: 'shared', dir: '/g' });
  });
});

describe('sameContents', () => {
  async function seeded() {
    const db = openTestDb();
    await migrate(db);
    await db.runAsync(
      "INSERT INTO items (id, date, kind, text, status, priority, created_at, updated_at) VALUES ('a', '2026-10-08', 'task', 'x', 'open', 0, 't', 't')",
      [],
    );
    await db.runAsync("INSERT INTO outbox (table_name, row_key) VALUES ('items', 'a')", []);
    return db;
  }

  it('모든 표의 행 수와 스키마 버전이 같으면 true', async () => {
    expect(await sameContents(await seeded(), await seeded())).toBe(true);
  });

  it('행이 하나라도 다르면 false', async () => {
    const dest = await seeded();
    await dest.runAsync('DELETE FROM outbox', []);
    expect(await sameContents(await seeded(), dest)).toBe(false);
  });

  it('스키마 버전이 다르거나 표가 없으면 false', async () => {
    const empty = openTestDb();
    expect(await sameContents(await seeded(), empty)).toBe(false);
    const older = openTestDb();
    await migrate(older, 1);
    expect(await sameContents(await seeded(), older)).toBe(false);
  });
});
```

- [ ] **Step 3: 실패 확인** — `npx jest src/db/location.test.ts` → FAIL (`Cannot find module './location'`)

- [ ] **Step 4: 순수 부분 구현**

`mobile/src/db/location.ts`:

```ts
import type { Tx } from './types';

// 앱과 위젯이 같이 쓰는 DB 위치(스펙 11.6). Swift(targets/widget/NanalDB.swift)도 같은 값을 쓴다.
export const APP_GROUP = 'group.com.hyorish03.nanal';
export const DB_DIR = 'nanal';
export const DB_NAME = 'daily-log.db';
export const DB_PART_NAME = 'daily-log.db.part';

export type DbPlan = { kind: 'legacy' } | { kind: 'shared'; dir: string } | { kind: 'move'; dir: string };

export function planDbLocation(input: { sharedDir: string | null; sharedExists: boolean; legacyExists: boolean }): DbPlan {
  if (input.sharedDir === null) return { kind: 'legacy' };
  if (input.sharedExists || !input.legacyExists) return { kind: 'shared', dir: input.sharedDir };
  return { kind: 'move', dir: input.sharedDir };
}

// expo-file-system의 file:// URI → expo-sqlite가 받는 파일 경로(끝 / 없음)
export function toFsPath(uri: string): string {
  const path = uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
  return path.replace(/\/+$/, '');
}

// 복사본이 원본과 같은지: 스키마 버전과 원본의 모든 표 행 수. 복사본에 표가 없으면 쿼리가 실패하므로 false.
export async function sameContents(source: Tx, copy: Tx): Promise<boolean> {
  try {
    const version = 'PRAGMA user_version';
    const a = await source.getFirstAsync<{ user_version: number }>(version, []);
    const b = await copy.getFirstAsync<{ user_version: number }>(version, []);
    if (a?.user_version !== b?.user_version) return false;
    const tables = await source.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      [],
    );
    for (const { name } of tables) {
      const count = `SELECT COUNT(*) AS n FROM "${name}"`;
      const x = await source.getFirstAsync<{ n: number }>(count, []);
      const y = await copy.getFirstAsync<{ n: number }>(count, []);
      if (x?.n !== y?.n) return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: 통과 확인** — `npx jest src/db` → PASS

- [ ] **Step 6: `client.ts`에서 옮기기**

`mobile/src/db/client.ts`를 바꾼다. `File`, `Directory`의 `exists`, `create`, `delete`, `move`는 `expo-file-system` 57의 새 API다(타입이 다르면 `node_modules/expo/node_modules/expo-file-system/src/*.ts`를 보고 맞춘다).

```ts
import { Directory, File, Paths } from 'expo-file-system';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { APP_GROUP, DB_DIR, DB_NAME, DB_PART_NAME, planDbLocation, sameContents, toFsPath } from './location';
import { migrate } from './schema';
import { serialize } from './serialize';
import type { Db } from './types';

export async function openDb(): Promise<Db> {
  const raw = await openRaw();
  // 위젯이 같은 파일을 읽고 쓰므로 WAL로 읽기와 쓰기가 서로 막지 않게 하고, 잠겨 있으면 잠깐 기다린다.
  await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const db = serialize(raw);
  await migrate(db);
  return db;
}

function sharedDir(): Directory | null {
  const container = Paths.appleSharedContainers?.[APP_GROUP];
  return container ? new Directory(container, DB_DIR) : null;
}

async function openRaw(): Promise<SQLiteDatabase> {
  const dir = sharedDir();
  const plan = planDbLocation({
    sharedDir: dir ? toFsPath(dir.uri) : null,
    sharedExists: dir ? new File(dir, DB_NAME).exists : false,
    legacyExists: new File(Paths.document, 'SQLite', DB_NAME).exists,
  });
  if (plan.kind === 'legacy' || !dir) return openDatabaseAsync(DB_NAME);
  dir.create({ intermediates: true, idempotent: true });
  if (plan.kind === 'move' && !(await moveToShared(dir, plan.dir))) {
    return openDatabaseAsync(DB_NAME); // 옮기지 못하면 원래 자리에서 계속 쓰고 다음 실행에 다시 시도한다
  }
  return openDatabaseAsync(DB_NAME, undefined, plan.dir);
}

// 원래 DB를 공유 폴더에 임시 이름으로 복사하고, 같은지 확인한 뒤에만 제 이름으로 바꾼다. 원래 파일은 지우지 않는다.
async function moveToShared(dir: Directory, dirPath: string): Promise<boolean> {
  const part = new File(dir, DB_PART_NAME);
  if (part.exists) part.delete(); // 지난번에 중간에 끊긴 복사본
  let ok = false;
  const source = await openDatabaseAsync(DB_NAME);
  const copy = await openDatabaseAsync(DB_PART_NAME, undefined, dirPath);
  try {
    await backupDatabaseAsync({ sourceDatabase: source, destDatabase: copy });
    ok = await sameContents(source, copy);
  } catch {
    ok = false;
  } finally {
    await copy.closeAsync();
    await source.closeAsync();
  }
  if (!ok) {
    if (part.exists) part.delete();
    return false;
  }
  part.move(new File(dir, DB_NAME));
  return true;
}
```

- [ ] **Step 7: 확인**

```bash
npx jest && npm run typecheck
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"
npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 16 Pro" --no-bundler
grep -A3 "application-groups" ios/*/*.entitlements
```

번들러를 띄워 앱을 연 뒤 공유 폴더에 DB가 생겼는지 본다.

```bash
APP=$(xcrun simctl get_app_container booted com.hyorish03.nanal data)
find "$(dirname "$(dirname "$(dirname "$APP")")")/Shared/AppGroup" -name "daily-log.db*" 2>/dev/null
```

Expected: `.../Shared/AppGroup/<UUID>/nanal/daily-log.db`가 있고 `daily-log.db.part`는 없다. 앱에서 예전 기록(오늘 할 일, 기록한 날 수)이 그대로 보인다.
- 공유 폴더에 파일이 없으면(서명에 App Group이 들어가지 않은 경우, 결정 12) 앱이 예전처럼 동작하는지만 확인하고, 이 사실을 보고에 적는다. 서명 우회 설정은 만들지 않는다.

- [ ] **Step 8: 커밋**

```bash
git add app.json package.json package-lock.json src/db/location.ts src/db/location.test.ts src/db/client.ts
git commit -m "feat: 앱 DB를 App Group 공유 폴더로 옮기기(복사 확인 후, 원본 보존)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 위젯 타깃 연결 준비와 새로 고침

`@bacons/apple-targets`를 설치하고, 앱이 화면을 다시 그릴 때 위젯도 새로 고치게 한다. 위젯 Swift 코드는 Task 8~9에서 쓴다.

**Files:**
- Modify: `mobile/app.json`, `mobile/package.json`
- Create: `mobile/src/widget/reload.ts`
- Modify: `mobile/src/screens/Main.tsx`

- [ ] **Step 1: 설치와 플러그인**

```bash
cd mobile && npm install @bacons/apple-targets@5.0.0
grep -rn "requireNativeModule\|requireOptionalNativeModule" node_modules/@bacons/apple-targets/build/*.js | head -3
```

Expected: `package.json`에 `"@bacons/apple-targets": "^5.0.0"`. 두 번째 명령으로 `ExtensionStorage`가 부르는 네이티브 모듈 이름을 확인한다(`ExtensionStorage`여야 한다. 다르면 Step 2의 이름을 그 값으로 바꾼다).

`app.json`의 `plugins` 배열 끝에 `"@bacons/apple-targets"`를 더한다.

- [ ] **Step 2: 새로 고침 함수**

`mobile/src/widget/reload.ts`:

```ts
import { requireOptionalNativeModule } from 'expo';

type ExtensionStorageModule = { reloadWidget(name?: string): void };

// @bacons/apple-targets의 ExtensionStorage(WidgetCenter.reloadAllTimelines). Expo Go에는 없으니 있을 때만 부른다.
const native = requireOptionalNativeModule<ExtensionStorageModule>('ExtensionStorage');

export function reloadWidgets(): void {
  try {
    native?.reloadWidget();
  } catch {
    // 위젯 새로 고침 실패는 앱 동작에 영향을 주지 않는다
  }
}
```

- [ ] **Step 3: `Main.tsx`에서 부르기**

화면을 다시 그리는 곳(`refresh`)은 저장 후(`onChanged`), 동기화로 받은 뒤(`useSync`), 앱이 앞으로 올 때 모두 거친다. 여기서 위젯도 새로 고친다.

```ts
import { reloadWidgets } from '../widget/reload';
```

```ts
  // 화면을 다시 그릴 때 위젯도 같은 데이터로 다시 그린다(앱이 앞에 있을 때의 새로 고침은 WidgetKit 예산을 쓰지 않는다).
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    reloadWidgets();
  }, []);
```

- [ ] **Step 4: 확인과 커밋**

```bash
npx jest && npm run typecheck
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy npx expo export --platform ios --output-dir "$TMPDIR/nanal-export"
git add app.json package.json package-lock.json src/widget/reload.ts src/screens/Main.tsx
git commit -m "feat: 앱에서 바뀌면 위젯 새로 고침" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(이 단계에서는 `targets/`가 없어 prebuild를 돌려도 위젯 타깃이 생기지 않는다. 빌드 확인은 Task 8에서 한다.)

---

### Task 8: 위젯 타깃과 Swift 데이터 계층

`mobile/targets/widget`에 위젯 타깃을 만들고, 공유 DB를 읽고 쓰는 Swift를 쓴다. SQL은 `src/widget/sql.ts`와 글자 그대로 같아야 하며, jest가 비교한다. 화면은 이 Task에서 가장 단순한 것 하나만 두고(빌드 확인용) Task 9에서 채운다.

**Files:**
- Create: `mobile/targets/widget/expo-target.config.js`, `SharedSQL.swift`, `NanalDB.swift`, `LogicalDate.swift`, `Widgets.swift`
- Create: `mobile/src/widget/swiftParity.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`mobile/src/widget/swiftParity.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_GROUP, DB_DIR, DB_NAME } from '../db/location';
import { MOOD_WORDS } from '../days/moods';
import { WIDGET_SQL } from './sql';

const TARGET = join(__dirname, '../../targets/widget');
const read = (name: string) => readFileSync(join(TARGET, name), 'utf8');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

// Swift의 `static let name = """ ... """`를 읽는다.
function swiftStrings(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/static let (\w+) = """\n([\s\S]*?)\n\s*"""/g)) out[m[1]] = m[2];
  return out;
}

describe('위젯 Swift가 앱과 같은 규칙을 쓴다', () => {
  it('SharedSQL.swift의 SQL이 WIDGET_SQL과 같다', () => {
    const swift = swiftStrings(read('SharedSQL.swift'));
    expect(Object.keys(swift).sort()).toEqual(Object.keys(WIDGET_SQL).sort());
    for (const [name, sql] of Object.entries(WIDGET_SQL)) expect(normalize(swift[name])).toBe(normalize(sql));
  });

  it('App Group과 DB 경로, 기분 낱말이 같다', () => {
    const db = read('NanalDB.swift');
    expect(db).toContain(`"${APP_GROUP}"`);
    expect(db).toContain(`"${DB_DIR}/${DB_NAME}"`);
    expect(db).toContain(`[${MOOD_WORDS.map((w) => `"${w}"`).join(', ')}]`);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd mobile && npx jest src/widget/swiftParity.test.ts` → FAIL (`ENOENT ... targets/widget/SharedSQL.swift`)

- [ ] **Step 3: 타깃 설정**

`mobile/targets/widget/expo-target.config.js`:

```js
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'NanalWidget',
  displayName: '나날',
  bundleIdentifier: '.widget',
  // 잠금화면 위젯 안 버튼(AppIntent)은 iOS 17부터
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  colors: {
    $widgetBackground: '#F6F0E4',
    $accent: '#1E2F4D',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
```

- [ ] **Step 4: SQL (TS와 글자 그대로 같게)**

`mobile/targets/widget/SharedSQL.swift`:

```swift
// 앱의 mobile/src/widget/sql.ts(WIDGET_SQL)와 같은 SQL이다. 하나를 바꾸면 다른 하나도 바꾼다(swiftParity.test.ts가 비교한다).
enum SharedSQL {
  static let items = """
    SELECT id, text, status, priority FROM items
    WHERE date = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
    ORDER BY CASE WHEN status = 'doing' THEN 0 WHEN status = 'done' THEN 3 WHEN priority = 1 THEN 1 ELSE 2 END, created_at
    """

  static let carried = """
    SELECT COUNT(*) AS n FROM items
    WHERE date < ? AND kind = 'task' AND status IN ('open', 'doing') AND deleted_at IS NULL
    """

  static let mood = """
    SELECT mood FROM days WHERE date = ? AND deleted_at IS NULL
    """

  static let recordedDays = """
    SELECT COUNT(*) AS n FROM (
    SELECT date FROM items WHERE deleted_at IS NULL
    UNION SELECT date FROM days WHERE deleted_at IS NULL AND mood IS NOT NULL
    UNION SELECT date FROM reflections WHERE deleted_at IS NULL
    )
    """

  static let advance = """
    UPDATE items
    SET status = CASE status WHEN 'open' THEN 'doing' WHEN 'doing' THEN 'done' ELSE 'open' END, updated_at = ?
    WHERE id = ? AND kind = 'task' AND deleted_at IS NULL AND status IN ('open', 'doing', 'done')
    """

  static let markDirty = """
    INSERT INTO outbox (table_name, row_key) VALUES ('items', ?)
    ON CONFLICT (table_name, row_key) DO UPDATE SET version = version + 1
    """
}
```

- [ ] **Step 5: 논리 날짜와 새로 고침 시각**

`mobile/targets/widget/LogicalDate.swift`:

```swift
import Foundation

// 앱의 logicalDate(src/lib/date.ts)와 같다: 새벽 4시 전이면 전날. 기기 시간대 기준.
func logicalDate(_ now: Date = Date()) -> String {
  let shifted = now.addingTimeInterval(-4 * 3600)
  let c = Calendar.current.dateComponents([.year, .month, .day], from: shifted)
  return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

// 위젯 화면 제목: "10월 8일 목요일"
func longDateLabel(_ now: Date = Date()) -> String {
  let f = DateFormatter()
  f.locale = Locale(identifier: "ko_KR")
  f.dateFormat = "M월 d일 EEEE"
  return f.string(from: now.addingTimeInterval(-4 * 3600))
}

// 앱의 toISOString()과 같은 모양(UTC, 밀리초): 2026-10-08T00:00:00.000Z
func isoTimestamp(_ now: Date = Date()) -> String {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  f.timeZone = TimeZone(identifier: "UTC")
  return f.string(from: now)
}

// 30분 뒤와 다음 새벽 4시 중 빠른 때
func nextRefresh(after now: Date) -> Date {
  let cal = Calendar.current
  var boundary = cal.date(bySettingHour: 4, minute: 0, second: 0, of: now) ?? now.addingTimeInterval(1800)
  if boundary <= now { boundary = cal.date(byAdding: .day, value: 1, to: boundary) ?? now.addingTimeInterval(1800) }
  return min(now.addingTimeInterval(30 * 60), boundary)
}
```

- [ ] **Step 6: 공유 DB 읽기·쓰기**

`mobile/targets/widget/NanalDB.swift`:

```swift
import Foundation
import SQLite3

// 앱과 같은 파일(src/db/location.ts의 APP_GROUP, DB_DIR, DB_NAME)
let appGroupID = "group.com.hyorish03.nanal"
private let dbRelativePath = "nanal/daily-log.db"
// src/days/moods.ts의 MOOD_WORDS
let moodWords = ["힘듦", "가라앉음", "보통", "괜찮음", "좋음"]

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

struct WidgetItem: Identifiable, Hashable {
  let id: String
  let text: String
  let status: String // open | doing | done
  let priority: Bool
}

struct WidgetSnapshot {
  let available: Bool // 공유 DB를 열었는지(아니면 "앱을 한 번 열어 주세요")
  let items: [WidgetItem]
  let carried: Int
  let mood: Int?
  let recordedDays: Int

  // 잠금화면 "다음 할 일": 정렬된 목록에서 끝내지 않은 첫 항목(pickNext와 같다)
  var next: WidgetItem? { items.first { $0.status != "done" } }
  var doneCount: Int { items.filter { $0.status == "done" }.count }
  var doingCount: Int { items.filter { $0.status == "doing" }.count }
  var openCount: Int { items.filter { $0.status == "open" }.count }
  var remaining: Int { items.count - doneCount }
  var moodWord: String? { mood.flatMap { (1...5).contains($0) ? moodWords[$0 - 1] : nil } }

  static let unavailable = WidgetSnapshot(available: false, items: [], carried: 0, mood: nil, recordedDays: 0)
  static let sample = WidgetSnapshot(
    available: true,
    items: [
      WidgetItem(id: "1", text: "보고서 초안 마무리", status: "doing", priority: false),
      WidgetItem(id: "2", text: "엄마한테 전화하기", status: "open", priority: true),
      WidgetItem(id: "3", text: "빨래 널기", status: "open", priority: false),
      WidgetItem(id: "4", text: "아침 스트레칭 10분", status: "done", priority: false),
    ],
    carried: 2, mood: 4, recordedDays: 12)
}

enum NanalDB {
  static var url: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
      .appendingPathComponent(dbRelativePath)
  }

  // 앱이 WAL로 열어 두므로 읽기에도 -shm을 쓸 수 있게 읽기·쓰기로 연다. 파일이 없으면 만들지 않는다.
  private static func open() -> OpaquePointer? {
    guard let url, FileManager.default.fileExists(atPath: url.path) else { return nil }
    var db: OpaquePointer?
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else {
      sqlite3_close(db)
      return nil
    }
    sqlite3_busy_timeout(db, 3000)
    return db
  }

  private static func prepare(_ db: OpaquePointer, _ sql: String, _ args: [String]) -> OpaquePointer? {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
    for (i, arg) in args.enumerated() { sqlite3_bind_text(stmt, Int32(i + 1), arg, -1, SQLITE_TRANSIENT) }
    return stmt
  }

  private static func rows(_ db: OpaquePointer, _ sql: String, _ args: [String], _ each: (OpaquePointer) -> Void) {
    guard let stmt = prepare(db, sql, args) else { return }
    defer { sqlite3_finalize(stmt) }
    while sqlite3_step(stmt) == SQLITE_ROW { each(stmt) }
  }

  private static func run(_ db: OpaquePointer, _ sql: String, _ args: [String]) -> Bool {
    guard let stmt = prepare(db, sql, args) else { return false }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_DONE
  }

  private static func text(_ stmt: OpaquePointer, _ col: Int32) -> String {
    sqlite3_column_text(stmt, col).map { String(cString: $0) } ?? ""
  }

  static func snapshot(now: Date = Date()) -> WidgetSnapshot {
    guard let db = open() else { return .unavailable }
    defer { sqlite3_close(db) }
    let date = logicalDate(now)
    var items: [WidgetItem] = []
    rows(db, SharedSQL.items, [date]) { s in
      items.append(WidgetItem(id: text(s, 0), text: text(s, 1), status: text(s, 2), priority: sqlite3_column_int(s, 3) == 1))
    }
    var carried = 0
    rows(db, SharedSQL.carried, [date]) { carried = Int(sqlite3_column_int($0, 0)) }
    var mood: Int?
    rows(db, SharedSQL.mood, [date]) { s in
      if sqlite3_column_type(s, 0) != SQLITE_NULL { mood = Int(sqlite3_column_int(s, 0)) }
    }
    var recorded = 0
    rows(db, SharedSQL.recordedDays, []) { recorded = Int(sqlite3_column_int($0, 0)) }
    return WidgetSnapshot(available: true, items: items, carried: carried, mood: mood, recordedDays: recorded)
  }

  // 앱의 advanceStatus와 같은 규칙(widgetAdvance). 바뀐 행이 있을 때만 outbox에 남긴다. 동기화는 앱이 열릴 때 한다.
  @discardableResult
  static func advance(id: String, now: Date = Date()) -> Bool {
    guard let db = open() else { return false }
    defer { sqlite3_close(db) }
    guard sqlite3_exec(db, "BEGIN IMMEDIATE", nil, nil, nil) == SQLITE_OK else { return false }
    var ok = run(db, SharedSQL.advance, [isoTimestamp(now), id])
    let changed = ok && sqlite3_changes(db) > 0
    if changed { ok = run(db, SharedSQL.markDirty, [id]) }
    sqlite3_exec(db, ok ? "COMMIT" : "ROLLBACK", nil, nil, nil)
    return ok && changed
  }
}
```

- [ ] **Step 7: 빌드 확인용 위젯 하나**

`mobile/targets/widget/Widgets.swift` (Task 9에서 바꾼다):

```swift
import SwiftUI
import WidgetKit

struct NanalEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

struct NanalProvider: TimelineProvider {
  func placeholder(in context: Context) -> NanalEntry { NanalEntry(date: Date(), snapshot: .sample) }

  func getSnapshot(in context: Context, completion: @escaping (NanalEntry) -> Void) {
    completion(NanalEntry(date: Date(), snapshot: context.isPreview ? .sample : NanalDB.snapshot()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NanalEntry>) -> Void) {
    let now = Date()
    let entry = NanalEntry(date: now, snapshot: NanalDB.snapshot(now: now))
    completion(Timeline(entries: [entry], policy: .after(nextRefresh(after: now))))
  }
}

struct NanalHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalHome", provider: NanalProvider()) { entry in
      Text(entry.snapshot.next?.text ?? "오늘도 한 줄씩")
        .containerBackground(Color("$widgetBackground"), for: .widget)
    }
    .configurationDisplayName("나날")
    .description("오늘 할 일")
    .supportedFamilies([.systemSmall])
  }
}

@main
struct NanalWidgets: WidgetBundle {
  var body: some Widget {
    NanalHomeWidget()
  }
}
```

- [ ] **Step 8: 테스트 통과 확인** — `npx jest src/widget` → PASS

- [ ] **Step 9: 빌드**

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device "iPhone 16 Pro" --no-bundler
grep -A3 "application-groups" ios/.targets/*/generated.entitlements
```

Expected: 앱과 위젯 타깃(`NanalWidget`)이 함께 `Build Succeeded`. 위젯 entitlements에 `group.com.hyorish03.nanal`. Swift 컴파일 오류가 나면 `ios/` 아래가 아니라 `targets/widget/*.swift`를 고친다.

- [ ] **Step 10: 커밋**

```bash
npx jest && npm run typecheck
git add targets/widget src/widget/swiftParity.test.ts
git commit -m "feat: 위젯 타깃과 공유 DB 읽기·상태 바꾸기(Swift)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 위젯 화면과 상태 버튼

잠금화면(직사각형: 다음 할 일 + 상태 버튼, 원형: 남은 수, 원형: 오늘 기분)과 홈 화면(작은: 기분·기록한 날, 중간: 할 일 3개 + 체크, 큰: 상태 칩 + 목록)을 목업대로 만든다. 상태 버튼은 iOS 17 AppIntent로 위젯 안에서 바로 바꾼다(결정 6: 한 단계씩).

**Files:**
- Create: `mobile/targets/widget/Intents.swift`, `mobile/targets/widget/Views.swift`
- Modify: `mobile/targets/widget/Widgets.swift`

- [ ] **Step 1: 상태 바꾸기 AppIntent**

`mobile/targets/widget/Intents.swift`:

```swift
import AppIntents
import WidgetKit

// 위젯 안 상태 버튼: 앱을 열지 않고 • → ◐ → ●✓ → • 로 바꾼다. 끝나면 WidgetKit이 타임라인을 다시 읽는다.
struct AdvanceItemIntent: AppIntent {
  static var title: LocalizedStringResource = "할 일 상태 바꾸기"
  static var isDiscoverable = false

  @Parameter(title: "항목") var itemID: String

  init() {}
  init(itemID: String) { self.itemID = itemID }

  func perform() async throws -> some IntentResult {
    NanalDB.advance(id: itemID)
    return .result()
  }
}
```

- [ ] **Step 2: 화면 조각**

`mobile/targets/widget/Views.swift`:

```swift
import AppIntents
import SwiftUI
import WidgetKit

extension Color {
  static let paper = Color(red: 0xF6 / 255, green: 0xF0 / 255, blue: 0xE4 / 255)
  static let ink = Color(red: 0x2A / 255, green: 0x25 / 255, blue: 0x20 / 255)
  static let inkMuted = Color(red: 0x6E / 255, green: 0x64 / 255, blue: 0x56 / 255)
  static let navy = Color(red: 0x1E / 255, green: 0x2F / 255, blue: 0x4D / 255)
  static let highlight = Color(red: 0xF1 / 255, green: 0xDE / 255, blue: 0x8A / 255)
  static let chip = Color(red: 0xED / 255, green: 0xE4 / 255, blue: 0xD2 / 255)
}

let todayURL = URL(string: "nanal://today")!
let newLineURL = URL(string: "nanal://today?focus=1")!

// 상태 기호(스펙 11.2): • 할 일, ◐ 진행 중, ●✓ 끝낸 일
func statusSymbol(_ status: String) -> String {
  switch status {
  case "doing": return "circle.lefthalf.filled"
  case "done": return "checkmark.circle.fill"
  default: return "circle"
  }
}

func nextHint(_ item: WidgetItem) -> String {
  item.status == "doing" ? "진행 중 · 눌러서 완료" : (item.priority ? "중요 · 눌러서 진행 중으로" : "눌러서 진행 중으로")
}

func statusWord(_ status: String) -> String {
  switch status {
  case "doing": return "진행 중"
  case "done": return "끝낸 일"
  default: return "할 일"
  }
}

// 기호를 누르면 다음 상태로
struct StatusButton: View {
  let item: WidgetItem
  var size: CGFloat = 18

  var body: some View {
    Button(intent: AdvanceItemIntent(itemID: item.id)) {
      Image(systemName: statusSymbol(item.status))
        .font(.system(size: size))
        .frame(width: 30, height: 30)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(statusWord(item.status)) \(item.text), 눌러서 다음 상태로")
  }
}

struct ItemLine: View {
  let item: WidgetItem

  var body: some View {
    HStack(spacing: 6) {
      StatusButton(item: item).foregroundStyle(Color.navy)
      Text(item.text)
        .font(.system(size: 14))
        .foregroundStyle(item.status == "done" ? Color.inkMuted : Color.ink)
        .strikethrough(item.status == "done")
        .padding(.horizontal, item.priority ? 3 : 0)
        .background(item.priority ? Color.highlight.opacity(0.8) : Color.clear)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}

struct UnavailableView: View {
  var body: some View {
    Text("나날 앱을 한 번 열어 주세요")
      .font(.system(size: 13))
      .foregroundStyle(Color.inkMuted)
  }
}

// 잠금화면 직사각형: 다음 할 일과 상태 버튼
struct LockRectView: View {
  let s: WidgetSnapshot

  var body: some View {
    HStack(spacing: 4) {
      VStack(alignment: .leading, spacing: 1) {
        Text("나날 · 오늘 \(s.doneCount)/\(s.items.count)").font(.caption2).opacity(0.85)
        Text(s.next?.text ?? "오늘 할 일을 다 했어요").font(.headline).lineLimit(1)
        Text(s.next.map(nextHint) ?? "오늘도 한 줄씩").font(.caption2).opacity(0.75).lineLimit(1)
      }
      Spacer(minLength: 0)
      if let next = s.next { StatusButton(item: next, size: 22) }
    }
    .widgetURL(todayURL)
  }
}

// 잠금화면 원형: 남은 할 일
struct LockRemainingView: View {
  let s: WidgetSnapshot

  var body: some View {
    Gauge(value: Double(s.doneCount), in: 0...Double(max(s.items.count, 1))) {
      Text("남음")
    } currentValueLabel: {
      Text("\(s.remaining)")
    }
    .gaugeStyle(.accessoryCircular)
    .accessibilityLabel("남은 할 일 \(s.remaining)개")
    .widgetURL(todayURL)
  }
}

// 잠금화면 원형: 오늘 기분
struct LockMoodView: View {
  let s: WidgetSnapshot

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 1) {
        Image(systemName: s.mood == nil ? "drop" : "drop.fill").font(.system(size: 16))
        Text(s.moodWord ?? "기분").font(.system(size: 10))
      }
    }
    .accessibilityLabel(s.moodWord.map { "오늘 기분 \($0)" } ?? "오늘 기분 아직 없음")
    .widgetURL(todayURL)
  }
}

// 홈 작은: 기분과 기록한 날
struct HomeSmallView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("오늘 기분").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      Text(s.moodWord ?? "—").font(.system(size: 22, design: .serif)).foregroundStyle(Color.navy)
      Spacer(minLength: 0)
      Text("기록한 날").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      Text("\(s.recordedDays)일째").font(.system(size: 18, design: .serif)).foregroundStyle(Color.ink)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(todayURL)
  }
}

// 홈 중간: 오늘 할 일 3개와 체크
struct HomeMediumView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(longDateLabel()).font(.system(size: 15, design: .serif)).foregroundStyle(Color.ink)
        Spacer()
        Text("\(s.doneCount)/\(s.items.count)").font(.system(size: 12)).foregroundStyle(Color.inkMuted)
      }
      if s.items.isEmpty {
        Text("오늘도 한 줄씩").font(.system(size: 14)).foregroundStyle(Color.inkMuted)
      }
      ForEach(s.items.prefix(3)) { ItemLine(item: $0) }
      Spacer(minLength: 0)
      Link(destination: newLineURL) {
        Text("+ 한 줄").font(.system(size: 13)).foregroundStyle(Color.navy)
      }
    }
  }
}

// 홈 큰: 상태 칩과 목록
struct HomeLargeView: View {
  let s: WidgetSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(longDateLabel()).font(.system(size: 17, design: .serif)).foregroundStyle(Color.ink)
      HStack(spacing: 6) {
        chip("밀린 일", s.carried)
        chip("할 일", s.openCount)
        chip("진행 중", s.doingCount)
        chip("한 일", s.doneCount)
      }
      Text("상태를 눌러 바꿔요").font(.system(size: 11)).foregroundStyle(Color.inkMuted)
      ForEach(s.items.prefix(7)) { ItemLine(item: $0) }
      Spacer(minLength: 0)
      Link(destination: newLineURL) {
        Text("+ 한 줄").font(.system(size: 13)).foregroundStyle(Color.navy)
      }
    }
  }

  private func chip(_ label: String, _ count: Int) -> some View {
    Text("\(label) \(count)")
      .font(.system(size: 11))
      .foregroundStyle(Color.ink)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(Capsule().fill(Color.chip))
  }
}
```

- [ ] **Step 3: 위젯 정의**

`mobile/targets/widget/Widgets.swift`에서 `NanalHomeWidget`과 `NanalWidgets`를 아래로 바꾼다(`NanalEntry`, `NanalProvider`는 그대로).

```swift
struct NanalLockWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalLock", provider: NanalProvider()) { entry in
      LockEntryView(entry: entry).containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("나날 오늘 할 일")
    .description("다음 할 일과 남은 수")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular])
  }
}

struct LockEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NanalEntry

  var body: some View {
    if !entry.snapshot.available {
      UnavailableView()
    } else if family == .accessoryCircular {
      LockRemainingView(s: entry.snapshot)
    } else {
      LockRectView(s: entry.snapshot)
    }
  }
}

struct NanalMoodWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalMood", provider: NanalProvider()) { entry in
      LockMoodView(s: entry.snapshot).containerBackground(.clear, for: .widget)
    }
    .configurationDisplayName("나날 오늘 기분")
    .description("저녁 마무리에서 고른 기분")
    .supportedFamilies([.accessoryCircular])
  }
}

struct NanalHomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NanalHome", provider: NanalProvider()) { entry in
      HomeEntryView(entry: entry).containerBackground(Color.paper, for: .widget)
    }
    .configurationDisplayName("나날")
    .description("오늘 할 일과 기분")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

struct HomeEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: NanalEntry

  var body: some View {
    if !entry.snapshot.available {
      UnavailableView()
    } else {
      switch family {
      case .systemSmall: HomeSmallView(s: entry.snapshot)
      case .systemLarge: HomeLargeView(s: entry.snapshot)
      default: HomeMediumView(s: entry.snapshot)
      }
    }
  }
}

@main
struct NanalWidgets: WidgetBundle {
  var body: some Widget {
    NanalLockWidget()
    NanalMoodWidget()
    NanalHomeWidget()
  }
}
```

- [ ] **Step 4: 빌드와 시뮬레이터 확인**

```bash
cd mobile && npx jest && npm run typecheck
npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 16 Pro" --no-bundler
```

Expected: `Build Succeeded`. 시뮬레이터에서 앱을 열어 할 일 몇 개(진행 중 1, 중요 1, 끝낸 일 1)를 만든 뒤 홈 화면에 위젯을 추가한다. 시뮬레이터 위젯 추가는 손으로 해야 하므로(홈 화면 길게 누르기 → + → 나날), 자동 확인은 빌드 성공과 아래 미리보기 스크린샷까지 하고 나머지는 Task 11의 체크리스트로 넘긴다.

```bash
xcrun simctl io booted screenshot "$TMPDIR/nanal-widget.png"
```

- [ ] **Step 5: 커밋**

```bash
git add targets/widget
git commit -m "feat: 잠금화면·홈 화면 위젯과 상태 버튼" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 컨트롤 버튼 (iOS 18)

잠금화면 아래 버튼·제어 센터에 둘 "말로 적기", "한 줄 적기"를 만든다. 위젯 안에서는 입력과 녹음을 할 수 없으므로 앱을 해당 화면으로 연다(`nanal://voice`, `nanal://today?focus=1`, Task 2에서 처리).

**Files:**
- Create: `mobile/targets/widget/Controls.swift`
- Modify: `mobile/targets/widget/Widgets.swift`

- [ ] **Step 1: 컨트롤**

`mobile/targets/widget/Controls.swift`:

```swift
import AppIntents
import SwiftUI
import WidgetKit

// 컨트롤에서 앱을 특정 화면으로 연다(iOS 18 OpenURLIntent).
@available(iOS 18.0, *)
struct OpenNanalIntent: AppIntent {
  static var title: LocalizedStringResource = "나날 열기"
  static var isDiscoverable = false

  @Parameter(title: "주소") var target: String

  init() {}
  init(target: String) { self.target = target }

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: target) ?? todayURL))
  }
}

@available(iOS 18.0, *)
struct NanalVoiceControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "NanalVoiceControl") {
      ControlWidgetButton(action: OpenNanalIntent(target: "nanal://voice")) {
        Label("말로 적기", systemImage: "mic")
      }
    }
    .displayName("나날 말로 적기")
  }
}

@available(iOS 18.0, *)
struct NanalLineControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "NanalLineControl") {
      ControlWidgetButton(action: OpenNanalIntent(target: newLineURL.absoluteString)) {
        Label("한 줄 적기", systemImage: "pencil")
      }
    }
    .displayName("나날 한 줄 적기")
  }
}
```

- [ ] **Step 2: 번들에 넣기**

`Widgets.swift`의 `NanalWidgets`를 바꾼다.

```swift
@main
struct NanalWidgets: WidgetBundle {
  var body: some Widget {
    NanalLockWidget()
    NanalMoodWidget()
    NanalHomeWidget()
    if #available(iOS 18.0, *) {
      NanalVoiceControl()
      NanalLineControl()
    }
  }
}
```

`if #available`이 `WidgetBundleBuilder`에서 컴파일되지 않으면(Xcode 버전에 따라 다를 수 있다) 위젯 타깃의 `deploymentTarget`은 그대로 두고, 컨트롤만 담은 두 번째 번들을 만들지 말고 보고한다(위젯 타깃 하나에 `@main`은 하나만 둘 수 있다).

- [ ] **Step 3: 빌드와 확인**

```bash
cd mobile && npx expo prebuild --platform ios --clean && npx expo run:ios --device "iPhone 16 Pro" --no-bundler
xcrun simctl openurl booted "nanal://voice"
xcrun simctl io booted screenshot "$TMPDIR/nanal-voice-link.png"
```

Expected: `Build Succeeded`. (번들러가 떠 있을 때) `nanal://voice`로 말로 적기 시트가 열린다. 컨트롤 자체는 iOS 18 런타임에서 손으로 추가해 확인한다(현재 켜진 시뮬레이터는 iOS 18.3).

- [ ] **Step 4: 커밋**

```bash
git add targets/widget
git commit -m "feat: iOS 18 컨트롤(말로 적기, 한 줄 적기)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 스펙·TODO 기록과 확인 목록

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-daily-log-app-design.md`, `docs/TODO.md`

- [ ] **Step 1: 스펙 11.5, 11.6에 구현 결정 기록**

11.5 끝에 덧붙인다.

```markdown
- 구현(계획 D): `expo-speech-recognition`으로 한국어 받아 적기(계속 듣기, 중간 결과, 문장부호). 기기 인식을 지원하면 기기 인식만 쓰고, 아니면 Apple 서버 인식(인터넷 필요). 음성 파일은 저장하지 않는다(`persist: false`).
- 개발용·출시 빌드에서는 입력줄의 연필 자리에 마이크가 있고, Expo Go에서는 연필(글로 정리)이다. 권한이 없거나 인식이 안 되면 "글로 적기"로 같은 정리 시트를 연다.
- 다 말하면 받아 적은 글로 바로 정리하고 "이렇게 정리했어요"를 보여준다.
```

11.6 끝에 덧붙인다.

```markdown
- 구현(계획 D): `@bacons/apple-targets`로 `mobile/targets/widget`(Swift)을 위젯 타깃으로 붙인다. `ios/`는 만들어 쓰고 버린다(CNG).
- 번들 ID `com.hyorish03.nanal`(위젯 `.widget`), App Group `group.com.hyorish03.nanal`. 앱 DB는 `<App Group>/nanal/daily-log.db`로 한 번 옮긴다(임시 이름으로 복사 → 표마다 행 수·스키마 버전 확인 → 이름 바꾸기, 원본은 남김). 공유 폴더가 없으면 원래 자리를 쓰고 위젯은 "앱을 한 번 열어 주세요".
- 위젯 SQL은 `src/widget/sql.ts`와 `targets/widget/SharedSQL.swift`에 같은 글자로 두고 jest가 비교한다. 상태 바꾸기는 앱 기호 탭과 같이 한 단계씩(잠금화면 버튼도 두 번 누르면 완료). 위젯에서 바꾼 것은 outbox에 남고 앱이 열릴 때 동기화한다.
- 앱이 화면을 다시 그릴 때마다 위젯을 새로 고친다. 위젯은 30분마다, 새벽 4시 경계에 새로 고친다.
- 컨트롤(iOS 18): 말로 적기 `nanal://voice`, 한 줄 적기 `nanal://today?focus=1`.
- 실제 아이폰에 위젯을 넣으려면 유료 Apple Developer Program이 필요하다(App Groups).
```

- [ ] **Step 2: TODO 갱신**

`docs/TODO.md`의 "계획 D" 절을 아래로 바꾼다.

```markdown
### 계획 D: 말로 적기(STT)와 위젯 — 코드 완료, 확인 남음
- [ ] Apple Developer Program 가입 후 `app.json`에 `ios.appleTeamId`를 넣고 기기에 설치(`npx expo run:ios --device`). App Groups 권한이 필요하다.
- [ ] 기기에서 받아 적기 품질(한국어, 기기 인식 여부) 확인.
- [ ] 시뮬레이터·기기 확인 목록(아래 2절)의 위젯 항목.
- [ ] 예전 자리 DB 파일(`Documents/SQLite/daily-log.db`)을 언제 지울지 정한다. 지금은 옮긴 뒤에도 남겨 둔다.
```

"2. 화면에서 직접 확인할 것"에 항목을 더한다.

```markdown
- [ ] (개발용 빌드) 마이크 → 권한 → 말하기 → "다 말했어요" → "이렇게 정리했어요" → 넣기. 권한을 거절하면 "글로 적기".
- [ ] (개발용 빌드) 예전 기록이 그대로 있는지(DB 옮기기 후). `Shared/AppGroup/.../nanal/daily-log.db`가 생겼는지.
- [ ] 홈 화면 위젯 작은·중간·큰, 잠금화면 직사각형·원형 2개를 추가해 목업과 비교.
- [ ] 위젯 상태 버튼을 눌러 • → ◐ → ●✓ → • 로 바뀌고, 앱을 열면 같은 상태이며 동기화(다른 기기)에도 반영되는지.
- [ ] 앱에서 할 일을 바꾸면 위젯이 곧 바뀌는지. 새벽 4시가 지나면 위젯 날짜가 바뀌는지.
- [ ] 위젯 "+ 한 줄" → 앱 입력칸 포커스. 컨트롤(iOS 18) 말로 적기·한 줄 적기.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-10-06-daily-log-app-design.md docs/TODO.md
git commit -m "docs: 말로 적기와 위젯 구현 결정, 확인 목록" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
