import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

// 256px 타일을 @2x로 두어 128pt마다 되풀이한다(알갱이가 화면에서 뭉개지지 않게)
const TEXTURES = {
  paper: require('../../assets/textures/paper.png'),
  cloth: require('../../assets/textures/cloth.png'),
};
const TILE = 128;

const OPACITY = { paper: 0.035, cloth: 0.06 };

type Props = { texture?: keyof typeof TEXTURES; opacity?: number };

// 부모를 꽉 채우는 종이 결(또는 표지 천 결). 맨 앞 자식으로 두면 그 위에 내용이 놓인다. 누르기는 그대로 통과한다.
// iOS의 resizeMode="repeat"는 한 장만 그려져서, 크기를 재고 타일을 직접 깐다.
export function Paper({ texture = 'paper', opacity = OPACITY[texture] }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const cols = Math.ceil(size.width / TILE);
  const rows = Math.ceil(size.height / TILE);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip, { opacity }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (Math.ceil(prev.width / TILE) === Math.ceil(width / TILE) && Math.ceil(prev.height / TILE) === Math.ceil(height / TILE) ? prev : { width, height }));
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <Image key={i} source={TEXTURES[texture]} style={[styles.tile, { left: (i % cols) * TILE, top: Math.floor(i / cols) * TILE }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  tile: { position: 'absolute', width: TILE, height: TILE },
});
