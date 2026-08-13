// ---------------------------------------------------------------
// Daily Summary Edge Function
//
// Compiles all batch_tracking activity for the current day and
// returns a structured summary. Designed to be:
//   1. Triggered manually via admin button (current free tier)
//   2. Triggered via external cron service (e.g. GitHub Actions)
//   3. Triggered via pg_cron (when upgrading to Supabase Pro)
//
// To deploy: supabase functions deploy daily-summary
// To invoke manually:
//   curl -X POST https://<project>.supabase.co/functions/v1/daily-summary \
//     -H "Authorization: Bearer <admin-jwt>"
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Initialize Supabase client with service role key
    //    for full database access (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller JWT carries admin/staff role before returning production data.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roles = (callerRoles ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("staff")) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Calculate today's date range (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    // 3. Fetch all tracking entries for today
    const { data: tracking, error: trackingError } = await supabase
      .from("batch_tracking")
      .select("id, batch_id, phase_id, quantity_completed, quantity_wasted, created_at")
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    if (trackingError) {
      throw new Error(`Failed to fetch tracking: ${trackingError.message}`);
    }

    // 4. Calculate summary statistics
    const totalEntries = tracking?.length ?? 0;
    const totalCompleted = (tracking ?? []).reduce(
      (sum, t) => sum + (t.quantity_completed ?? 0), 0
    );
    const totalWasted = (tracking ?? []).reduce(
      (sum, t) => sum + (t.quantity_wasted ?? 0), 0
    );
    const uniqueBatches = new Set((tracking ?? []).map((t) => t.batch_id)).size;

    // 5. Fetch completed batches today
    const { count: completedBatches } = await supabase
      .from("production_batches")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", todayStart.toISOString());

    // 6. Fetch phase names for breakdown
    const { data: phases } = await supabase
      .from("production_phases")
      .select("id, name")
      .order("sequence_order");

    const phaseMap = new Map((phases ?? []).map((p) => [p.id, p.name]));

    // 7. Per-phase breakdown
    const phaseBreakdown: Record<string, { completed: number; wasted: number; entries: number }> = {};
    for (const entry of tracking ?? []) {
      const phaseName = phaseMap.get(entry.phase_id) ?? "Unknown";
      if (!phaseBreakdown[phaseName]) {
        phaseBreakdown[phaseName] = { completed: 0, wasted: 0, entries: 0 };
      }
      phaseBreakdown[phaseName].completed += entry.quantity_completed ?? 0;
      phaseBreakdown[phaseName].wasted += entry.quantity_wasted ?? 0;
      phaseBreakdown[phaseName].entries += 1;
    }

    const summary = {
      date: todayStart.toISOString().split("T")[0],
      totalEntries,
      totalPiecesCompleted: totalCompleted,
      totalPiecesWasted: totalWasted,
      wastePercentage: totalCompleted > 0
        ? ((totalWasted / totalCompleted) * 100).toFixed(2) + "%"
        : "0%",
      uniqueBatchesWorkedOn: uniqueBatches,
      batchesCompletedToday: completedBatches ?? 0,
      phaseBreakdown,
    };

    // 8. Return the summary as JSON
    //    In a future iteration, this function can also send
    //    the summary via email using Resend/SendGrid
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
