#!/bin/sh
set -eu
# Pinned release; PI_CLAUDE_STYLE_VERSION permits explicit future upgrades.
version=${PI_CLAUDE_STYLE_VERSION:-v0.1.2}
case "$version" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo 'Invalid release version' >&2; exit 1;; esac
command -v node >/dev/null 2>&1 || { echo 'Install Node.js >=22.19.0 first.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm is required.' >&2; exit 1; }
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
curl -fLsS --connect-timeout 20 --max-time 120 "https://github.com/wenhanweime/pi-claude-style/archive/refs/tags/$version.tar.gz" -o "$work_dir/source.tar.gz"
tar -xzf "$work_dir/source.tar.gz" -C "$work_dir"
source_dir="$work_dir/pi-claude-style-${version#v}"
node "$source_dir/scripts/setup.mjs" "${1:-install}"
