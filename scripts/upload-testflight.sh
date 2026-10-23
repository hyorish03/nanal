#!/bin/zsh
# 나날 iOS 빌드를 만들어 TestFlight(App Store Connect)에 올린다.
# 빌드 번호는 mobile/app.json의 ios.buildNumber를 미리 올려 둔다(같은 번호는 다시 올라가지 않는다).
# BUILD_NUMBER=auto면 App Store Connect의 마지막 번호 + 1로 정한다(CI가 쓴다. app.json은 이 빌드에서만 바뀐다).
# 키 설정(저장소 밖): ~/.appstoreconnect/nanal.env 에 ASC_KEY_ID, ASC_ISSUER_ID
#                    ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8 (관리자 권한 팀 키: 클라우드 배포 서명에 필요)
# CI(.github/workflows/testflight.yml)는 파일 대신 같은 이름의 환경 변수를 넘긴다.
# Xcode의 바로 올리기(destination upload)는 API 키 로그인 단계에서 실패해서, ipa로 내보낸 뒤 altool로 올린다.
set -euo pipefail
[[ -n "${ASC_KEY_ID:-}" ]] || source ~/.appstoreconnect/nanal.env
ROOT=${0:A:h:h}
OUT=${TMPDIR:-/tmp}/nanal-upload
KEY=~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
rm -rf "$OUT" && mkdir -p "$OUT"

if [[ "${BUILD_NUMBER:-}" == auto ]]; then
  BUILD_NUMBER=$(ASC_KEY_ID=$ASC_KEY_ID ASC_ISSUER_ID=$ASC_ISSUER_ID ASC_KEY_PATH=$KEY node "$ROOT/scripts/next-build-number.mjs")
  node -e 'const f=process.argv[1],fs=require("fs"),j=JSON.parse(fs.readFileSync(f));j.expo.ios.buildNumber=process.argv[2];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$ROOT/mobile/app.json" "$BUILD_NUMBER"
  echo "▸ 빌드 번호 $BUILD_NUMBER"
fi

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>8V5VNMF9JM</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST

AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

cd "$ROOT/mobile"
# Supabase 주소·키가 빠진 채 빌드되면 앱이 서버에 붙지 못한다. 값은 출력하지 않는다.
if [[ ! -f .env ]]; then
  echo "✗ mobile/.env 파일이 없어요. mobile/.env.example을 복사해 Supabase 값을 채운 뒤 다시 실행해 주세요." >&2
  exit 1
fi
for name in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY; do
  if ! grep -qE "^[[:space:]]*(export[[:space:]]+)?${name}=[\"']?[^\"'[:space:]]" .env; then
    echo "✗ mobile/.env에 ${name} 값이 없어요. 채운 뒤 다시 실행해 주세요." >&2
    exit 1
  fi
done

echo "▸ prebuild"; npx expo prebuild --platform ios --clean > "$OUT/prebuild.log" 2>&1
cd ios
echo "▸ archive"; xcodebuild -workspace app.xcworkspace -scheme app -configuration Release -destination "generic/platform=iOS" \
  -archivePath "$OUT/app.xcarchive" DEVELOPMENT_TEAM=8V5VNMF9JM "${AUTH[@]}" archive > "$OUT/archive.log" 2>&1
echo "▸ export ipa"; xcodebuild -exportArchive -archivePath "$OUT/app.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/ipa" "${AUTH[@]}" > "$OUT/export.log" 2>&1
echo "▸ upload"; xcrun altool --upload-app --type ios -f "$OUT/ipa/app.ipa" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" | tee "$OUT/upload.log"
echo "✓ 올렸어요. 로그: $OUT"
