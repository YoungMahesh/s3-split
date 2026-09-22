import { getQuotaColor, type QuotaProgressState } from "@/app/components/ui/progress";

export interface QuotaSimulationResult {
  objectSizeMb: number;
  objectSizeBytes: number;
  quotaMb: number;
  quotaBytes: number;
  percentage: number;
  isAllowed: boolean;
  quotaState: QuotaProgressState;
  statusCode: number;
  statusText: string;
  responsePayload: string;
}

export function simulateQuotaEvaluation(
  objectSizeMb: number,
  quotaMb: number = 50,
): QuotaSimulationResult {
  const quotaBytes = quotaMb * 1024 * 1024;
  const objectSizeBytes = Math.round(objectSizeMb * 1024 * 1024);
  const percentage = (objectSizeBytes / quotaBytes) * 100;
  const quotaState = getQuotaColor(percentage);
  const isAllowed = objectSizeBytes <= quotaBytes;

  const statusCode = isAllowed ? 200 : 403;
  const statusText = isAllowed ? "OK" : "Forbidden";

  const responsePayload = isAllowed
    ? `HTTP/1.1 200 OK\n` +
      `x-amz-id-2: s3split-gw-proxy-node-1\n` +
      `x-amz-request-id: 7G9X2B01K4M9Q\n` +
      `Date: Tue, 22 Sep 2026 07:30:00 GMT\n` +
      `ETag: "a1b2c3d4e5f60718293a4b5c6d7e8f90"\n` +
      `Content-Length: 0\n` +
      `Server: S3-Split-Gateway/1.0\n` +
      `x-s3split-quota-status: WithinQuota\n` +
      `x-s3split-bytes-allocated: ${objectSizeBytes.toLocaleString()}`
    : `HTTP/1.1 403 Forbidden\n` +
      `x-amz-request-id: 7G9X2B01K4M9Q\n` +
      `Content-Type: application/xml\n` +
      `Server: S3-Split-Gateway/1.0\n\n` +
      `<Error>\n` +
      `  <Code>QuotaExceeded</Code>\n` +
      `  <Message>Bucket quota of ${quotaBytes.toLocaleString()} bytes exceeded.</Message>\n` +
      `  <BucketName>marketing-assets</BucketName>\n` +
      `  <AttemptedSizeBytes>${objectSizeBytes.toLocaleString()}</AttemptedSizeBytes>\n` +
      `  <StorageQuotaBytes>${quotaBytes.toLocaleString()}</StorageQuotaBytes>\n` +
      `  <CurrentUsageBytes>0</CurrentUsageBytes>\n` +
      `</Error>`;

  return {
    objectSizeMb,
    objectSizeBytes,
    quotaMb,
    quotaBytes,
    percentage,
    isAllowed,
    quotaState,
    statusCode,
    statusText,
    responsePayload,
  };
}

export interface SdkTabConfig {
  id: string;
  label: string;
  language: string;
  title: string;
  code: string;
}

export const SDK_INTEGRATION_TABS: SdkTabConfig[] = [
  {
    id: "typescript",
    label: "TypeScript (AWS SDK v3)",
    language: "typescript",
    title: "Node.js / TypeScript - @aws-sdk/client-s3",
    code: `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Standard AWS SDK with zero code changes
const s3 = new S3Client({
  region: "us-east-1",
  endpoint: "https://s3.your-domain.com", // S3-Split Gateway Proxy
  credentials: {
    accessKeyId: "s3s_ck_live_9a7d2e4f1b8c",   // Client Key ID
    secretAccessKey: "s3s_sec_4f1b8c9a7d2e4f", // Client Secret Key
  },
});

// Upload to Managed Bucket (transparently mapped to upstream storage)
await s3.send(
  new PutObjectCommand({
    Bucket: "marketing-assets",
    Key: "reports/q3-summary.pdf",
    Body: fileStream,
  })
);`,
  },
  {
    id: "python",
    label: "Python (Boto3)",
    language: "python",
    title: "Python 3 - boto3 client",
    code: `import boto3

# Connect standard Boto3 client to S3-Split Gateway
s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.your-domain.com",  # S3-Split Gateway
    aws_access_key_id="s3s_ck_live_9a7d2e4f1b8c",
    aws_secret_access_key="s3s_sec_4f1b8c9a7d2e4f",
    region_name="us-east-1",
)

# Upload executes with real-time byte quota enforcement
s3.upload_file(
    Filename="q3-summary.pdf",
    Bucket="marketing-assets",
    Key="reports/q3-summary.pdf",
)`,
  },
  {
    id: "go",
    label: "Go (AWS SDK v2)",
    language: "go",
    title: "Go - aws-sdk-go-v2/service/s3",
    code: `package main

import (
	"context"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func main() {
	// Custom endpoint resolver pointing to S3-Split Gateway
	resolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{URL: "https://s3.your-domain.com"}, nil
		},
	)

	cfg, _ := config.LoadDefaultConfig(context.TODO(),
		config.WithEndpointResolverWithOptions(resolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			"s3s_ck_live_9a7d2e4f1b8c", "s3s_sec_4f1b8c9a7d2e4f", "",
		)),
	)

	client := s3.NewFromConfig(cfg)
	file, _ := os.Open("q3-summary.pdf")
	defer file.Close()

	_, _ = client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String("marketing-assets"),
		Key:    aws.String("reports/q3-summary.pdf"),
		Body:   file,
	})
}`,
  },
  {
    id: "cli",
    label: "AWS CLI",
    language: "bash",
    title: "Command Line - aws s3",
    code: `# Configure environment or pass --endpoint-url directly
export AWS_ACCESS_KEY_ID="s3s_ck_live_9a7d2e4f1b8c"
export AWS_SECRET_ACCESS_KEY="s3s_sec_4f1b8c9a7d2e4f"
export AWS_ENDPOINT_URL="https://s3.your-domain.com"

# Standard S3 commands work seamlessly with S3-Split
aws s3 cp ./q3-summary.pdf s3://marketing-assets/reports/q3-summary.pdf

# List objects inside the isolated Managed Bucket
aws s3 ls s3://marketing-assets/`,
  },
];
