import { MAC_TEXT_SCALE, ON_MAC } from '../../ui/desktop';

// Mac에서는 Txt가 글자를 키우므로, 글줄에 맞춰야 하는 상자·기호도 같은 비율로 키운다
export const textBox = (n: number) => (ON_MAC ? Math.round(n * MAC_TEXT_SCALE) : n);
