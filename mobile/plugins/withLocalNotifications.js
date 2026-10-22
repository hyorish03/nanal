// 나날의 알림은 기기 안에서 예약하는 로컬 알림뿐이다(원격 푸시 없음).
// expo-notifications를 설치하면 Expo가 그 플러그인을 저절로 적용해 iOS에 원격 푸시 권한(aps-environment)을 넣는다.
// 그러면 서명 프로필에 Push 기능이 필요해지므로 iOS에서는 그 권한을 다시 뺀다(로컬 알림은 권한 없이 된다).
// Android는 알림 아이콘(흰 실루엣)과 색을 넣는다.
const { withEntitlementsPlist } = require('expo/config-plugins');
const { withNotificationsAndroid } = require('expo-notifications/plugin/build/withNotificationsAndroid');

module.exports = function withLocalNotifications(config) {
  config = withNotificationsAndroid(config, { icon: './assets/android-icon-monochrome.png', color: '#1E2F4D', sounds: [] });
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
