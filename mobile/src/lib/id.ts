// 앱에서는 App.tsx 첫 줄의 react-native-get-random-values가, 테스트에서는 Node webcrypto가 제공한다.
type CryptoLike = { getRandomValues(array: Uint8Array): Uint8Array };

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  (globalThis as unknown as { crypto: CryptoLike }).crypto.getRandomValues(bytes);
  return bytes;
}

export function newId(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
