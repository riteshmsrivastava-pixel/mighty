#!/usr/bin/env bash
# Rebuild install/mighty-extension.zip from extension/ - the file the install
# page serves to everyone who is not loading it from a git checkout.
#
# This exists because that zip silently went stale: the site was serving 0.2.2
# with an old bridge.js while the repo had moved on, so anyone following the
# published instructions got a version nobody was testing. A hand-made zip is
# how that happens, so this is the only way it should ever be made.
#
#   ./extension/build-zip.sh
#
# Verifies afterwards that every file the manifest actually references made it
# in, because a zip missing a content script fails to load in Chrome with an
# error most people will not know how to read.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=extension
OUT=install/mighty-extension.zip
VERSION=$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])")

rm -f "$OUT"
mkdir -p install

# Contents sit at the archive root, not inside a folder: macOS names the
# extracted folder after the zip, so the install page's "you'll get a folder
# called mighty-extension" stays true.
( cd "$SRC" && zip -q -r "../$OUT" \
    manifest.json background.js content.js scoring.js bridge.js popup.html popup.js \
    icons icons-grey \
    -x '*.DS_Store' -x '__MACOSX*' -x 'build-zip.sh' -x 'INSTALL.md' )

# A zip that loads is the whole point, so check rather than assume.
python3 - "$OUT" <<'PY'
import json, sys, zipfile
out = sys.argv[1]
need = set(['manifest.json'])
m = json.load(open('extension/manifest.json'))
need.add(m['background']['service_worker'])
for cs in m['content_scripts']:
    need.update(cs['js'])
need.add(m['action']['default_popup'])
have = set(zipfile.ZipFile(out).namelist())
missing = sorted(f for f in need if f not in have)
if missing:
    sys.exit('FAILED - manifest references files not in the zip: ' + ', '.join(missing))
zipped = json.loads(zipfile.ZipFile(out).read('manifest.json'))['version']
if zipped != m['version']:
    sys.exit('FAILED - zip manifest says %s, source says %s' % (zipped, m['version']))
print('  every manifest-referenced file present, version matches source')
PY

echo "built $OUT  (v$VERSION, $(du -h "$OUT" | cut -f1))"
echo "Commit it: the install page links this file directly, so the site serves whatever is checked in."
