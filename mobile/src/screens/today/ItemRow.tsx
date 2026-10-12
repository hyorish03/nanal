import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Item } from '../../items/repo';
import { deleteQuestion } from '../../lib/josa';
import { confirmDelete } from '../../ui/dialogs';
import { Highlight } from '../../ui/Highlight';
import { Popover, useAnchor } from '../../ui/Popover';
import { StatusSymbol } from '../../ui/StatusSymbol';
import { canAdvance, itemA11yLabel, symbolKind } from '../../ui/symbols';
import { colors, fonts } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { dimPressed, tintPressed } from '../../ui/press';

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
  const [marked, setMarked] = useState(false); // 이 줄에 방금 형광펜을 칠했다(그때만 긋는 애니메이션)

  return (
    <View style={[styles.row, menu.anchor !== null && styles.rowOpen]}>
      <Pressable
        style={tintPressed(styles.main)}
        disabled={!advance}
        accessibilityRole={advance ? 'button' : 'text'}
        accessibilityLabel={itemA11yLabel(item)}
        onPress={onAdvance}
      >
        <View style={styles.symbol}>
          <StatusSymbol kind={kind} />
        </View>
        <Highlight on={item.priority && !done} animate={marked}>
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
          style={dimPressed(styles.menuItem)}
          onPress={() => {
            menu.close();
            confirmDelete('항목 지우기', deleteQuestion(item.text), onDelete);
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
  // 줄 노트처럼 줄마다 옅은 선을 긋는다. 여러 줄이면 첫 줄에 맞춰 위로 붙인다
  row: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ruled },
  rowOpen: { backgroundColor: '#EDE4D2' }, // 메뉴가 열린 줄
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  symbol: { width: 18, height: 24, alignItems: 'center', justifyContent: 'center' },
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
