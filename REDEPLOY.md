# Redeploying the Edge Functions

The functions carry a CORS fix (Sept 2026) without which every browser call
fails its preflight and the app shows "Failed to fetch" - the AI never even
reaches Anthropic. After changing anything in `edge-*.ts`, re-copy and redeploy.

## One-time
    npx supabase login          # opens a browser; paste nothing here

## Deploy (from ~/mighty)
    npx supabase functions deploy ai-proxy --project-ref hplyyywdftnvjajyncvj
    npx supabase functions deploy people-search --project-ref hplyyywdftnvjajyncvj
    npx supabase functions deploy sheets-sync --project-ref hplyyywdftnvjajyncvj
    npx supabase functions deploy community-stats --project-ref hplyyywdftnvjajyncvj

## The one secret still required for AI
    npx supabase secrets set ANTHROPIC_API_KEY='sk-ant-...' --project-ref hplyyywdftnvjajyncvj

## Verify CORS is live (should print access-control-allow-origin)
    curl -s -i -X OPTIONS https://hplyyywdftnvjajyncvj.supabase.co/functions/v1/ai-proxy \
 -H "Origin: https://yourmighty.com" -H "Access-Control-Request-Method: POST" | grep -i access-control
