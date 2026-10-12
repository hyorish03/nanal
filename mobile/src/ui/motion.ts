import { Easing } from 'react-native';

// 공용 곡선. 기본 Easing.out(Easing.ease) 같은 약한 곡선 대신 이것만 쓴다.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1); // 나타나고 사라질 때
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1); // 화면 안에서 움직일 때
