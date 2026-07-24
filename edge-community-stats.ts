// ============================================================
// MIghTy — Community insights aggregation. Cron-only, no on-demand mode.
//
// Reads only students who opted in (user_data.settings.communityOptIn===true),
// aggregates their outreach_log/outreach_events by company, and writes ONLY
// aggregated counts to community_stats — never names, never messages, never
// a per-student breakdown. Enforces a k-anonymity floor: a company's row is
// only written (or kept) once >=3 distinct students have contributed to it;
// below that, any existing row for that company is deleted. The app additionally
// buckets every count in the UI rather than showing raw numbers.
//
// Deploy:
//   1. supabase functions new community-stats   (then replace its index.ts with this file)
//   2. supabase functions deploy community-stats
//      (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically — no secrets to set)
//   3. Schedule it daily — see the pg_cron snippet in SETUP.md.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const K_ANONYMITY_FLOOR = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: users, error: usersErr } = await admin.from("user_data").select("user_id,data");
  if (usersErr) return json({ ok: false, error: "db_error", message: usersErr.message }, 500);
  const optedIn = new Set((users ?? []).filter(u => u.data?.settings?.communityOptIn === true).map(u => u.user_id));
  if (!optedIn.size) return json({ ok: true, companies: 0, message: "No opted-in students yet." });

  const { data: logRows, error: logErr } = await admin
    .from("outreach_log").select("id,user_id,company,status")
    .in("user_id", Array.from(optedIn));
  if (logErr) return json({ ok: false, error: "db_error", message: logErr.message }, 500);

  const relevantLogIds = new Set((logRows ?? []).map(r => r.id));
  const { data: eventRows, error: eventErr } = await admin
    .from("outreach_events").select("log_id,user_id,event_type")
    .in("user_id", Array.from(optedIn));
  if (eventErr) return json({ ok: false, error: "db_error", message: eventErr.message }, 500);

  const logById = new Map((logRows ?? []).map(r => [r.id, r]));

  type Agg = { contributors: Set<string>, outreach: number, reply: number, coffee_chat: number, referral: number, interview: number };
  const byCompany = new Map<string, Agg>();
  const ensure = (company: string) => {
    if (!byCompany.has(company)) byCompany.set(company, { contributors: new Set(), outreach: 0, reply: 0, coffee_chat: 0, referral: 0, interview: 0 });
    return byCompany.get(company)!;
  };

  for (const r of logRows ?? []) {
    const company = (r.company || "").trim();
    if (!company) continue;
    const agg = ensure(company);
    agg.contributors.add(r.user_id);
    agg.outreach++;
    if (r.status === "replied") agg.reply++;
  }
  for (const e of eventRows ?? []) {
    if (!relevantLogIds.has(e.log_id)) continue;
    const parent = logById.get(e.log_id);
    const company = (parent?.company || "").trim();
    if (!company) continue;
    const agg = ensure(company);
    agg.contributors.add(e.user_id);
    if (e.event_type === "coffee_chat") agg.coffee_chat++;
    else if (e.event_type === "referral") agg.referral++;
    else if (e.event_type === "interview") agg.interview++;
  }

  let written = 0, cleared = 0;
  for (const [company, agg] of byCompany) {
    if (agg.contributors.size < K_ANONYMITY_FLOOR) {
      const { error } = await admin.from("community_stats").delete().eq("company", company);
      if (!error) cleared++;
      continue;
    }
    const { error } = await admin.from("community_stats").upsert({
      company,
      contributor_count: agg.contributors.size,
      outreach_count: agg.outreach,
      reply_count: agg.reply,
      coffee_chat_count: agg.coffee_chat,
      referral_count: agg.referral,
      interview_count: agg.interview,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company" });
    if (!error) written++;
  }

  // A company that was above the floor before but has since disappeared from
  // this run's data entirely (e.g. everyone deleted their rows) would otherwise
  // leave a stale row behind — clean up anything not touched this run.
  const seenCompanies = Array.from(byCompany.keys()).filter(c => byCompany.get(c)!.contributors.size >= K_ANONYMITY_FLOOR);
  if (seenCompanies.length) {
    await admin.from("community_stats").delete().not("company", "in", `(${seenCompanies.map(c => `"${c.replace(/"/g, '""')}"`).join(",")})`);
  } else {
    await admin.from("community_stats").delete().neq("company", "");
  }

  return json({ ok: true, companies: written, below_floor_cleared: cleared });
});
