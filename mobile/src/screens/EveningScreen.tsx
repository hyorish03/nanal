import { Text } from 'react-native';
import type { Db } from '../db/types';

type Props = { db: Db; version: number; onChanged: () => void; onClose: () => void };

export function EveningScreen(_props: Props) {
  return <Text>저녁</Text>;
}
