import { Image, StyleSheet, View } from 'react-native';

// 256px 타일을 @2x로 두어 128pt마다 되풀이한다(알갱이가 화면에서 뭉개지지 않게)
const TEXTURES = {
  paper: require('../../assets/textures/paper@2x.png'),
  cloth: require('../../assets/textures/cloth@2x.png'),
};

const OPACITY = { paper: 0.035, cloth: 0.06 };

type Props = { texture?: keyof typeof TEXTURES; opacity?: number };

// 부모를 꽉 채우는 종이 결(또는 표지 천 결). 맨 앞 자식으로 두면 그 위에 내용이 놓인다. 누르기는 그대로 통과한다.
export function Paper({ texture = 'paper', opacity = OPACITY[texture] }: Props) {
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image source={TEXTURES[texture]} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity }]} />
    </View>
  );
}
