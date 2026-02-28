#!/usr/bin/env bash
set -e

echo "=== Verifying server dependencies ==="
ls node_modules/.bin/tsc && echo "tsc found" || { echo "ERROR: tsc not found"; exit 1; }

echo "=== Compiling server TypeScript ==="
./node_modules/.bin/tsc

echo "=== Installing client dependencies ==="
cd ../client
npm install

echo "=== Compiling client TypeScript ==="
./node_modules/.bin/tsc -b

echo "=== Building client with Vite ==="
./node_modules/.bin/vite build

echo "=== Seeding database ==="
cd ../server
./node_modules/.bin/tsx src/seed.ts

echo "=== Build complete! ==="
