import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { upstreamAccount } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing account ID" }, { status: 400 });
  }

  const deleted = await db
    .delete(upstreamAccount)
    .where(
      and(
        eq(upstreamAccount.id, id),
        eq(upstreamAccount.userId, session.user.id),
      ),
    )
    .returning({ id: upstreamAccount.id });

  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "Upstream account not found or access denied." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, id });
}
