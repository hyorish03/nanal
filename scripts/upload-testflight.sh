#!/bin/zsh
# 나날 iOS 빌드를 만들어 TestFlight(App Store Connect)에 올린다.
# 빌드 번호는 mobile/app.json의 ios.buildNumber를 미리 올려 둔다(같은 번호는 다시 올라가지 않는다).
# 키 설정(저장소 밖): ~/.appstoreconnect/nanal.env 에 ASC_KEY_ID, ASC_ISSUER_ID
#                    ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8 (관리자 권한 팀 키: 클라우드 배포 서명에 필요)
# Xcode의 바로 올리기(destination upload)는 API 키 로그인 단계에서 실패해서, ipa로 내보낸 뒤 altool로 올린다.
set -euo pipefail
source ~/.appstoreconnect/nanal.env
ROOT=${0:A:h:h}
OUT=${TMPDIR:-/tmp}/nanal-upload
KEY=~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8
rm -rf "$OUT" && mkdir -p "$OUT"

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
echo "▸ prebuild"; npx expo prebuild --platform ios --clean > "$OUT/prebuild.log" 2>&1
cd ios
echo "▸ archive"; xcodebuild -workspace app.xcworkspace -scheme app -configuration Release -destination "generic/platform=iOS" \
  -archivePath "$OUT/app.xcarchive" DEVELOPMENT_TEAM=8V5VNMF9JM "${AUTH[@]}" archive > "$OUT/archive.log" 2>&1
echo "▸ export ipa"; xcodebuild -exportArchive -archivePath "$OUT/app.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/ipa" "${AUTH[@]}" > "$OUT/export.log" 2>&1
echo "▸ upload"; xcrun altool --upload-app --type ios -f "$OUT/ipa/app.ipa" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" | tee "$OUT/upload.log"
echo "✓ 올렸어요. 로그: $OUT"
