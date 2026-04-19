#!/usr/bin/env bash
# Writes a Markdown file on the Desktop with the unified diff vs main for backend/ only.
# Optional: --all for tip-to-tip (main..HEAD) instead of merge-base (main...HEAD).
#
# Usage (from backend/): pnpm diff:main [-- --all]

set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_ROOT/.." && pwd)"
DIFF_SCRIPT="$REPO_ROOT/scripts/diff-vs-main.sh"
DESKTOP="${HOME}/Desktop"
BACKEND_PATHSPEC="backend/"

if [ ! -d "$DESKTOP" ]; then
  echo "error: Desktop folder not found at $DESKTOP" >&2
  exit 1
fi

if [ ! -f "$DIFF_SCRIPT" ]; then
  echo "error: missing $DIFF_SCRIPT" >&2
  exit 1
fi

cd "$REPO_ROOT"

BASE_REF=main
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  BASE_REF=origin/main
elif ! git rev-parse --verify main >/dev/null 2>&1; then
  echo "error: need local 'main' or 'origin/main'." >&2
  exit 1
fi

MODE="..."
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --all)
      MODE=".."
      EXTRA+=("--all")
      shift
      ;;
    *)
      echo "error: unknown argument '$1' (only --all is supported)" >&2
      exit 1
      ;;
  esac
done

RANGE="${BASE_REF}${MODE}HEAD"

BRANCH="$(git branch --show-current 2>/dev/null || echo unknown)"
SAFE_BRANCH="${BRANCH//\//-}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DESKTOP/pulsar-diff-vs-main_${SAFE_BRANCH}_${STAMP}.md"

if [ "${#EXTRA[@]}" -eq 0 ]; then
  DIFF_TEXT="$(bash "$DIFF_SCRIPT" -- "$BACKEND_PATHSPEC")"
else
  DIFF_TEXT="$(bash "$DIFF_SCRIPT" "${EXTRA[@]}" -- "$BACKEND_PATHSPEC")"
fi

{
  echo "# Diff vs main (\`backend/\`)"
  echo
  echo "- **Repository:** \`$REPO_ROOT\`"
  echo "- **Pathspec:** \`$BACKEND_PATHSPEC\`"
  echo "- **Branch:** \`$BRANCH\`"
  echo "- **Range:** \`$RANGE\`"
  echo "- **Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo
  echo '```diff'
  echo "$DIFF_TEXT"
  echo '```'
} >"$OUT"

echo "Wrote $OUT"
