#!/usr/bin/env bash
set -e

echo "=== Installing server dependencies via yarn ==="
yarn install --production=false

echo "=== Compiling server TypeScript ==="
./node_modules/.bin/tsc

echo "=== Installing client dependencies via yarn ==="
cd ../client
yarn install --production=false

echo "=== Compiling client TypeScript ==="
./node_modules/.bin/tsc -b

echo "=== Building client with Vite ==="
./node_modules/.bin/vite build

echo "=== Seeding database ==="
cd ../server
./node_modules/.bin/tsx src/seed.ts

echo "=== Build complete! ==="
