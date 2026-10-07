// 종이 다이어리 색과 글꼴(스펙 11.1). 화면은 여기 값만 쓴다.
export const colors = {
  paper: '#F6F0E4', // 화면 배경(크림 종이)
  paperEvening: '#F3EBDA', // 저녁 마무리 배경
  card: '#FBF7EE', // 회고 카드, 칩
  popover: '#FFFDF8',
  chipSelected: '#EDE4D2',
  ink: '#2A2520', // 먹색 글씨
  inkSoft: '#4A4234',
  muted: '#6E6456',
  faint: '#8A8070',
  line: '#B9AC96',
  lineSoft: '#D8CDB9',
  lineFaint: '#E4DACA',
  ruled: '#DCD1BE', // 줄 노트 선
  navy: '#1E2F4D', // 키 컬러, 표지, 손글씨
  navyDeep: '#0B1424',
  coverText: '#E9DFC8',
  highlight: '#F1DE8A', // 형광펜
  postit: '#F3E4A8',
  postitText: '#6B5D3F',
  danger: '#9A2B1E',
  onDark: '#F6F0E4',
} as const;

export const fonts = {
  title: 'GowunBatang_400Regular',
  body: 'IBMPlexSansKR_400Regular',
  medium: 'IBMPlexSansKR_500Medium',
  hand: 'NanumPenScript_400Regular',
} as const;

export const HIT = 44; // 최소 터치 크기
export const SCREEN_X = 22; // 화면 좌우 여백
