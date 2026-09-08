import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { managedBucket, managedObjects } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { calculateQuotaProgress } from "@/lib/quota";
import { reconcileManagedBucket } from "@/lib/s3/reconcile";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const outcome = await reconcileManagedBucket(id, session.user.id);

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  }

  // Retrieve refreshed bucket and objects
  const [updated] = await db
    .select()
    .from(managedBucket)
    .where(
      and(
        eq(managedBucket.id, id),
        eq(managedBucket.userId, session.user.id),
      ),
    )
    .limit(1);

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
    .where(eq(managedObjects.managedBucketId, id))
    .orderBy(asc(managedObjects.key));

  return NextResponse.json({
    success: true,
    reconciliation: outcome.result,
    bucket: updated
      ? {
          ...updated,
          progress: calculateQuotaProgress(
            updated.usedBytes,
            updated.storageQuotaBytes,
          ),
        }
      : null,
    objects,
  });
}
