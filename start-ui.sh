#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install
fi
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3210 >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open http://localhost:3210 >/dev/null 2>&1 &
fi
node server.js
