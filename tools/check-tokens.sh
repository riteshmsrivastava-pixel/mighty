#!/usr/bin/env bash
# Fail if any surface has drifted from the canonical palette.
#
# There is no build step here: every page is a standalone HTML file served
# straight from Pages, so a shared stylesheet would cost a network request and a
# flash of unstyled content on each one. The values are therefore duplicated on
# purpose, and this script is what keeps duplication from becoming divergence.
#
#   ./tools/check-tokens.sh
#
# It exists because the repo reached three incompatible token sets across seven
# files, including two different brand purples rendering on the same LinkedIn
# page at the same time. Nobody did that deliberately; it accumulated.
#
# Canonical source of truth: the :root block in app/index.html.
set -uo pipefail
cd "$(dirname "$0")/.."

# Values that must never appear again. Left side is the retired value, right side
# is what replaced it, so a failure message says what to change it to.
RETIRED=(
  "5B4BC4|5B46E5|brand purple"
  "4C3EB0|4B38CE|brand hover"
  "1B1A1F|1A1917|ink"
  "EDEAFE|EFEBFE|brand tint"
  "F2A69B|F2A78E|peach"
  "0F6B49|14805A|success green"
  "4B7A5E|14805A|success green"
  "8C8898|A39C93|mute"
)

# app/v1.html is the superseded app and assets/modernist.css is a dead token
# layer whose values are overridden by both of its consumers. Neither is worth
# migrating; both are excluded so this check stays actionable rather than noisy.
FILES=$(git ls-files '*.html' '*.js' '*.css' \
  | grep -v '^app/v1.html$' \
  | grep -v '^assets/modernist.css$' \
  | grep -v '^extension/scoring.js$')

fail=0
for row in "${RETIRED[@]}"; do
  IFS='|' read -r old new label <<< "$row"
  hits=$(grep -ril -- "$old" $FILES 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "DRIFT  #$old ($label) should be #$new"
    for h in $hits; do echo "         $h"; done
    fail=1
  fi
done

# The extension declares fonts it does not ship, so its panels silently render in
# a system fallback rather than the product typeface. Worth surfacing as a known
# gap rather than pretending the declaration means anything.
if ! grep -q 'web_accessible_resources' extension/manifest.json \
   || ! grep -q '\.woff' extension/manifest.json 2>/dev/null; then
  echo "NOTE   the extension declares Plus Jakarta Sans but ships no font file,"
  echo "         so its panels render in the system fallback. Not a drift, a gap."
fi

if [ "$fail" = 0 ]; then echo "tokens: every surface matches app/index.html"; fi
exit $fail
