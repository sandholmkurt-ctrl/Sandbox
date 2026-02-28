#!/usr/bin/env bash
set -e

echo "=== Ensuring build tools are installed ==="
npm install --include=dev

echo "=== Compiling server TypeScript ==="
./node_modules/.bin/tsc

echo "=== Installing client dependencies ==="
cd ../client
npm install --include=dev

echo "=== Compiling client TypeScript ==="
./node_modules/.bin/tsc -b

echo "=== Building client with Vite ==="
./node_modules/.bin/vite build

echo "=== Seeding database ==="
cd ../server
npx tsx src/seed.ts

echo "=== Build complete! ==="
