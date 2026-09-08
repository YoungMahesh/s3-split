import { handleS3GatewayRequest } from "@/lib/s3/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

async function dispatch(request: Request, { params }: RouteParams) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>InvalidRequest</Code>
  <Message>Bucket name is required in path.</Message>
</Error>`,
      {
        status: 400,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      },
    );
  }

  const bucketName = path[0];
  const objectKey = path.slice(1).join("/");

  return handleS3GatewayRequest(request, { bucketName, objectKey });
}

export const GET = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const HEAD = dispatch;
export const POST = dispatch;
