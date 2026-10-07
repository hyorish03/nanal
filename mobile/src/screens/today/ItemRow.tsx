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
