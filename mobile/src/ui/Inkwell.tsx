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
