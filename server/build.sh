#!/usr/bin/env bash
set -e

echo "=== Compiling server TypeScript ==="
npx tsc

echo "=== Installing client dependencies ==="
cd ../client
npm install --include=dev

echo "=== Compiling client TypeScript ==="
npx tsc -b

echo "=== Building client with Vite ==="
npx vite build

echo "=== Seeding database ==="
cd ../server
npx tsx src/seed.ts

echo "=== Build complete! ==="
