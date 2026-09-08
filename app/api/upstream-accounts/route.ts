import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { upstreamAccount } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { probeUpstreamEndpoint } from "@/lib/s3/probe";
import { encryptSecret } from "@/lib/crypto";
import crypto from "node:crypto";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await db
    .select({
      id: upstreamAccount.id,
      name: upstreamAccount.name,
      endpointUrl: upstreamAccount.endpointUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      createdAt: upstreamAccount.createdAt,
      updatedAt: upstreamAccount.updatedAt,
    })
    .from(upstreamAccount)
    .where(eq(upstreamAccount.userId, session.user.id))
    .orderBy(desc(upstreamAccount.createdAt));

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: string;
    endpointUrl?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, endpointUrl, region, accessKeyId, secretAccessKey } = body || {};

  if (
    !name?.trim() ||
    !endpointUrl?.trim() ||
    !region?.trim() ||
    !accessKeyId?.trim() ||
    !secretAccessKey?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Account name, endpoint URL, region, access key ID, and secret access key are all required.",
      },
      { status: 400 },
    );
  }

  const trimmedEndpoint = endpointUrl.trim();
  const trimmedName = name.trim();
  const trimmedRegion = region.trim();
  const trimmedKeyId = accessKeyId.trim();
  const trimmedSecret = secretAccessKey.trim();

  // Actively probe the upstream S3 endpoint to verify credentials and connectivity
  const probeResult = await probeUpstreamEndpoint({
    endpointUrl: trimmedEndpoint,
    region: trimmedRegion,
    accessKeyId: trimmedKeyId,
    secretAccessKey: trimmedSecret,
  });

  if (!probeResult.ok) {
    return NextResponse.json(
      { error: probeResult.error || "Upstream connection probe failed." },
      { status: 422 },
    );
  }

  // Encrypt upstream secret access key with AES-256-GCM before storage
  const encryptedSecretAccessKey = encryptSecret(trimmedSecret);
  const id = crypto.randomUUID();

  const [created] = await db
    .insert(upstreamAccount)
    .values({
      id,
      userId: session.user.id,
      name: trimmedName,
      endpointUrl: trimmedEndpoint,
      region: trimmedRegion,
      accessKeyId: trimmedKeyId,
      encryptedSecretAccessKey,
    })
    .returning({
      id: upstreamAccount.id,
      name: upstreamAccount.name,
      endpointUrl: upstreamAccount.endpointUrl,
      region: upstreamAccount.region,
      accessKeyId: upstreamAccount.accessKeyId,
      createdAt: upstreamAccount.createdAt,
      updatedAt: upstreamAccount.updatedAt,
    });

  return NextResponse.json({ account: created }, { status: 201 });
}
