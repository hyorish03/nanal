import { requireOptionalNativeModule } from 'expo';

// 개발용·출시 빌드에만 음성 인식 네이티브 모듈이 있다. Expo Go에서는 false라 연필(글로 적기)을 쓴다.
export const voiceAvailable = requireOptionalNativeModule('ExpoSpeechRecognition') != null;
