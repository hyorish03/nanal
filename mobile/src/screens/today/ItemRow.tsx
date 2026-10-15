import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { type AccessibilityActionEvent, Animated, Keyboard, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type ItemKind, MAX_TEXT, type TaskStatus } from '../../items/repo';
import { haptic } from '../../ui/haptics';
import { Highlight } from '../../ui/Highlight';
import { EASE_OUT } from '../../ui/motion';
import { Popover, useAnchor } from '../../ui/Popover';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { advanceAction, canAdvance, itemA11yHint, itemA11yLabel, type RowPlace, symbolKind } from '../../ui/symbols';
import { colors, fonts } from '../../ui/theme';
import { MAX_FONT_SCALE, Txt, txtStyle } from '../../ui/Txt';
import { dimPressed, tintPressed } from '../../ui/press';
import { useTextScale } from '../../ui/typeScale';
import { useEvent } from '../../ui/useEvent';
import { useReduceMotion } from '../../ui/useReduceMotion';
import { ROW_PAD_WIDE, RULE_GAP, ruleGapFor } from './NotebookPage';
import { ACTION_W, actionSpan, actionsWidth, dragTo, markAt, openRow, settleLeft, swipeActionsFor, type Zone, zoneAt } from './swipe';
import type { DragReorder } from './useDragReorder';

// 값은 원시값만, 함수는 화면이 한 번 만든 것(id를 받는다)만 받는다. 그래야 memo가 다른 줄의 변화에 다시 그리지 않는다.
type Props = {
  id: string;
  kind: ItemKind;
  text: string;
  status: TaskStatus | null;
  priority: boolean;
  priorityFull: boolean; // 오늘 중요 표시가 이미 3개
  onAdvance: (id: string) => void;
  onTogglePriority: (id: string, on: boolean) => void;
  onEdit: (id: string, text: string) => Promise<boolean>; // 저장됐는지 돌려준다(안 됐으면 원래 글로 되돌린다)
  onPostpone: (id: string) => void; // 언제로 미룰지 고르는 시트를 연다
  onDrop: (id: string) => void; // 안 하기: 지우지 않고 줄을 긋는다
  onDelete: (id: string) => void;
  onPriorityFull: () => void; // 중요가 다 찬 날 형광펜 쪽으로 밀었다
  onRevealEdit: (id: string, bottom: number) => void; // 고치는 줄의 아래 끝(창 기준). 키보드에 가리면 화면이 목록을 굴린다
  // 언젠가 목록에서 쓸 때: 진행 중 없이 할 일 ↔ 끝낸 일, 미루기 자리에 '오늘 할 일로'(onPostpone이 바로 옮긴다),
  // 밀면 오늘 할 일로·지우기만, 옮긴 줄은 흐리게. 기본(day)은 오늘 장 그대로다
  place?: RowPlace;
  // 길게 눌러 끌어 순서 바꾸기. 없거나 draggable이 아니면(언젠가의 끝낸 줄) 길게 누르면 메뉴만 뜬다
  reorder?: DragReorder;
  draggable?: boolean;
  // 스크린 리더의 '위로 옮기기'·'아래로 옮기기'(한 칸씩). 끝 줄에서는 그쪽이 빠진다
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (id: string, delta: -1 | 1) => void;
};

