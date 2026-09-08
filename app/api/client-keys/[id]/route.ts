import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { clientKey } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify that the client key exists and belongs to the authenticated user
  const [existing] = await db
    .select({ id: clientKey.id, status: clientKey.status })
    .from(clientKey)
    .where(
      and(
        eq(clientKey.id, id),
        eq(clientKey.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Client key not found." },
      { status: 404 },
    );
  }

  // Revoke the key immediately to block gateway authentication
  await db
    .update(clientKey)
    .set({ status: "revoked" })
    .where(
      and(
        eq(clientKey.id, id),
        eq(clientKey.userId, session.user.id),
      ),
    );

  return NextResponse.json({
    success: true,
    message: "Client key revoked successfully.",
  });
}
