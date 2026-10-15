#!/bin/bash
# Assemble the Next.js standalone bundle for the systemd unit.
# The unit runs: node custom-server.js from .next/standalone, so every file the
# server needs at runtime that `next build` does not copy must be placed here.
set -e
cd /root/9router

if [ ! -f .next/standalone/server.js ]; then
  echo "assemble: .next/standalone/server.js missing - run 'npx next build' first" >&2
  exit 1
fi

cp -a custom-server.js .next/standalone/custom-server.js
cp -a CHANGELOG.md     .next/standalone/CHANGELOG.md
cp -a package.json     .next/standalone/package.json

# next ships its own copy of some runtime deps; the standalone bundle resolves
# `next` from its own node_modules, so mirror the built tree over it.
rm -rf .next/standalone/node_modules/next
cp -a node_modules/next .next/standalone/node_modules/next

echo "assemble: ok"