export const ItemRow = memo(function ItemRow(props: Props) {
  const { id, kind: itemKind, text, status, priority, priorityFull, onAdvance, onTogglePriority, onEdit, onPostpone, onDrop, onDelete } = props;
  const place = props.place ?? 'day';
  const someday = place === 'someday';
  const postponeLabel = someday ? '오늘 할 일로' : '미루기';
  const menu = useAnchor();
  const reduce = useReduceMotion();
  // 넓은 배치에서는 글자가 커진 만큼 줄 높이도 공책 줄 간격(useRuleGap)에 맞춰 넓힌다
  const k = useTextScale();
  const roomy = k.wide ? { line: Math.round(24 * k.ownScale), gap: ruleGapFor(k) } : null;
  // 시스템 글자 크기를 키우면(최대 MAX_FONT_SCALE) 글의 첫 줄도 그만큼 높아진다. 기호와 ⋯를 그 첫 줄 가운데에 맞춘다
  // (기본 크기에서는 배율 1이라 24·50 그대로)
  const fs = Math.min(useWindowDimensions().fontScale, MAX_FONT_SCALE);
  const baseLine = roomy ? roomy.line : 24;
  const lineH = Math.round(baseLine * fs);
  const moreH = (roomy ? roomy.gap : RULE_GAP) + lineH - baseLine;
  // 고쳐서 저장하는 동안(목록을 다시 불러오기 전) 새 글을 먼저 보여준다
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [text]);
  const item = { kind: itemKind, status, priority, text: pending ?? text };
  const kind = symbolKind(item);
  const advance = canAdvance(item);
  const markDisabled = !item.priority && priorityFull;
  const done = kind === 'done';
  const dropped = kind === 'dropped';
  const [marked, setMarked] = useState(false); // 이 줄에 방금 형광펜을 칠했다(그때만 긋는 애니메이션)
  const next = advanceAction(item, place);
  const canMark = item.kind === 'task' && (status === 'open' || status === 'doing');
  const togglePriority = () => {
    setMarked(!item.priority);
    onTogglePriority(id, !item.priority);
  };

  // ── 밀기: ← 미루기·안 하기·지우기 버튼, → 형광펜 ──
  const swipe = swipeActionsFor(item, place);
  const actionW = Math.round(ACTION_W * k.ownScale);
  const actionsW = actionsWidth(swipe.left, actionW);
  const blocked = swipe.mark && markDisabled;
  const drag = useRef(new Animated.Value(0)).current; // 줄이 옆으로 간 거리. 손가락을 따라 JS에서 바로 넣는다
  const width = useRef(0);
  const isOpen = useRef(false); // 버튼이 열려 있다
  const g = useRef<{ base: number; zone: Zone }>({ base: 0, zone: null });
  const [zone, setZone] = useState<Zone>(null); // 지금 놓으면 일어날 일(띠·버튼 모양을 바꾼다)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const settle = (to: number) => Animated.timing(drag, { toValue: to, duration: 200, easing: EASE_OUT, useNativeDriver: false }).start();
  const closeSwipe = useEvent(() => {
    isOpen.current = false;
    openRow.closed(id);
    settle(0);
  });
  const openSwipe = () => {
    isOpen.current = true;
    openRow.opened(id, closeSwipe);
    settle(-actionsW);
  };
  // 끝까지 밀어 지운다. 줄이 밀려 나간 뒤 지우고, 지우지 못했으면 잠시 뒤 제자리로 돌아온다
  const swipeDelete = () => {
    isOpen.current = false;
    openRow.closed(id);
    const go = () => {
      onDelete(id);
      leaveTimer.current = setTimeout(() => drag.setValue(0), 1000);
    };
    if (reduce) return go();
    Animated.timing(drag, { toValue: -width.current, duration: 160, easing: EASE_OUT, useNativeDriver: false }).start(go);
  };
  // 중요가 다 찼다: 칠하지 않고 통 튕겨 돌아온다(동작 줄이기면 그냥 돌아온다)
  const refuseMark = () => {
    haptic.warning();
    props.onPriorityFull();
    if (reduce) return settle(0);
    Animated.sequence([
      Animated.timing(drag, { toValue: 0, duration: 140, easing: EASE_OUT, useNativeDriver: false }),
      Animated.timing(drag, { toValue: 10, duration: 90, easing: EASE_OUT, useNativeDriver: false }),
      Animated.timing(drag, { toValue: 0, duration: 160, easing: EASE_OUT, useNativeDriver: false }),
    ]).start();
  };

  const shape = () => ({ width: width.current, actionsW, mark: swipe.mark, blocked, wasOpen: g.current.base < 0 });
  const onStart = useEvent(() => {
    drag.stopAnimation();
    clearTimeout(leaveTimer.current);
    g.current = { base: isOpen.current ? -actionsW : 0, zone: null };
  });
  const onUpdate = useEvent((e: { translationX: number }) => {
    const x = dragTo(g.current.base + e.translationX, shape());
    drag.setValue(x);
    const z = zoneAt(x, shape());
    if (z !== g.current.zone) {
      g.current.zone = z;
      if (z) haptic.select(); // 놓으면 일이 일어나는 선을 넘는 순간 한 번
      setZone(z);
    }
  });
  const onEnd = useEvent((e: { translationX: number; velocityX: number }, success: boolean) => {
    const raw = g.current.base + e.translationX;
    const x = dragTo(raw, shape());
    g.current.zone = null;
    setZone(null);
    if (!success) return isOpen.current ? openSwipe() : closeSwipe();
    if (x > 0) {
      // 형광펜 쪽. 다 찬 날은 덜 따라오므로 손가락이 간 거리로 본다
      if (raw >= markAt(width.current)) {
        if (blocked) return refuseMark();
        togglePriority();
      }
      return settle(0);
    }
    const how = settleLeft(x, e.velocityX, shape());
    if (how === 'delete') swipeDelete();
    else if (how === 'open') openSwipe();
    else closeSwipe();
  });

  // ── 제자리에서 고치기: 글을 누르면 그 자리가 같은 모양의 입력칸이 된다 ──
  // 'menu': 메뉴(Modal)가 닫히는 중이라 포커스를 조금 늦게 준다
  const [editing, setEditing] = useState<false | 'tap' | 'menu'>(false);
  const [draft, setDraft] = useState('');
  const input = useRef<TextInput>(null);
  const finished = useRef(false); // 완료 키와 포커스 잃기가 잇달아 와도 한 번만 저장한다
  const row = useRef<View>(null);
  const edit = (from: 'tap' | 'menu' = 'tap') => {
    closeSwipe();
    finished.current = false;
    setDraft(item.text);
    setEditing(from);
  };
  const finishEdit = () => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    // 붙여 넣은 줄바꿈은 띄어쓰기로. 비우면 지우지 않고 원래 글로 돌아간다
    const t = draft.replace(/\s*\n\s*/g, ' ').trim();
    if (!t || t === item.text) return;
    setPending(t);
    onEdit(id, t).then((ok) => {
      if (!ok) setPending(null);
    });
  };
  useEffect(() => {
    if (!editing) return;
    // 키보드가 다 올라와 화면이 줄어든 뒤에 이 줄이 가리는지 본다
    const reveal = () => row.current?.measureInWindow((_x, y, _w, h) => props.onRevealEdit(id, y + h));
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    const timers = [Keyboard.isVisible() ? setTimeout(reveal, 50) : undefined];
    if (editing === 'menu') timers.push(setTimeout(() => input.current?.focus(), MENU_FOCUS_DELAY));
    return () => {
      sub.remove();
      timers.forEach((t) => t && clearTimeout(t));
    };
    // 고치기를 시작할 때 한 번
  }, [editing]);

  const swipeable = !editing;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true) // Reanimated 없이 RN Animated로 그린다
        .enabled(swipeable)
        // 옆으로 조금만 밀어도 가져간다. 줄이 낮아 손가락이 위아래로 조금 흔들리는 건 봐주고,
        // 위아래로 뚜렷하게 움직일 때만 목록 스크롤에 넘긴다(예전 ±10은 비스듬히 밀면 자주 놓쳤다)
        .activeOffsetX([-8, 8])
        .failOffsetY([-22, 22])
        .onStart(onStart)
        .onUpdate(onUpdate)
        .onEnd(onEnd),
    [swipeable, onStart, onUpdate, onEnd],
  );
  // ── 길게 눌러 끌기: 줄이 살짝 들리고(진동), 위아래로 움직이면 순서를 바꾼다. 움직이지 않고 놓으면 ⋯ 메뉴 ──
  // 옆으로 밀기와 경주(Race)한다: 먼저 옆으로 8pt 밀면 밀기가, 가만히 LIFT_MS를 누르고 있으면 끌기가 이긴다.
  // 끌기가 시작되면 gesture-handler가 글·기호의 Pressable 누르기를 거둬 가서 고치기·상태 넘기기가 일어나지 않는다
  const { reorder } = props;
  const canDrag = !!reorder && (props.draggable ?? true) && !editing;
  const liftScale = useRef(new Animated.Value(1)).current;
  const [lifted, setLifted] = useState(false);
  const lift = useRef({ active: false, moved: false });
  const onLiftStart = useEvent(() => {
    if (!reorder) return;
    closeSwipe();
    openRow.closeAll();
    lift.current = { active: reorder.begin(id), moved: false };
    setLifted(true);
    haptic.light();
    if (!reduce) Animated.timing(liftScale, { toValue: LIFT_SCALE, duration: 120, easing: EASE_OUT, useNativeDriver: false }).start();
  });
  const onLiftUpdate = useEvent((e: { translationY: number; absoluteY: number }) => {
    if (!lift.current.active) return;
    // 손가락이 조금 떨리는 건 움직인 것으로 치지 않는다(놓으면 메뉴가 떠야 한다)
    if (!lift.current.moved && Math.abs(e.translationY) < MOVE_SLOP) return;
    lift.current.moved = true;
    reorder?.move(e.translationY, e.absoluteY);
  });
  const onLiftEnd = useEvent((_e: unknown, success: boolean) => {
    const { active, moved } = lift.current;
    lift.current = { active: false, moved: false };
    setLifted(false);
    if (reduce) liftScale.setValue(1);
    else Animated.timing(liftScale, { toValue: 1, duration: 150, easing: EASE_OUT, useNativeDriver: false }).start();
    if (active) {
      if (moved && success) reorder?.end();
      else reorder?.cancel();
    }
    if (!moved && success) openMenu();
  });
  const liftPan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(canDrag)
        .activateAfterLongPress(LIFT_MS) // 그 전에 10pt 넘게 움직이면 끌기가 아니다(목록 스크롤·밀기에 넘긴다)
        .onStart(onLiftStart)
        .onUpdate(onLiftUpdate)
        .onEnd(onLiftEnd),
    [canDrag, onLiftStart, onLiftUpdate, onLiftEnd],
  );
  const gesture = useMemo(() => Gesture.Race(pan, liftPan), [pan, liftPan]);
  const shiftY = reorder ? reorder.valueFor(id) : null;

  // 버튼이 열린 줄을 누르면 하려던 일 대신 닫기만 한다
  const unlessOpen = (fn: () => void) => () => (isOpen.current ? closeSwipe() : fn());
  // 메뉴를 닫고 고른 일을 한다
  const pick = (fn: () => void) => () => {
    menu.close();
    fn();
  };
  const openMenu = () => {
    closeSwipe();
    menu.open();
  };
  // 드러난 버튼을 누르면 그 일을 하고 줄을 닫는다
  const tapAction = (fn: () => void) => () => {
    closeSwipe();
    fn();
  };

  // 스크린 리더에서는 줄 하나가 한 요소다. 두 번 누르면 상태가 넘어가고, 나머지는 동작 목록(위아래로 쓸기)에 있다
  const actions = [
    ...(advance ? [{ name: 'activate' }, { name: 'advance', label: '상태 바꾸기' }] : []),
    ...(canMark && !markDisabled ? [{ name: 'priority', label: item.priority ? '중요 표시 지우기' : '중요 표시하기' }] : []),
    ...(canMark ? [{ name: 'postpone', label: postponeLabel }, { name: 'drop', label: '안 하기' }] : []),
    { name: 'edit', label: '고치기' },
    { name: 'delete', label: '지우기' },
    ...(props.onMove && props.canMoveUp ? [{ name: 'moveUp', label: '위로 옮기기' }] : []),
    ...(props.onMove && props.canMoveDown ? [{ name: 'moveDown', label: '아래로 옮기기' }] : []),
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate' || name === 'advance') onAdvance(id);
    else if (name === 'priority') togglePriority();
    else if (name === 'postpone') onPostpone(id);
    else if (name === 'drop') onDrop(id);
    else if (name === 'edit') edit();
    else if (name === 'delete') onDelete(id);
    else if (name === 'moveUp') props.onMove?.(id, -1);
    else if (name === 'moveDown') props.onMove?.(id, 1);
  };

  const variant = kind === 'note' ? 'hand' : 'body';
  const textStyle = [
    kind === 'note' ? styles.note : styles.text,
    done && styles.done,
    dropped && styles.dropped,
    kind === 'migrated' && styles.moved, // 옮긴 줄은 끝난 줄처럼 조금 흐리게(오늘 장·언젠가 모두)
  ];
  // 밀린 거리 → 왼쪽에서 자라는 형광펜 띠의 폭, 오른쪽 버튼 칸의 폭
  const stripW = drag.interpolate({ inputRange: [0, FAR], outputRange: [0, FAR], extrapolate: 'clamp' });
  const buttonsW = drag.interpolate({ inputRange: [-FAR, 0], outputRange: [FAR, 0], extrapolate: 'clamp' });
  // 칠하기 / 이미 칠했으면 지우개 / 다 찼으면 글 없는 흐린 띠(조금만 따라오고, 놓으면 토스트가 알린다)
  const stripLabel = blocked ? null : item.priority ? '형광펜 지우기' : '중요';

  // ⋯ 메뉴 항목. 오늘 장: 중요 · 미루기 · 안 하기 · 고치기, 언젠가: 오늘 할 일로 · 형광펜 · 고치기 · 안 하기
  const menuMark = canMark && (
    <Pressable
      accessibilityRole="button"
      disabled={markDisabled}
      accessibilityState={{ disabled: markDisabled }}
      style={dimPressed(styles.menuItem)}
      onPress={pick(togglePriority)}
    >
      <View style={styles.swatch} />
      <Txt style={[styles.menuText, markDisabled && styles.menuDisabled]}>
        {item.priority ? '중요 표시 지우기' : markDisabled ? '중요 표시는 하루 3개까지예요' : '중요 표시하기'}
      </Txt>
    </Pressable>
  );
  // 끝나지 않은 할 일만. 미루기는 날짜를 고르는 시트를 열고, 오늘 줄은 › 옮긴 일로 남아 고른 날 장에 새 줄이 생긴다.
  // 언젠가의 '오늘 할 일로'는 묻지 않고 바로 옮긴다
  const menuPostpone = canMark && (
    <Pressable
      accessibilityRole="button"
      style={dimPressed(styles.menuItem)}
      // 메뉴(Modal)가 다 내려간 뒤에 시트(Modal)를 띄운다. 겹쳐 띄우면 iOS가 시트를 띄우지 못할 수 있다
      onPress={pick(() => (someday ? onPostpone(id) : setTimeout(() => onPostpone(id), MENU_SHEET_DELAY)))}
    >
      <View style={styles.swatchText}>
        <StatusSymbol kind="migrated" size={14} />
      </View>
      <Txt style={styles.menuText}>{postponeLabel}</Txt>
    </Pressable>
  );
  // 안 하기: 지우지 않고 줄을 그어 남긴다. 되돌리려면 기호를 누르거나 메뉴의 '다시 하기'
  const menuDrop = canMark && (
    <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onDrop(id))}>
      <View style={styles.swatchText}>
        <StatusSymbol kind="dropped" size={14} />
      </View>
      <Txt style={styles.menuText}>안 하기</Txt>
    </Pressable>
  );
  // 메뉴가 닫힌 뒤 그 자리에서 고친다
  const menuEdit = (
    <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => edit('menu'))}>
      <Txt style={[styles.menuText, styles.swatchText]}>✎</Txt>
      <Txt style={styles.menuText}>고치기</Txt>
    </Pressable>
  );

  return (
    <Animated.View
      ref={row}
      style={[
        styles.row,
        menu.anchor !== null && styles.rowOpen,
        lifted && styles.lifted,
        { transform: [{ translateY: shiftY ?? 0 }, { scale: liftScale }] },
      ]}
      // 고치는 동안에는 입력칸을 스크린 리더가 따로 읽도록 줄을 한 요소로 묶지 않는다
      accessible={!editing}
      accessibilityRole={advance ? 'button' : undefined}
      accessibilityLabel={itemA11yLabel(item, place)}
      accessibilityHint={itemA11yHint(item, place)}
      accessibilityActions={actions}
      onAccessibilityAction={onAction}
      onTouchStart={() => openRow.touch(id)}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        reorder?.measure(id, e.nativeEvent.layout.height);
      }}
    >
      {swipe.mark && (
        <Animated.View
          pointerEvents="none"
          style={[styles.strip, (blocked || item.priority) && styles.stripErase, zone === 'mark' && styles.stripArmed, { width: stripW }]}
        >
          {stripLabel && (
            <Txt numberOfLines={1} style={styles.stripText}>
              {stripLabel}
            </Txt>
          )}
        </Animated.View>
      )}
      <Animated.View style={[styles.buttons, { width: buttonsW }]}>
        {swipe.left.includes('postpone') && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="미루기"
            accessibilityHint="언제로 미룰지 골라요"
            style={dimPressed([styles.button, styles.postpone, zone === 'delete' && styles.buttonGone])}
            onPress={tapAction(() => onPostpone(id))}
          >
            <StatusSymbol kind="migrated" size={14} />
            <Txt numberOfLines={1} style={styles.buttonText}>
              미루기
            </Txt>
          </Pressable>
        )}
        {/* 언젠가: 이 줄을 오늘 장에 옮겨 적는다(› 옮긴 일로 남는다) */}
        {swipe.left.includes('today') && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="오늘 할 일로"
            accessibilityHint="오늘 장에 옮겨 적어요"
            style={dimPressed([styles.button, styles.postpone, { flexGrow: actionSpan('today') }, zone === 'delete' && styles.buttonGone])}
            onPress={tapAction(() => onPostpone(id))}
          >
            <StatusSymbol kind="migrated" size={14} />
            <Txt numberOfLines={1} style={styles.buttonText}>
              오늘 할 일로
            </Txt>
          </Pressable>
        )}
        {swipe.left.includes('drop') && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="안 하기"
            style={dimPressed([styles.button, styles.drop, zone === 'delete' && styles.buttonGone])}
            onPress={tapAction(() => onDrop(id))}
          >
            <StatusSymbol kind="dropped" size={14} />
            <Txt numberOfLines={1} style={styles.buttonText}>
              안 하기
            </Txt>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지우기"
          style={dimPressed([styles.button, styles.remove])}
          onPress={tapAction(() => onDelete(id))}
        >
          <Txt style={[styles.buttonText, styles.onDanger]}>×</Txt>
          <Txt numberOfLines={1} style={[styles.buttonText, styles.onDanger]}>
            지우기
          </Txt>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.front, { transform: [{ translateX: drag }] }]}>
          <View style={[styles.main, roomy && styles.mainWide]}>
            {/* 상태는 기호만 눌러 바꾼다 */}
            {advance ? (
              <Pressable
                style={tintPressed([styles.symbol, { height: lineH }])}
                hitSlop={SYMBOL_SLOP}
                onPress={unlessOpen(() => onAdvance(id))}
              >
                <StatusSymbol kind={kind} />
              </Pressable>
            ) : (
              <View style={[styles.symbol, { height: lineH }]}>
                <StatusSymbol kind={kind} />
              </View>
            )}
            {editing ? (
              // 글과 같은 글꼴·크기·줄 높이·색이라 눌러도 자리가 움직이지 않는다. 완료나 다른 곳을 누르면 저장한다
              <View style={styles.body}>
                <TextInput
                  ref={input}
                  style={[txtStyle(k, variant, textStyle), styles.input]}
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus={editing === 'tap'}
                  onFocus={() => input.current?.setSelection(draft.length, draft.length)}
                  multiline
                  scrollEnabled={false}
                  lineBreakStrategyIOS="hangul-word"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  maxLength={MAX_TEXT}
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={finishEdit}
                  onBlur={finishEdit}
                  accessibilityLabel="고치기"
                />
              </View>
            ) : (
              // 글을 누르면 그 자리에서 고치고, 길게 누르면 ⋯와 같은 메뉴가 뜬다
              <Pressable
                accessible={false}
                style={styles.body}
                onPress={unlessOpen(() => edit())}
                // 끌 수 있는 줄은 길게 누르기를 끌기(liftPan)가 맡는다: 움직이지 않고 놓으면 거기서 메뉴를 연다.
                // 여기서도 메뉴를 열면 끌기가 시작된 직후 메뉴(Modal)가 떠서 끌기가 취소된다
                onLongPress={canDrag ? undefined : openMenu}
              >
                <Highlight on={item.priority && (status === 'open' || status === 'doing')} animate={marked}>
                  <Txt variant={variant} style={textStyle}>
                    {item.text}
                  </Txt>
                </Highlight>
              </Pressable>
            )}
          </View>
          {/* 고치는 동안에는 자리만 지키고 누를 수 없다 */}
          <Pressable
            ref={menu.ref}
            accessibilityRole="button"
            accessibilityLabel={`${item.text}, 더보기`}
            accessibilityState={{ expanded: menu.anchor !== null }}
            accessibilityElementsHidden={!!editing}
            importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
            disabled={!!editing}
            style={dimPressed([styles.more, { height: moreH }, !!editing && styles.hidden])}
            onPress={unlessOpen(menu.open)}
          >
            <Txt style={styles.moreText}>⋯</Txt>
          </Pressable>
        </Animated.View>
      </GestureDetector>
      <Popover anchor={menu.anchor} align="right" width={220} label={`${item.text}, 메뉴`} onClose={menu.close}>
        {next && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onAdvance(id))}>
            <View style={styles.swatchText}>
              <StatusSymbol kind={next.to} size={14} />
            </View>
            <Txt style={styles.menuText}>{next.label}</Txt>
          </Pressable>
        )}
        {someday ? (
          <>
            {menuPostpone}
            {menuMark}
            {menuEdit}
            {menuDrop}
          </>
        ) : (
          <>
            {menuMark}
            {menuPostpone}
            {menuDrop}
            {menuEdit}
          </>
        )}
        {/* 묻지 않는다. 화면이 '되돌리기'를 잠깐 띄운다 */}
        <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onDelete(id))}>
          <Txt style={[styles.menuText, styles.danger, styles.swatchText]}>×</Txt>
          <Txt style={[styles.menuText, styles.danger]}>지우기</Txt>
        </Pressable>
      </Popover>
    </Animated.View>
  );
});

