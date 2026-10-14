import { View } from 'react-native';
import type { NoteMode, NoteStep } from './notebook';

// 자리표시. 노트 한 장(종이·줄·여백선·그 장의 손글씨 메모)을 width×height로 그린다.
export function NotePage(_: { step: NoteStep; mode: NoteMode; width: number; height: number }) {
  return <View style={{ flex: 1, backgroundColor: '#F6F0E4' }} />;
}
