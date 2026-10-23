import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Db } from '../db/types';
import { type Account, accountInitial, accountName, confirmDeleteAccount, confirmSignOut, NAME_MAX, saveAccountName, useAccount } from '../lib/account';
import { openPrivacy, openSupport } from '../lib/links';
import { NotificationSettings } from '../ui/NotificationSettings';
import { PageHeader } from '../ui/PageHeader';
import { SettingsGroup, settingsStyles } from '../ui/SettingsGroup';
import { Paper } from '../ui/Paper';
import { dimPressed, tintPressed } from '../ui/press';
import { useLayoutClass, WIDE } from '../ui/responsive';
import { macText } from '../ui/desktop';
import { colors, fonts, SLIM_H, SLIM_SLOP } from '../ui/theme';
import { Txt } from '../ui/Txt';

// 앱 버전 '1.0.1 (14)'
function versionLabel(): string {
  const c = Constants.expoConfig;
  const build = Platform.OS === 'ios' ? c?.ios?.buildNumber : c?.android?.versionCode?.toString();
  return [c?.version, build && `(${build})`].filter(Boolean).join(' ');
}

// 설정(스펙 "설정"): 프로필 카드 → 알림 → 정보 → 로그아웃·계정 삭제 카드. 아이폰은 오늘의 계정 버튼, 아이패드·Mac은 사이드바 맨 아래에서 연다
export function SettingsScreen({ db, onClose }: { db: Db; onClose: () => void }) {
  const account = useAccount();
  const centered = useLayoutClass() !== 'compact';
  return (
    <View style={styles.flex}>
      <Paper />
      <ScrollView contentContainerStyle={[styles.container, centered && styles.centered]}>
        <PageHeader title="설정" onBack={onClose} largeBack />

        <Profile account={account} />

        <NotificationSettings db={db} />

        <SettingsGroup label="정보">
          <Pressable accessibilityRole="link" style={tintPressed([settingsStyles.row, settingsStyles.line])} onPress={openPrivacy}>
            <Txt style={settingsStyles.rowText}>개인정보 처리방침</Txt>
            <Txt style={styles.chevron} accessible={false}>
              ›
            </Txt>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityHint="메일 앱이 열려요" style={tintPressed([settingsStyles.row, settingsStyles.line])} onPress={openSupport}>
            <Txt style={settingsStyles.rowText}>문의하기</Txt>
            <Txt style={styles.chevron} accessible={false}>
              ›
            </Txt>
          </Pressable>
          <View style={settingsStyles.row} accessible accessibilityLabel={`버전 ${versionLabel()}`}>
            <Txt style={settingsStyles.rowText}>버전</Txt>
            <Txt style={styles.muted}>{versionLabel()}</Txt>
          </View>
        </SettingsGroup>

        {/* 로그아웃과 계정 삭제는 맨 아래 한 카드에. 둘 다 누르면 한 번 더 묻는다 */}
        <SettingsGroup>
          <Pressable accessibilityRole="button" style={tintPressed([settingsStyles.row, settingsStyles.line])} onPress={() => void confirmSignOut(db)}>
            <Txt style={settingsStyles.rowText}>로그아웃</Txt>
          </Pressable>
          <Pressable accessibilityRole="button" style={tintPressed(settingsStyles.row)} onPress={() => confirmDeleteAccount(db)}>
            <Txt style={[settingsStyles.rowText, styles.danger]}>계정 삭제</Txt>
          </Pressable>
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

// 맨 위 프로필 카드: 아바타 · 이름(누르면 그 자리에서 고친다) · 이메일. 고치는 동안 오른쪽에 "저장"이 온다.
// 저장에 실패하면 고치던 칸을 그대로 두고 알린다
function Profile({ account }: { account: Account }) {
  const [draft, setDraft] = useState<string | null>(null); // 고치는 중인 이름
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false); // 키보드를 내리면(blur) 저장하고, "저장"을 눌러도 저장한다: 두 번 보내지 않게
  const name = accountName(account);

  // 고친 이름을 저장한다. 그대로면 보내지 않는다. 키보드를 내리거나 다른 곳을 누르면 저장된다
  const save = async () => {
    if (draft === null || inFlight.current) return;
    if (draft.trim() === (account.name ?? '')) {
      setDraft(null);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await saveAccountName(draft);
      setDraft(null);
    } catch {
      Alert.alert('이름을 바꾸지 못했어요', '인터넷 연결을 확인한 뒤 다시 해 주세요.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.profile}>
      <View style={styles.avatar} accessible={false}>
        <Txt variant="title" style={styles.avatarText}>
          {accountInitial(account)}
        </Txt>
      </View>
      <View style={styles.flexText}>
        {draft === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`이름, ${name}`}
            accessibilityHint="눌러서 고칠 수 있어요"
            style={dimPressed(styles.nameButton)}
            onPress={() => setDraft(account.name ?? '')}
          >
            <Txt variant="medium" style={styles.name} numberOfLines={1}>
              {name}
            </Txt>
            <PencilIcon />
          </Pressable>
        ) : (
          <TextInput
            style={macText(styles.nameInput)}
            accessibilityLabel="뭐라고 부를까요?"
            placeholder={account.email?.split('@')[0] ?? '이름이나 별명'}
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            maxLength={NAME_MAX}
            autoFocus
            autoComplete="name"
            textContentType="nickname"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            onBlur={() => void save()}
          />
        )}
        <Txt style={styles.email} numberOfLines={1}>
          {account.email ?? '로그인한 계정'}
        </Txt>
      </View>
      {draft !== null && (
        // 보이는 버튼은 날씬하게, 누르는 자리는 hitSlop으로 44pt를 지킨다
        <Pressable accessibilityRole="button" hitSlop={SLIM_SLOP} style={dimPressed(styles.saveButton)} onPress={() => void save()}>
          <Txt style={styles.saveText}>{saving ? '저장 중…' : '저장'}</Txt>
        </Pressable>
      )}
    </View>
  );
}

function PencilIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none" accessible={false}>
      <Path d="M10.5 2.5l3 3L6 13H3v-3z" stroke={colors.muted} strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

const AVATAR = 52;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40, gap: 20 },
  centered: { width: '100%', maxWidth: WIDE.readingWidth + WIDE.pageX * 2, alignSelf: 'center', paddingHorizontal: WIDE.pageX },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineFaint, borderRadius: 14 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, lineHeight: 26, color: colors.onDark },
  flexText: { flex: 1, minWidth: 0 },
  name: { flexShrink: 1, fontSize: 18, lineHeight: 24, color: colors.ink },
  nameButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  nameInput: { height: 36, paddingHorizontal: 8, marginLeft: -8, borderBottomWidth: 1.5, borderBottomColor: colors.navy, fontSize: 18, fontFamily: fonts.medium, color: colors.ink },
  email: { fontSize: 13, lineHeight: 18, color: colors.muted },
  saveButton: { height: SLIM_H, paddingHorizontal: 14, borderRadius: SLIM_H / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13, color: colors.onDark },
  chevron: { fontSize: 20, color: colors.muted },
  muted: { fontSize: 15, color: colors.muted },
  danger: { color: colors.danger },
});
