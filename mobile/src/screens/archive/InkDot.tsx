import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { inkLevel } from '../../days/moods';
import { colors } from '../../ui/theme';

// 살짝 일그러진 둥근 잉크 자국(24×24 기준)
const BLOT = 'M12.3 2.4C17.4 2.2 21.6 6.1 21.5 11.6C21.4 16.9 17.5 21.6 12 21.5C6.7 21.6 2.4 17.6 2.5 12.2C2.4 6.9 6.8 2.6 12.3 2.4Z';

type Props = {
  mood: number | null; // 없으면 빈 자리만
  min: number; // 기분 1일 때 지름
  max: number; // 기분 5일 때 지름. 자리는 늘 이만큼 잡아 칸마다 줄이 어긋나지 않는다
};

// 달력 칸의 기분 표시. 좋은 날일수록 크고 진한 잉크 자국, 힘든 날은 작고 옅은 자국.
export function InkDot({ mood, min, max }: Props) {
  const level = mood === null ? null : inkLevel(mood);
  const size = level === null ? 0 : Math.round(min + (max - min) * level);
  return (
    <View accessible={false} style={{ width: max, height: max, alignItems: 'center', justifyContent: 'center' }}>
      {level !== null && (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
          <Path d={BLOT} fill={colors.navy} fillOpacity={0.35 + 0.65 * level} />
        </Svg>
      )}
    </View>
  );
}
