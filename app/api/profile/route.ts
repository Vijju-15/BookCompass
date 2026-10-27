import { NextRequest, NextResponse } from "next/server";
import { ReaderProfileSchema } from "@/lib/schemas";
import { z } from "zod";

export async function GET() {
  return NextResponse.json({ profile: null });
}

const PutProfileBodySchema = z.object({
  profile: ReaderProfileSchema,
});

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = PutProfileBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid reader profile data", details: parsed.error.format() },
        { status: 400 }
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