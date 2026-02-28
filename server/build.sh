#!/usr/bin/env bash
set -e

echo "=== Installing server dependencies ==="
npm ci --include=dev

echo "=== Compiling server TypeScript ==="
npx tsc

echo "=== Installing client dependencies ==="
cd ../client
npm ci --include=dev

echo "=== Compiling client TypeScript ==="
npx tsc -b

echo "=== Building client with Vite ==="
npx vite build

echo "=== Seeding database ==="
cd ../server
npx tsx src/seed.ts

echo "=== Build complete! ==="
