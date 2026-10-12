// iOS 27은 UIScene 생명주기를 쓰지 않는 앱을 실행하자마자 멈춘다(UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// Expo SDK 57이 주는 ExpoAppSceneDelegate를 연결한다: Info.plist에 장면 설정을 넣고,
// AppDelegate는 창을 직접 만들지 않고 팩토리만 준비한다(창과 React Native 시작은 장면 대리자가 맡는다).
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: Swift AppDelegate만 지원합니다');
    }
    let src = cfg.modResults.contents;
    src = src.replace(
      /class AppDelegate: ExpoAppDelegate \{/,
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    // 창을 만들고 React Native를 시작하던 부분은 장면 대리자로 옮긴다
    const start = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n/;
    if (!src.includes('ExpoReactNativeFactoryProvider {')) {
      throw new Error('withSceneLifecycle: AppDelegate 클래스 선언을 찾지 못했습니다');
    }
    if (start.test(src)) src = src.replace(start, '\n');
    else if (src.includes('UIWindow(frame:')) {
      throw new Error('withSceneLifecycle: AppDelegate의 창 생성 코드를 찾지 못했습니다');
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
