import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL } from '../lib/links';
import { dimPressed } from './press';
import { colors, HIT } from './theme';
import { Txt } from './Txt';

// 앱 밖 주소를 연다. 열 수 없으면(메일 앱이 없는 등) 주소를 보여 준다
async function openOrShow(url: string, fallback: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('열지 못했어요', fallback);
  }
}

export const openPrivacy = () => openOrShow(PRIVACY_URL, PRIVACY_URL);
export const openSupport = () => openOrShow(SUPPORT_URL, `${SUPPORT_EMAIL}로 메일을 보내 주세요`);

type Props = {
  onDeleteAccount?: () => void; // 있으면 줄 끝에 붙인다(계정 시트)
  compact?: boolean; // 사이드바: 글자를 조금 작게, 왼쪽 정렬
};

// 계정 시트·사이드바 아래 작은 링크 한 줄: 개인정보 처리방침 · 문의하기 (· 계정 삭제)
export function AccountLinks({ onDeleteAccount, compact = false }: Props) {
  const text = compact ? styles.textCompact : styles.text;
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable accessibilityRole="link" style={dimPressed(styles.link)} onPress={openPrivacy}>
        <Txt style={text}>개인정보 처리방침</Txt>
      </Pressable>
      <Txt style={styles.dot} accessible={false}>
        ·
      </Txt>
      <Pressable accessibilityRole="link" accessibilityHint="메일 앱이 열려요" style={dimPressed(styles.link)} onPress={openSupport}>
        <Txt style={text}>문의하기</Txt>
      </Pressable>
      {onDeleteAccount && (
        <>
          <Txt style={styles.dot} accessible={false}>
            ·
          </Txt>
          {/* 되돌릴 수 없는 일이라 작고 조용하게, 누르면 한 번 더 묻는다 */}
          <Pressable accessibilityRole="button" style={dimPressed(styles.link)} onPress={onDeleteAccount}>
            <Txt style={[text, styles.danger]}>계정 삭제</Txt>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  rowCompact: { justifyContent: 'flex-start', marginLeft: -6 },
  link: { minHeight: HIT, paddingHorizontal: 6, justifyContent: 'center' },
  text: { fontSize: 14, color: colors.inkSoft, textDecorationLine: 'underline' },
  textCompact: { fontSize: 12, color: colors.inkSoft, textDecorationLine: 'underline' },
  danger: { color: colors.danger },
  dot: { color: colors.faint },
});
