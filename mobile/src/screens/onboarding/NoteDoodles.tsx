import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../ui/theme';

// 노트 귀퉁이의 손그림(목업 Notes의 경로 그대로). 뜻은 장의 접근성 문구가 전하니 읽지 않는다.
// 크기는 목업 치수에 배율 s를 곱한다.

const RED = colors.noteRed;

export function Star({ s }: { s: number }) {
  return (
    <Svg width={26 * s} height={26 * s} viewBox="0 0 26 26" accessible={false}>
      <Path d="M13 2 L15 11 L24 13 L15 15 L13 24 L11 15 L2 13 L11 11 Z" fill="none" stroke={RED} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

// 아래 버튼을 가리키는 화살표는 화면이 짧으면 세로로만 줄여 버튼 위에서 멈춘다(촉은 모양 그대로).
// maxH는 화살표가 차지해도 되는 높이(px). 줄기의 y 좌표만 비율 k로 줄인다.
const squeeze = (s: number, baseH: number, maxH: number) => Math.min(1, Math.max(0.4, maxH / (baseH * s)));

// 첫 장: 아래 버튼 쪽으로 구불구불 내려가는 화살표
export function LongArrow({ s, maxH }: { s: number; maxH: number }) {
  const k = squeeze(s, 380, maxH);
  const y = (v: number) => Math.round(v * k * 10) / 10;
  return (
    <Svg width={140 * s} height={380 * s * k} viewBox={`0 0 140 ${y(380)}`} accessible={false}>
      <Path d={`M20 6 C 70 ${y(60)}, 10 ${y(140)}, 60 ${y(210)} S 120 ${y(300)}, 112 ${y(360)}`} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" />
      <Path d={`M100 ${y(362) - 14} L112 ${y(362)} L122 ${y(362) - 16}`} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 마지막 장: 책갈피 끈을 가리키는 화살표
export function UpArrow({ s }: { s: number }) {
  return (
    <Svg width={90 * s} height={110 * s} viewBox="0 0 90 110" accessible={false}>
      <Path d="M8 100 C 40 98, 66 70, 70 14" fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" />
      <Path d="M60 24 L70 12 L79 25" fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 마지막 장: 아래 버튼으로 내려가는 화살표
export function DownArrow({ s, maxH }: { s: number; maxH: number }) {
  const k = squeeze(s, 150, maxH);
  const y = (v: number) => Math.round(v * k * 10) / 10;
  return (
    <Svg width={80 * s} height={150 * s * k} viewBox={`0 0 80 ${y(150)}`} accessible={false}>
      <Path d={`M10 6 C 52 ${y(30)}, 70 ${y(80)}, 58 ${y(136)}`} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" />
      <Path d={`M47 ${y(138) - 14} L58 ${y(138)} L68 ${y(138) - 15}`} fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// 셋째 장: 아침·낮·저녁 아이콘을 잇는 점선
export function Timeline({ s }: { s: number }) {
  return (
    <Svg width={4 * s} height={252 * s} viewBox="0 0 4 252" accessible={false}>
      <Path d="M2 0 V252" stroke={RED} strokeWidth={1.4} strokeDasharray="3 5" strokeLinecap="round" />
    </Svg>
  );
}

const TIME_PATHS = {
  sun: (
    <>
      <Circle cx={14} cy={14} r={5.5} fill="none" stroke={RED} strokeWidth={1.6} />
      <Path
        d="M14 2.5V5.5M14 22.5V25.5M2.5 14H5.5M22.5 14H25.5M5.8 5.8L8 8M20 20L22.2 22.2M5.8 22.2L8 20M20 8L22.2 5.8"
        stroke={RED}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </>
  ),
  pencil: (
    <Path
      d="M7 21 L9 15 L19 5 L23 9 L13 19 Z M9 15 L13 19 M17 7 L21 11"
      fill="none"
      stroke={RED}
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),
  moon: <Path d="M18.5 4.5 A9.5 9.5 0 1 0 23.5 19 A7.5 7.5 0 0 1 18.5 4.5 Z" fill="none" stroke={RED} strokeWidth={1.6} strokeLinejoin="round" />,
};

// 점선 위에 얹는 아이콘. 종이색 동그라미가 뒤의 점선을 가린다
export function TimeIcon({ kind, s }: { kind: keyof typeof TIME_PATHS; s: number }) {
  return (
    <View style={[styles.disc, { width: 28 * s, height: 28 * s, borderRadius: 14 * s }]}>
      <Svg width={28 * s} height={28 * s} viewBox="0 0 28 28" accessible={false}>
        {TIME_PATHS[kind]}
      </Svg>
    </View>
  );
}

export function InkBottle({ s }: { s: number }) {
  return (
    <Svg width={34 * s} height={34 * s} viewBox="0 0 34 34" accessible={false}>
      <Path
        d="M12 6 H22 V10 C27 12 28 16 28 20 V27 C28 29 27 30 25 30 H9 C7 30 6 29 6 27 V20 C6 16 7 12 12 10 Z"
        fill="none"
        stroke={colors.navy}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M7 21 C12 19 20 23 27 20 V27 C27 28.5 26 29 25 29 H9 C8 29 7 28.5 7 27 Z" fill={colors.navy} opacity={0.85} />
    </Svg>
  );
}

// 마지막 장 위에서 늘어진 책갈피 끈
export function RibbonTab({ s }: { s: number }) {
  return (
    <Svg width={14 * s} height={150 * s} viewBox="0 0 14 150" accessible={false}>
      <Path d="M0 0H14V150L7 141L0 150Z" fill={colors.navy} />
    </Svg>
  );
}

// 기호 설명을 다시 여는 동그라미 친 i
export function InfoMark({ s }: { s: number }) {
  return (
    <Svg width={20 * s} height={20 * s} viewBox="0 0 20 20" accessible={false}>
      <Circle cx={10} cy={10} r={8.5} fill="none" stroke={colors.navy} strokeWidth={1.5} />
      <Path d="M10 9V14.5" stroke={colors.navy} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={10} cy={6} r={1.1} fill={colors.navy} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.paper },
});