// 기호는 18pt지만 누르는 영역은 줄 높이(50)와 왼쪽 여백까지 넓혀 44pt를 넘긴다
const SYMBOL_SLOP = { top: 13, bottom: 13, left: 14, right: 8 };
// 메뉴(Modal)가 다 닫힌 뒤에 입력칸에 포커스를 준다. 닫히는 중에 주면 iOS가 포커스를 거둬 갈 수 있다
const MENU_FOCUS_DELAY = 350;
const MENU_SHEET_DELAY = 250;
// 길게 누르기: ⋯ 메뉴를 띄우던 기본 길게 누르기(500ms)보다 조금 빠르게 들어 올린다
const LIFT_MS = 350;
const LIFT_SCALE = 1.02;
const MOVE_SLOP = 6; // 이보다 덜 움직이고 놓으면 끌기가 아니라 메뉴

// 밀린 거리 → 띠·버튼 폭. 어떤 줄 폭보다도 넉넉한 끝값
const FAR = 4000;
const ERASER = '#EDE4D2'; // 메뉴가 열린 줄과 같은 옅은 종이색

const styles = StyleSheet.create({
  // 줄 노트처럼 줄마다 옅은 선을 긋는다. 여러 줄이면 첫 줄에 맞춰 위로 붙인다
  // 줄은 자르지 않는다(기호의 누르는 영역이 줄 밖까지 나간다). 밀려 나간 글은 공책 칸(page)이 자른다
  row: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ruled },
  rowOpen: { backgroundColor: ERASER }, // 메뉴가 열린 줄
  // 들어 올린 줄: 종이 한 장이 떠오른 것처럼 바탕을 칠하고 그림자를 드리운다(아래 줄의 선·여백선을 가린다)
  lifted: {
    backgroundColor: colors.paper,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  // 앞면(기호·글·⋯)은 투명해서 여백선이 비친다. 밀려 비운 자리에만 띠·버튼이 드러난다
  front: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  mainWide: { paddingVertical: ROW_PAD_WIDE },
  symbol: { width: 18, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'flex-start' },
  text: { fontSize: 16, lineHeight: 24, flexShrink: 1 },
  note: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 28, flexShrink: 1 },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  // 안 하기로 한 일: 끝낸 일보다 한 단계 더 흐리게 줄을 긋는다(16pt라 faint도 읽힌다)
  dropped: { color: colors.faint, textDecorationLine: 'line-through' },
  // 언젠가에서 오늘로 옮긴 줄: 지우지 않고 흐리게 남긴다
  moved: { color: colors.muted },
  // 입력칸의 기본 여백을 없애 글과 같은 자리에 글자가 놓이게 한다
  input: { alignSelf: 'stretch', padding: 0, paddingTop: 0, paddingBottom: 0, margin: 0 },
  hidden: { opacity: 0 },
  more: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, color: colors.faint },
  // 형광펜 띠: 줄 가운데에 마커 한 획처럼, 끝이 살짝 둥글다. 놓으면 칠해지는 거리부터 진해진다
  strip: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    backgroundColor: colors.highlight,
    opacity: 0.55,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  stripErase: { backgroundColor: ERASER },
  stripArmed: { opacity: 1 },
  stripText: { fontSize: 14, color: colors.inkSoft, paddingHorizontal: 10 },
  // 왼쪽으로 밀면 오른쪽 끝에서 드러나는 버튼들. 지우기가 맨 바깥이다
  buttons: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row', overflow: 'hidden' },
  button: { flexGrow: 1, flexBasis: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  buttonGone: { flexGrow: 0, width: 0 }, // 끝까지 밀면 지우기가 칸을 다 차지한다
  postpone: { backgroundColor: colors.endpaper },
  drop: { backgroundColor: colors.lineSoft },
  remove: { backgroundColor: colors.danger },
  buttonText: { fontSize: 14 },
  onDanger: { color: colors.onDark },
  menuItem: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 18, height: 8, backgroundColor: colors.highlight },
  swatchText: { width: 18, textAlign: 'center', alignItems: 'center' },
  menuText: { fontSize: 14 },
  menuDisabled: { color: colors.faint },
  danger: { color: colors.danger },
});
