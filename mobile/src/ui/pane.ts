import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

// 오늘 아래 화면들이 놓이는 칸. 넓은 배치에서는 왼쪽 사이드바 오른쪽 칸이다(Main이 알려 준다).
// sidebar가 true면 사이드바가 오늘·하루 마무리·지난 기록 사이를 오가므로 '‹ 오늘' 같은 돌아가기는 숨긴다.
export type Pane = {
  sidebar: boolean;
  width: number; // 칸의 폭(안전 영역 제외). 칸을 둘로 나눌지 정할 때 창 폭 대신 이것을 본다
};

export const PaneContext = createContext<Pane | null>(null);

// Main 밖(온보딩·로그인 등)에서는 창 전체가 칸이다.
export function usePane(): Pane {
  const pane = useContext(PaneContext);
  const { width } = useWindowDimensions();
  return pane ?? { sidebar: false, width };
}
