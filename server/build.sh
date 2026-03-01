#!/usr/bin/env bash
set -e

echo "=== Installing server dependencies via yarn ==="
yarn install --production=false --ignore-engines

echo "=== Compiling server TypeScript ==="
./node_modules/.bin/tsc

echo "=== Installing client dependencies via yarn ==="
cd ../client
yarn install --production=false

echo "=== Compiling client TypeScript ==="
./node_modules/.bin/tsc -b

echo "=== Building client with Vite ==="
./node_modules/.bin/vite build

echo "=== Build complete! ==="
echo "(Database seeding happens at server startup, not build time,"
echo " so the Render persistent disk is available.)"
