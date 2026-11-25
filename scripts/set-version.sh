#!/usr/bin/env bash
# Write the release version into the platform build files before a build:
#   scripts/set-version.sh 1.2.3        (or 1.2.3-rc.1)
# macOS Info.plist gets the version as is; the Windows resource and manifest
# need numeric parts, so a pre-release suffix is dropped there.
set -euo pipefail

VERSION=${1:?usage: $0 VERSION}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
NUMERIC=${VERSION%%-*}
if [[ ! "$NUMERIC" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "not a version: $VERSION" >&2
    exit 1
fi

# portable in-place edit (GNU and BSD sed differ in -i)
edit() {
    local file=$1 expr=$2
    sed -E "$expr" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

plist=$ROOT/build/darwin/Info.plist
edit "$plist" "/<key>CFBundle(Short)?Version(String)?<\/key>/{n;s|<string>[^<]*</string>|<string>$VERSION</string>|;}"

info=$ROOT/build/windows/info.json
edit "$info" "s/(\"(file_version|product_version|FileVersion|ProductVersion)\": )\"[^\"]*\"/\1\"$NUMERIC\"/"

manifest=$ROOT/build/windows/wails.exe.manifest
edit "$manifest" "s/(name=\"de\.netinventors\.gosshpher\" version=)\"[^\"]*\"/\1\"$NUMERIC.0\"/"

echo "version $VERSION written to Info.plist, info.json and wails.exe.manifest"
