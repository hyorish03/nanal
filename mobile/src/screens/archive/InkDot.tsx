import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../ui/theme';
import { inkOpacity, inkSize } from './ink';

// 살짝 일그러진 잉크 번짐(24×24 기준). 가로가 조금 넓고 가장자리가 고르지 않다.
const BLOT =
  'M12.6 3.1C15.9 2.6 19.6 4.0 21.2 7.2C22.6 10.0 22.2 13.9 20.4 16.6C18.5 19.5 15.1 21.2 11.7 20.9C8.1 20.7 4.6 19.0 3.0 15.9C1.7 13.2 1.9 9.6 3.6 7.0C5.4 4.4 9.0 3.5 12.6 3.1Z';

type Props = {
  mood: number | null; // 없으면 잉크 없이 자리만
  min: number; // 기분 1일 때 지름
  max: number; // 기분 5일 때 지름. 자리는 늘 이만큼 잡아 칸마다 줄이 어긋나지 않는다
  children?: ReactNode; // 잉크 위에 얹는 날짜 숫자
};

// 달력 칸의 기분 표시. 날짜 뒤에 잉크가 번진다. 좋은 날일수록 크고 진하게, 힘든 날은 작고 옅게.
// 숫자 색(가장 진한 날은 밝게)은 부르는 쪽이 inkNeedsLightText로 고른다.
export function InkDot({ mood, min, max, children }: Props) {
  // 칸이 잉크보다 좁으면(좁은 창 등) 칸 폭에 맞춰 함께 줄인다
  const [room, setRoom] = useState(max);
  const fit = Math.min(1, room / max);
  const size = mood === null ? 0 : Math.round(inkSize(mood, min, max) * fit);
  return (
    <View
      accessible={false}
      onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', minHeight: Math.round(max * fit), alignItems: 'center', justifyContent: 'center' }}
    >
      {mood !== null && (
        <Svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          accessible={false}
          pointerEvents="none"
          style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -size / 2, marginLeft: -size / 2 }}
        >
          <Path d={BLOT} fill={colors.navy} fillOpacity={inkOpacity(mood)} />
        </Svg>
      )}
      {children}
    </View>
  );
}
