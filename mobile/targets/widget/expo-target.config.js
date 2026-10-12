/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'NanalWidget',
  displayName: '나날',
  bundleIdentifier: '.widget',
  // 잠금화면 위젯 안 버튼(AppIntent)은 iOS 17부터
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  colors: {
    $widgetBackground: '#F6F0E4',
    $accent: '#1E2F4D',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
