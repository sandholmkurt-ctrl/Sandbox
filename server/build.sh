#!/usr/bin/env bash
set -e

echo "=== Installing server dependencies (skip native builds) ==="
npm install --ignore-scripts

echo "=== Rebuilding native modules ==="
npm rebuild better-sqlite3

echo "=== Compiling server TypeScript ==="
./node_modules/.bin/tsc

echo "=== Installing client dependencies ==="
cd ../client
npm install --ignore-scripts

echo "=== Compiling client TypeScript ==="
./node_modules/.bin/tsc -b

echo "=== Building client with Vite ==="
./node_modules/.bin/vite build

echo "=== Seeding database ==="
cd ../server
./node_modules/.bin/tsx src/seed.ts

echo "=== Build complete! ==="
