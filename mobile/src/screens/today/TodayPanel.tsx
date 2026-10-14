import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { LayoutAnimation, ScrollView, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../ui/useReduceMotion';
import type { Item } from '../../items/repo';
import { colors } from '../../ui/theme';
import { Txt } from '../../ui/Txt';
import { useSpace } from '../../ui/typeScale';
import { PostIt, type SettleHow } from './PostIt';
import { SymbolLegend } from './SymbolLegend';

export const PANEL_W = 300;
const LEGEND_KEY = 'nanal.legendCollapsed'; // 기호 설명을 접어 둔 채로 기억한다

type Props = {
  candidates: Item[];
  onSettle: (item: Item, how: SettleHow) => Promise<boolean>;
  onSettleAll: () => Promise<boolean>;
  done: number; // 오늘 끝낸 할 일
  total: number; // 오늘 할 일(넘긴 일은 빼고)
};

// 넓은 창(wide)에서 오늘 공책 오른쪽에 붙는 칸. 넘어온 일 포스트잇과 오늘 끝낸 일 수, 기호 설명을 펴 둔다.
// 그래서 가운데 공책에는 입력칸과 목록만 남는다.
export function TodayPanel({ candidates, onSettle, onSettleAll, done, total }: Props) {
  const s = useSpace();
  const reduce = useReduceMotion();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LEGEND_KEY)
      .then((v) => setCollapsed(v === '1'))
      .catch(() => {});
  }, []);
  const toggle = () => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setCollapsed((c) => {
      AsyncStorage.setItem(LEGEND_KEY, c ? '0' : '1').catch(() => {});
      return !c;
    });
  };
  return (
    <ScrollView style={styles.panel} contentContainerStyle={[styles.content, { gap: s.xl, paddingBottom: s.xl }]}>
      <View accessible accessibilityLabel={total > 0 ? `오늘 할 일 ${total}개 중 ${done}개를 끝냈어요` : '오늘 할 일이 아직 없어요'}>
        <Txt variant="hand">오늘 끝낸 일</Txt>
        <Txt variant="display">
          {done}
          <Txt variant="h2" style={styles.total}>
            {` / ${total}`}
          </Txt>
        </Txt>
      </View>
      {candidates.length > 0 && <PostIt candidates={candidates} onSettle={onSettle} onSettleAll={onSettleAll} />}
      <View style={styles.legend}>
        <SymbolLegend collapsed={collapsed} onToggle={toggle} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { width: PANEL_W, flexGrow: 0 },
  content: { paddingTop: 4 },
  total: { color: colors.muted },
  // 기호 설명은 공책 밖에 끼워 둔 카드
  legend: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, paddingBottom: 10 },
});
