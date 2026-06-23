#!/bin/bash
# Syncs the working file to the GitHub Pages repo and publishes.
# Working file lives at ~/mighty.html; this repo dir is ~/mighty.
set -e
cp ~/mighty.html ~/mighty/index.html
cd ~/mighty
git add -A
git commit -q -m "${1:-update}" || { echo "Nothing to deploy."; exit 0; }
git push -q 2>/dev/null && echo "Deployed → check your GitHub Pages URL" || echo "Committed locally. Add a GitHub remote + 'git push -u origin main' to publish."
