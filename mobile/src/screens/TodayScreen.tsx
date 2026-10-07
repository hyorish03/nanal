import { Text } from 'react-native';
import type { Db } from '../db/types';

type Props = { db: Db; version: number; onChanged: () => void; onOpenEvening: () => void };

export function TodayScreen(_props: Props) {
  return <Text>오늘</Text>;
}
