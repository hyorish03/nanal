import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

// 화면 한 장 크기(430×932pt, @2x)로 미리 구운 결. 예전 256px 타일에 투명도(종이 3.5%, 천 6%)를 곱해
// 알파에 담아 두었으므로, 그리는 쪽에서 View opacity(화면 밖 합성)를 걸지 않는다.
const TEXTURES = {
  paper: require('../../assets/textures/paper-sheet.png'),
  cloth: require('../../assets/textures/cloth-sheet.png'),
};
const SHEET = { width: 430, height: 932 };

// 구워 둔 세기. opacity를 따로 주면 이 값에 대한 비율로 줄인다(더 진하게는 못 한다).
const BAKED_OPACITY = { paper: 0.035, cloth: 0.06 };

type Props = { texture?: keyof typeof TEXTURES; opacity?: number };

// 부모를 꽉 채우는 종이 결(또는 표지 천 결). 맨 앞 자식으로 두면 그 위에 내용이 놓인다. 누르기는 그대로 통과한다.
// 보통 이미지 한 장이면 덮인다. 부모가 한 장보다 크면 그때만 장을 더 깐다(늘이지 않아 알갱이 크기가 같다).
export function Paper({ texture = 'paper', opacity }: Props) {
  const [grid, setGrid] = useState({ cols: 1, rows: 1 });
  const imageOpacity = opacity === undefined ? undefined : Math.min(1, opacity / BAKED_OPACITY[texture]);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const cols = Math.max(1, Math.ceil(width / SHEET.width));
        const rows = Math.max(1, Math.ceil(height / SHEET.height));
        setGrid((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
      }}
    >
      {Array.from({ length: grid.rows * grid.cols }, (_, i) => (
        <Image
          key={i}
          source={TEXTURES[texture]}
          fadeDuration={0}
          style={[
            styles.sheet,
            { left: (i % grid.cols) * SHEET.width, top: Math.floor(i / grid.cols) * SHEET.height },
            imageOpacity !== undefined && { opacity: imageOpacity },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  sheet: { position: 'absolute', width: SHEET.width, height: SHEET.height },
});
