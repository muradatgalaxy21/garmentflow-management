// ---------------------------------------------------------------
// Admin Create Worker Edge Function
//
// Lets an admin, or a user with the employees.create permission, create an employee account
// directly from the admin dashboard (no self-signup needed).
// Verifies the caller holds that permission
// before touching the service-role client.
// ---------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEPARTMENTS = ["accessories", "cutting", "sticker", "printing", "embroidery", "quality", "lot_bundling", "stitching", "button_ops", "clipping", "press", "quality_final", "packing"];
const SUB_DEPARTMENTS = ["singer", "overlock", "flatlock", "lock_stitch"];
// 'admin' deliberately not creatable here.
const ROLES = ["worker", "manager", "staff"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client scoped to the caller's JWT, used only to verify identity + role.
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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    // Admin passes; others need the Employees > Add permission (plans/01).
    const { data: allowed } = await admin.rpc("has_any_permission", {
      _user_id: caller.id,
      _permissions: ["employees.create"],
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, fullName, role = "worker", department = null, subDepartment = null } = await req.json();
    const bad = (error: string) =>
      new Response(JSON.stringify({ error }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!ROLES.includes(role)) return bad("Invalid role");
    if (department !== null && !DEPARTMENTS.includes(department)) return bad("Invalid department");
    if (subDepartment !== null && (department !== "stitching" || !SUB_DEPARTMENTS.includes(subDepartment))) return bad("Invalid sub-department");
    // Only a real admin may create non-worker accounts.
    if (role !== "worker") {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Only an admin can assign this role" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // Workers sign in by SMS OTP, so only a Pakistani mobile in E.164 is needed.
    if (typeof phone !== "string" || !/^\+923\d{9}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "A valid Pakistani mobile number (+923XXXXXXXXX) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      user_metadata: { full_name: fullName ?? null, requested_role: "worker" },
    });
    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signup trigger made the profile + worker role. Apply role/department now;
    // profiles trigger zz_profiles_auto_skills derives skills from department.
    const uid = created.user.id;
    if (department) {
      const { error } = await admin.from("profiles").update({ department, sub_department: subDepartment }).eq("id", uid);
      if (error) return bad(`Account created but department failed: ${error.message}`);
    }
    if (role !== "worker") {
      await admin.from("user_roles").delete().eq("user_id", uid).eq("role", "worker");
      const { error } = await admin.from("user_roles").insert({ user_id: uid, role });
      if (error) return bad(`Account created but role failed: ${error.message}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
