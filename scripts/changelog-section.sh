#!/usr/bin/env sh
# Print the CHANGELOG.md section of a version, without its heading, for the
# GitHub release notes:
#   scripts/changelog-section.sh 1.2.0 [CHANGELOG.md]
# A pre-release (1.2.0-rc.1) falls back to the section of 1.2.0 and then to
# [Unreleased]. Exits with 1 if no section with content is found.
set -eu

VERSION=${1:?usage: changelog-section.sh <version> [changelog]}
FILE=${2:-$(cd "$(dirname "$0")/.." && pwd)/CHANGELOG.md}

# section NAME: lines between "## [NAME]" and the next "## " heading or the
# link definitions at the end, with surrounding blank lines trimmed
section() {
    awk -v name="$1" '
        /^## / { if (inside) exit; inside = (index($0, "## [" name "]") == 1); next }
        inside && /^\[[^]]+\]: / { exit }
        inside { lines[++n] = $0 }
        END {
            first = 1; while (first <= n && lines[first] ~ /^[ \t]*$/) first++
            last = n;  while (last >= first && lines[last] ~ /^[ \t]*$/) last--
            for (i = first; i <= last; i++) print lines[i]
        }
    ' "$FILE"
}

candidates=$VERSION
case $VERSION in
    *-*) candidates="$VERSION ${VERSION%%-*} Unreleased" ;;
esac

for name in $candidates; do
    text=$(section "$name")
    if [ -n "$text" ]; then
        printf '%s\n' "$text"
        exit 0
    fi
done

echo "CHANGELOG: no section for $VERSION in $FILE (tried: $candidates)" >&2
exit 1
