#!/bin/sh
set -eu
cd "$(dirname "$0")"
bundle='../Axelerometric Head Tracker.app'
mkdir -p "$bundle/Contents/MacOS"
cp Info.plist "$bundle/Contents/"
xcrun swiftc -O -target "$(uname -m)-apple-macos14.0" -module-cache-path "${TMPDIR:-/tmp}/axelerometric-swift-cache" main.swift -o "$bundle/Contents/MacOS/HeadTracker"
codesign --force --sign - "$bundle"
