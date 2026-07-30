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
  "5B4BC4|5B4FE9|brand purple"
  "4C3EB0|4A3FD1|brand hover"
  "1B1A1F|1D1B26|ink"
  "EDEAFE|EFEDFD|brand tint"
  "F2A69B|E87A56|peach"
  "0F6B49|2E8B5F|success green"
  "4B7A5E|2E8B5F|success green"
  "8C8898|A39C93|mute"
  "5B46E5|5B4FE9|brand purple"
  "4B38CE|4A3FD1|brand hover"
  "5540D8|4A3FD1|brand ink"
  "1A1917|1D1B26|ink"
  "EFEBFE|EFEDFD|brand soft2"
  "EDE9FC|E4E0F7|brand line"
  "F2A78E|E87A56|peach"
  "14805A|2E8B5F|success green"
  "22916A|2E8B5F|success green"
  "D9971C|E3A23C|amber"
  "B5675A|C75B33|red"
  "FAF9F7|FBFAF8|paper"
  "F6F4F1|FFFFFF|rail"
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
  echo "NOTE   the extension declares Schibsted Grotesk but ships no font file,"
  echo "         so its panels render in the system fallback. Not a drift, a gap."
fi

if [ "$fail" = 0 ]; then echo "tokens: every surface matches app/index.html"; fi
exit $fail
