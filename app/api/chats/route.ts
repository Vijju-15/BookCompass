import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    let query = supabase
      .from("user_chats")
      .select("id, title, genre, level, user_message, books, ladder, explanation, messages, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (email) {
      query = query.eq("email", email.toLowerCase().trim());
    }

    const { data, error } = await query;

    if (error) {
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
    const body = await request.json();
    const parsed = DeleteChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_chats")
      .delete()
      .eq("id", parsed.data.id);

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
    const body = await request.json();
    const parsed = RenameChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_chats")
      .update({ title: parsed.data.title, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Chats PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}