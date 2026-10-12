import { Platform, type TextStyle } from 'react-native';

// 종이 다이어리 색과 글꼴(스펙 11.1). 화면은 여기 값만 쓴다.
export const colors = {
  paper: '#F6F0E4', // 화면 배경(크림 종이)
  paperEvening: '#F3EBDA', // 하루 마무리 배경
  card: '#FBF7EE', // 회고 카드, 칩
  popover: '#FFFDF8',
  chipSelected: '#EDE4D2',
  // 고르지 않은 칩 테두리. 누를 수 있는 것의 경계라 WCAG 1.4.11(비텍스트 대비) 3:1을 넘겨야 한다.
  // 종이 #F6F0E4 대비 3.15:1, 저녁 종이 #F3EBDA 대비 3.02:1, 카드 #FBF7EE 대비 3.35:1.
  // 저녁 종이까지 3:1을 넘는 가장 옅은 따뜻한 회갈색이다(예전 #B9AC96은 1.97:1).
  chipBorder: '#928670',
  ink: '#2A2520', // 먹색 글씨
  inkSoft: '#4A4234',
  muted: '#6E6456', // 작은 글씨·자리표시(placeholder)·보조 글씨는 이것. 종이 대비 5.11:1(AA)
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
  debossShadow: 'rgba(0, 0, 0, 0.35)', // 표지에 눌러 찍은 글자의 그늘
  debossLight: 'rgba(255, 255, 255, 0.12)', // 눌린 자국 아래 가장자리에 닿는 빛
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

// 글꼴은 app.json의 expo-font 플러그인으로 앱에 넣어 두어 실행하자마자 쓸 수 있다(불러오기를 기다리지 않는다).
// iOS는 TTF의 PostScript 이름으로, Android는 assets/fonts에 복사된 파일 이름으로 찾는다.
export const fonts = Platform.select({
  ios: {
    title: 'GowunBatang-Regular',
    body: 'IBMPlexSansKR-Regular',
    medium: 'IBMPlexSansKR-Medium',
    hand: 'NanumPen-Regular', // 나눔펜 TTF의 이름표는 'Nanum Pen'이다(NanumPenScript 아님)
  },
  default: {
    title: 'GowunBatang_400Regular',
    body: 'IBMPlexSansKR_400Regular',
    medium: 'IBMPlexSansKR_500Medium',
    hand: 'NanumPenScript_400Regular',
  },
});

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
