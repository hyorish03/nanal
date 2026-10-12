import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ItemKind, TaskStatus } from '../../items/repo';
import { deleteQuestion } from '../../lib/josa';
import { confirmDelete } from '../../ui/dialogs';
import { Highlight } from '../../ui/Highlight';
import { Popover, useAnchor } from '../../ui/Popover';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { canAdvance, itemA11yLabel, symbolKind } from '../../ui/symbols';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { dimPressed, tintPressed } from '../../ui/press';

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
  onDelete: (id: string) => void;
};

export const ItemRow = memo(function ItemRow({ id, kind: itemKind, text, status, priority, priorityFull, onAdvance, onTogglePriority, onDelete }: Props) {
  const menu = useAnchor();
  const item = { kind: itemKind, status, priority, text };
  const kind = symbolKind(item);
  const advance = canAdvance(item);
  const markDisabled = !item.priority && priorityFull;
  const done = kind === 'done';
  const [marked, setMarked] = useState(false); // 이 줄에 방금 형광펜을 칠했다(그때만 긋는 애니메이션)

  return (
    <View style={[styles.row, menu.anchor !== null && styles.rowOpen]}>
      <View style={styles.main}>
        {/* 상태는 기호만 눌러 바꾼다. 글 자리는 비워 둔다(나중에 눌러서 고치기) */}
        {advance ? (
          <Pressable
            style={tintPressed(styles.symbol)}
            hitSlop={SYMBOL_SLOP}
            accessibilityRole="button"
            accessibilityLabel={itemA11yLabel(item)}
            onPress={() => onAdvance(id)}
          >
            <StatusSymbol kind={kind} />
          </Pressable>
        ) : (
          <View style={styles.symbol} accessible accessibilityLabel={itemA11yLabel(item)}>
            <StatusSymbol kind={kind} />
          </View>
        )}
        <Highlight on={item.priority && !done} animate={marked}>
          <Txt
            variant={kind === 'note' ? 'hand' : 'body'}
            style={[kind === 'note' ? styles.note : styles.text, done && styles.done]}
          >
            {item.text}
          </Txt>
        </Highlight>
      </View>
      <Pressable
        ref={menu.ref}
        accessibilityRole="button"
        accessibilityLabel={`${item.text} 더보기`}
        accessibilityState={{ expanded: menu.anchor !== null }}
        style={dimPressed(styles.more)}
        onPress={menu.open}
      >
        <Txt style={styles.moreText}>⋯</Txt>
      </Pressable>
      <Popover anchor={menu.anchor} align="right" width={220} label={`${item.text} 메뉴`} onClose={menu.close}>
        {item.kind === 'task' && !done && (
          <Pressable
            accessibilityRole="menuitem"
            disabled={markDisabled}
            accessibilityState={{ disabled: markDisabled }}
            style={dimPressed(styles.menuItem)}
            onPress={() => {
              menu.close();
              setMarked(!item.priority);
              onTogglePriority(id, !item.priority);
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
          style={dimPressed(styles.menuItem)}
          onPress={() => {
            menu.close();
            confirmDelete('항목 지우기', deleteQuestion(item.text), () => onDelete(id));
          }}
        >
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
  symbol: { width: 18, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, lineHeight: 24, flexShrink: 1 },
  note: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 28, flexShrink: 1 },
  done: { color: colors.faint, textDecorationLine: 'line-through' },
  more: { width: 44, height: 50, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 18, color: colors.faint },
  menuItem: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 18, height: 8, backgroundColor: colors.highlight },
  swatchText: { width: 18, textAlign: 'center' },
  menuText: { fontSize: 14 },
  menuDisabled: { color: colors.faint },
  danger: { color: colors.danger },
});
