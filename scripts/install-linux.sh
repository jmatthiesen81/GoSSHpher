#!/usr/bin/env sh
# Install GoSSHpher for the current user: binary, icons and menu entry.
#   wails build -tags webkit2_41 && scripts/install-linux.sh
# Remove again with: scripts/install-linux.sh --uninstall
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP_ID=de.netinventors.gosshpher
BIN_DIR=${XDG_BIN_HOME:-$HOME/.local/bin}
DATA_DIR=${XDG_DATA_HOME:-$HOME/.local/share}
ICON_DIR=$DATA_DIR/icons/hicolor
APP_DIR=$DATA_DIR/applications
DESKTOP=$APP_DIR/$APP_ID.desktop

refresh() {
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APP_DIR" || true
    command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$ICON_DIR" 2>/dev/null || true
}

if [ "${1:-}" = "--uninstall" ]; then
    rm -f "$BIN_DIR/gosshpher" "$DESKTOP"
    find "$ICON_DIR" -path '*/apps/gosshpher.*' -delete 2>/dev/null || true
    refresh
    echo "GoSSHpher removed."
    exit 0
fi

[ -x "$ROOT/build/bin/gosshpher" ] || { echo "build/bin/gosshpher is missing – run 'wails build -tags webkit2_41' first." >&2; exit 1; }

install -Dm755 "$ROOT/build/bin/gosshpher" "$BIN_DIR/gosshpher"
(cd "$ROOT/build/linux/icons/hicolor" && find . -name 'gosshpher.*' | while read -r f; do
    install -Dm644 "$f" "$ICON_DIR/$f"
done)
install -Dm644 "$ROOT/build/linux/$APP_ID.desktop" "$DESKTOP"
# absolute Exec path, works even if ~/.local/bin is not in PATH of the session
sed -i "s|^Exec=gosshpher|Exec=$BIN_DIR/gosshpher|" "$DESKTOP"
refresh

echo "Installed:  $BIN_DIR/gosshpher"
echo "Menu entry: $DESKTOP"
