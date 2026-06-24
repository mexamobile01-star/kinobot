#!/bin/sh
set -e

echo "=== Prisma DB sync ==="
npx prisma db push --skip-generate

echo "=== Bot ishga tushmoqda ==="
exec node dist/index.js
