import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { managedBucket, managedObjects } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { calculateQuotaProgress } from "@/lib/quota";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [bucket] = await db
    .select()
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.id, id),
        eq(managedBucket.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!bucket) {
    return NextResponse.json(
      { error: "Managed bucket not found." },
      { status: 404 },
    );
  }

  const objects = await db
    .select({
      id: managedObjects.id,
      key: managedObjects.key,
      sizeBytes: managedObjects.sizeBytes,
      etag: managedObjects.etag,
      lastModified: managedObjects.lastModified,
      createdAt: managedObjects.createdAt,
    })
    .from(managedObjects)
    .where(eq(managedObjects.managedBucketId, bucket.id))
    .orderBy(asc(managedObjects.key));

  return NextResponse.json({
    bucket: {
      ...bucket,
      progress: calculateQuotaProgress(
        bucket.usedBytes,
        bucket.storageQuotaBytes,
      ),
    },
    objects,
  });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [existing] = await db
    .select({ id: managedBucket.id })
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.id, id),
        eq(managedBucket.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Managed bucket not found." },
      { status: 404 },
    );
  }

  // Deleting the bucket cascades to delete all registered managed_objects
  await db
    .delete(managedBucket)
    .where(
      and(
        eq(managedBucket.id, id),
        eq(managedBucket.userId, session.user.id),
      ),
    );

  return NextResponse.json({ success: true });
}
