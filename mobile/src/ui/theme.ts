import type { TextStyle } from 'react-native';

// 종이 다이어리 색과 글꼴(스펙 11.1). 화면은 여기 값만 쓴다.
export const colors = {
  paper: '#F6F0E4', // 화면 배경(크림 종이)
  paperEvening: '#F3EBDA', // 하루 마무리 배경
  card: '#FBF7EE', // 회고 카드, 칩
  popover: '#FFFDF8',
  chipSelected: '#EDE4D2',
  chipBorder: '#B9AC96',
  ink: '#2A2520', // 먹색 글씨
  inkSoft: '#4A4234',
  muted: '#6E6456',
  faint: '#8A8070', // 14pt보다 작은 글씨에는 쓰지 않는다(대비 부족). 작은 글씨는 muted
  line: '#B9AC96',
  lineSoft: '#D8CDB9',
  lineFaint: '#E4DACA',
  ruled: '#DCD1BE', // 줄 노트 선
  marginRule: '#E2B9A6', // 노트 왼쪽 여백 붉은 선
  dotOff: '#C9BCA5', // 꺼진 점(쪽 표시)
  navy: '#1E2F4D', // 키 컬러, 표지, 손글씨
  navyDeep: '#0B1424',
  coverText: '#E9DFC8',
  coverFrame: 'rgba(233, 223, 200, 0.45)', // 표지 테두리 선
  coverRule: 'rgba(233, 223, 200, 0.7)',
  coverSub: 'rgba(233, 223, 200, 0.85)', // 표지 부제
  coverFooter: 'rgba(233, 223, 200, 0.6)',
  pages: '#EFE6D3', // 표지 아래 속지 묶음
  pageEdge: '#DCD0BA',
  endpaper: '#E8DDC7', // 표지 안쪽 면지
  endpaperEdge: '#D6C9B0',
  highlight: '#F1DE8A', // 형광펜. 뜻은 '중요' 하나뿐이다(선택 표시에 쓰지 않는다)
  tape: 'rgba(214, 194, 146, 0.7)', // 종이 테이프
  postit: '#F3E4A8',
  postitText: '#6B5D3F',
  shadow: '#503C1E', // 종이 그림자(갈색 기운)
  pressTint: 'rgba(42, 37, 32, 0.05)', // 누르는 동안 종이에 지는 그늘
  inkDash: 'rgba(42, 37, 32, 0.25)', // 점선 구분선
  danger: '#9A2B1E',
  onDark: '#F6F0E4',
} as const;

export const fonts = {
  title: 'GowunBatang_400Regular',
  body: 'IBMPlexSansKR_400Regular',
  medium: 'IBMPlexSansKR_500Medium',
  hand: 'NanumPenScript_400Regular',
} as const;

// 글자 크기·줄 높이. 제목은 고운바탕, 본문은 플렉스, 손글씨는 나눔펜.
export const type = {
  display: { fontFamily: fonts.title, fontSize: 30, lineHeight: 38 },
  h2: { fontFamily: fonts.title, fontSize: 22, lineHeight: 30 },
  handLg: { fontFamily: fonts.hand, fontSize: 26, lineHeight: 32 },
  hand: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
} as const satisfies Record<string, TextStyle>;

// 간격 눈금
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const HIT = 44; // 최소 터치 크기
export const SCREEN_X = 24; // 화면 좌우 여백
