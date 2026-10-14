import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type SheetAction = { label: string; destructive?: boolean; onPress: () => void };

// iOS는 기본 액션 시트, 그 외는 Alert 버튼으로 같은 선택지를 보여준다.
export function showActionSheet(title: string, actions: SheetAction[]): void {
  if (Platform.OS === 'ios') {
    const destructive = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...actions.map((a) => a.label), '취소'],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      },
      (i) => actions[i]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...actions.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.onPress })),
    { text: '취소', style: 'cancel' as const },
  ]);
}

// 지우기 전에 한 번 묻는다(스펙 11.2, 11.8).
export function confirmDelete(title: string, message: string | undefined, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '지우기', style: 'destructive', onPress: onConfirm },
  ]);
}
