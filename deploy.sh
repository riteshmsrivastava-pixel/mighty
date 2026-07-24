#!/bin/bash
# Syncs the working files to the GitHub Pages repo and publishes.
# Working files:
#   ~/mighty.html      -> the app itself       -> ~/mighty/app/index.html
#   ~/mighty-home.html -> the marketing homepage -> ~/mighty/index.html
# Also refreshes the downloadable extension zip so it never goes stale.
set -e
mkdir -p ~/mighty/app ~/mighty/install
[ -f ~/mighty.html ] && cp ~/mighty.html ~/mighty/app/index.html
[ -f ~/mighty-home.html ] && cp ~/mighty-home.html ~/mighty/index.html
cd ~/mighty
rm -f install/mighty-extension.zip
(cd extension && zip -qr ../install/mighty-extension.zip . -x '.*')
git add -A
git commit -q -m "${1:-update}" || { echo "Nothing to deploy."; exit 0; }
git push -q 2>/dev/null && echo "Deployed → check your GitHub Pages URL" || echo "Committed locally. Add a GitHub remote + 'git push -u origin main' to publish."
