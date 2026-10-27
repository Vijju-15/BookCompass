import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ReaderProfileSchema } from "@/lib/schemas";
import { z } from "zod";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("reader_profiles")
      .select("profile")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Error fetching reader profile:", error);
    }

    return NextResponse.json({ profile: data?.profile ?? null });
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw err;
    }
    console.error("GET /api/profile error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const PutProfileBodySchema = z.object({
  profile: ReaderProfileSchema,
});

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = PutProfileBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid reader profile data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabase
      .from("reader_profiles")
      .upsert(
        {
          user_id: user.id,
          profile: parsed.data.profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Error saving reader profile:", upsertError);
      return NextResponse.json(
        { error: "Failed to save profile to database" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profile: parsed.data.profile });
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw err;
    }
    console.error("PUT /api/profile error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
