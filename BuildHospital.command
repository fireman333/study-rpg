#!/bin/bash
# Double-click this file to build and preview the MedExam2 Hospital app locally.

set -e

trap 'echo ""; echo "  BuildHospital.command failed on line $LINENO."; echo "  Press any key to close this window."; read -n 1 -s' ERR

cd "$(dirname "$0")"

PORT=4173
URL="http://localhost:${PORT}/study-rpg/hospital/"

echo ""
echo "  ================================================"
echo "    study-rpg — Building MedExam2 Hospital..."
echo "  ================================================"
echo ""

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "  pnpm not found; enabling Corepack..."
    corepack enable
  else
    echo "  Error: pnpm is required, but neither pnpm nor corepack was found."
    exit 1
  fi
fi

if [ ! -d "node_modules" ]; then
  echo "  Installing workspace dependencies..."
  pnpm install
fi

pid=$(lsof -ti:${PORT} 2>/dev/null || true)
if [ -n "$pid" ]; then
  echo "  Cleaning up stale preview server on port ${PORT} (PID ${pid})..."
  kill $pid 2>/dev/null || true
  sleep 0.5
fi

echo "  Building @study-rpg/core and apps/medexam2-hospital-tw..."
pnpm build:m2

echo ""
echo "  Build complete."
echo "  Output: apps/medexam2-hospital-tw/dist"
echo "  Preview: ${URL}"
echo ""
echo "  Press Ctrl+C in this window to stop the preview server."
echo ""

(sleep 1.5 && open "${URL}") &

pnpm --filter @study-rpg/medexam2-hospital-tw preview --host localhost --port "${PORT}"
