import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Try fetching with user_id first (RLS enabled), with fallback for older schema
    const { data, error } = await supabase
      .from("user_chats")
      .select("id, title, genre, level, user_message, books, ladder, explanation, messages, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Fallback matching on email if user_id column is not yet populated
      if (user.email) {
        const { data: fallbackData } = await supabase
          .from("user_chats")
          .select("id, title, genre, level, user_message, books, ladder, explanation, messages, created_at, updated_at")
          .eq("email", user.email)
          .order("created_at", { ascending: false })
          .limit(50);

        if (fallbackData) {
          return NextResponse.json({ chats: fallbackData });
        }
      }

      console.error("Failed to fetch user chats:", error);
      return NextResponse.json(
        { error: "Could not retrieve chats." },
        { status: 500 }
      );
    }

    return NextResponse.json({ chats: data ?? [] });
  } catch (err) {
    console.error("Chats GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

const DeleteChatSchema = z.object({
  id: z.string().trim().uuid("Invalid chat ID format."),
});

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = DeleteChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_chats")
      .delete()
      .eq("id", parsed.data.id)
      .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chats DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const RenameChatSchema = z.object({
  id: z.string().trim().uuid("Invalid chat ID format."),
  title: z.string().trim().min(1, "Title cannot be empty").max(100),
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = RenameChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_chats")
      .update({ title: parsed.data.title, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chats PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
