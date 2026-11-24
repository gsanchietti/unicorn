#!/bin/sh
# Publish the game from a `town` worktree as a preview at /next/ on `main`.
# Usage: tools/publish-preview.sh <town-worktree> <main-worktree>
# Replaces <main-worktree>/next/ with the game files only (no photos, no tools,
# no tests) and renames the app in the copied manifest, so the preview and the
# live game can both sit on a phone. It does not commit or push anything.
set -eu

[ $# -eq 2 ] || { echo "usage: $0 <town-worktree> <main-worktree>" >&2; exit 2; }
SRC=$(cd "$1" && pwd)
DST=$(cd "$2" && pwd)

for f in index.html style.css manifest.webmanifest sw.js js assets/icons assets/fonts; do
  [ -e "$SRC/$f" ] || { echo "missing in town worktree: $f" >&2; exit 1; }
done
[ -f "$DST/sw.js" ] || { echo "not a main worktree: $DST" >&2; exit 1; }

rm -rf "$DST/next"
mkdir -p "$DST/next/assets"
for f in index.html style.css manifest.webmanifest sw.js; do cp "$SRC/$f" "$DST/next/$f"; done
cp -r "$SRC/js" "$DST/next/js"
cp -r "$SRC/assets/icons" "$DST/next/assets/icons"
cp -r "$SRC/assets/fonts" "$DST/next/assets/fonts"

sed -i 's/"name": *"Bella e Bongo"/"name": "Bella e Bongo (prova)"/' "$DST/next/manifest.webmanifest"
grep -q '"name": "Bella e Bongo (prova)"' "$DST/next/manifest.webmanifest" || { echo "manifest rename failed" >&2; exit 1; }
echo "published to $DST/next"
