import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { getSupabase } from "../config/supabase.js";

const router = express.Router();

/**
 * POST /api/auth/sync
 * Called by the frontend after Clerk sign-in/sign-up to ensure
 * a profiles row exists for this Clerk user.
 */
router.post("/sync", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;

    const db = getSupabase();

    // Upsert – create if missing, leave existing data alone
    const { data, error } = await db
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          username: username || email?.split("@")[0] || "runner",
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Sync failed", error: error.message });
  }
});

export default router;
