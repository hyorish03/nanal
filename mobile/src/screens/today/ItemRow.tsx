import { memo, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import type { ItemKind, TaskStatus } from '../../items/repo';
import { promptText } from '../../ui/dialogs';
import { Highlight } from '../../ui/Highlight';
import { Popover, useAnchor } from '../../ui/Popover';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { advanceAction, canAdvance, itemA11yHint, itemA11yLabel, symbolKind } from '../../ui/symbols';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { dimPressed, tintPressed } from '../../ui/press';
import { useTextScale } from '../../ui/typeScale';
import { ROW_PAD_WIDE, ruleGapFor } from './NotebookPage';

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
  onEdit: (id: string, text: string) => void;
  onPostpone: (id: string) => void;
  onDelete: (id: string) => void;
};

export const ItemRow = memo(function ItemRow({ id, kind: itemKind, text, status, priority, priorityFull, onAdvance, onTogglePriority, onEdit, onPostpone, onDelete }: Props) {
  const menu = useAnchor();
  // 넓은 배치에서는 글자가 커진 만큼 줄 높이도 공책 줄 간격(useRuleGap)에 맞춰 넓힌다
  const k = useTextScale();
  const roomy = k.wide ? { line: Math.round(24 * k.ownScale), gap: ruleGapFor(k) } : null;
  const item = { kind: itemKind, status, priority, text };
  const kind = symbolKind(item);
  const advance = canAdvance(item);
  const markDisabled = !item.priority && priorityFull;
  const done = kind === 'done';
  const [marked, setMarked] = useState(false); // 이 줄에 방금 형광펜을 칠했다(그때만 긋는 애니메이션)
  const next = advanceAction(item);
  const canMark = item.kind === 'task' && (status === 'open' || status === 'doing');
  // 메뉴를 닫고 고른 일을 한다
  const pick = (fn: () => void) => () => {
    menu.close();
    fn();
  };
  const togglePriority = () => {
    setMarked(!item.priority);
    onTogglePriority(id, !item.priority);
  };
  const edit = () => promptText('고치기', text, (edited) => onEdit(id, edited));

  // 스크린 리더에서는 줄 하나가 한 요소다. 두 번 누르면 상태가 넘어가고, 나머지는 동작 목록(위아래로 쓸기)에 있다
  const actions = [
    ...(advance ? [{ name: 'activate' }, { name: 'advance', label: '상태 바꾸기' }] : []),
    ...(canMark && !markDisabled ? [{ name: 'priority', label: item.priority ? '중요 표시 지우기' : '중요 표시하기' }] : []),
    ...(canMark ? [{ name: 'postpone', label: '내일로 미루기' }] : []),
    { name: 'edit', label: '고치기' },
    { name: 'delete', label: '지우기' },
  ];
  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate' || name === 'advance') onAdvance(id);
    else if (name === 'priority') togglePriority();
    else if (name === 'postpone') onPostpone(id);
    else if (name === 'edit') edit();
    else if (name === 'delete') onDelete(id);
  };

  return (
    <View
      style={[styles.row, menu.anchor !== null && styles.rowOpen]}
      accessible
      accessibilityRole={advance ? 'button' : undefined}
      accessibilityLabel={itemA11yLabel(item)}
      accessibilityHint={itemA11yHint(item)}
      accessibilityActions={actions}
      onAccessibilityAction={onAction}
    >
      <View style={[styles.main, roomy && styles.mainWide]}>
        {/* 상태는 기호만 눌러 바꾼다. 글 자리는 비워 둔다(나중에 눌러서 고치기) */}
        {advance ? (
          <Pressable style={tintPressed([styles.symbol, roomy && { height: roomy.line }])} hitSlop={SYMBOL_SLOP} onPress={() => onAdvance(id)}>
            <StatusSymbol kind={kind} />
          </Pressable>
        ) : (
          <View style={[styles.symbol, roomy && { height: roomy.line }]}>
            <StatusSymbol kind={kind} />
          </View>
        )}
        {/* 글을 길게 누르면 ⋯와 같은 메뉴가 뜬다 */}
        <Pressable accessible={false} style={styles.body} onLongPress={menu.open}>
          <Highlight on={item.priority && !done} animate={marked}>
            <Txt
              variant={kind === 'note' ? 'hand' : 'body'}
              style={[kind === 'note' ? styles.note : styles.text, done && styles.done]}
            >
              {item.text}
            </Txt>
          </Highlight>
        </Pressable>
      </View>
      <Pressable
        ref={menu.ref}
        accessibilityRole="button"
        accessibilityLabel={`${item.text}, 더보기`}
        accessibilityState={{ expanded: menu.anchor !== null }}
        style={dimPressed([styles.more, roomy && { height: roomy.gap }])}
        onPress={menu.open}
      >
        <Txt style={styles.moreText}>⋯</Txt>
      </Pressable>
      <Popover anchor={menu.anchor} align="right" width={220} label={`${item.text}, 메뉴`} onClose={menu.close}>
        {next && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onAdvance(id))}>
            <View style={styles.swatchText}>
              <StatusSymbol kind={next.to} size={14} />
            </View>
            <Txt style={styles.menuText}>{next.label}</Txt>
          </Pressable>
        )}
        {canMark && (
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
        )}
        {/* 끝나지 않은 할 일만. 오늘 줄은 › 옮긴 일로 남고 내일 장에 새 줄이 생긴다 */}
        {canMark && (
          <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onPostpone(id))}>
            <View style={styles.swatchText}>
              <StatusSymbol kind="migrated" size={14} />
            </View>
            <Txt style={styles.menuText}>내일로 미루기</Txt>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          style={dimPressed(styles.menuItem)}
          onPress={pick(edit)}
        >
          <Txt style={[styles.menuText, styles.swatchText]}>✎</Txt>
          <Txt style={styles.menuText}>고치기</Txt>
        </Pressable>
        {/* 묻지 않는다. 화면이 '되돌리기'를 잠깐 띄운다 */}
        <Pressable accessibilityRole="button" style={dimPressed(styles.menuItem)} onPress={pick(() => onDelete(id))}>
          <Txt style={[styles.menuText, styles.danger, styles.swatchText]}>×</Txt>
          <Txt style={[styles.menuText, styles.danger]}>지우기</Txt>
        </Pressable>
      </Popover>
    </View>
  );
});

// 기호는 18pt지만 누르는 영역은 줄 높이(50)와 왼쪽 여백까지 넓혀 44pt를 넘긴다
const SYMBOL_SLOP = { top: 13, bottom: 13, left: 14, right: 8 };

const styles = StyleSheet.create({
  // 줄 노트처럼 줄마다 옅은 선을 긋는다. 여러 줄이면 첫 줄에 맞춰 위로 붙인다
  row: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ruled },
  rowOpen: { backgroundColor: '#EDE4D2' }, // 메뉴가 열린 줄
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  mainWide: { paddingVertical: ROW_PAD_WIDE },
  symbol: { width: 18, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'flex-start' },
  text: { fontSize: 16, lineHeight: 24, flexShrink: 1 },
  note: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 28, flexShrink: 1 },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  more: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, color: colors.faint },
  menuItem: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 18, height: 8, backgroundColor: colors.highlight },
  swatchText: { width: 18, textAlign: 'center', alignItems: 'center' },
  menuText: { fontSize: 14 },
  menuDisabled: { color: colors.faint },
  danger: { color: colors.danger },
});
