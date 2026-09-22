export interface SnippetOptions {
  endpointUrl: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export interface IntegrationSnippets {
  env: string;
  node: string;
  python: string;
  awsCli: string;
  curl: string;
}

export function generateEnvSnippet(options: SnippetOptions): string {
  const region = options.region || "us-east-1";
  return `AWS_ENDPOINT_URL=${options.endpointUrl}
AWS_REGION=${region}
AWS_ACCESS_KEY_ID=${options.accessKeyId}
AWS_SECRET_ACCESS_KEY=${options.secretAccessKey}
S3_BUCKET_NAME=${options.bucketName}`;
}

export function generateNodeSnippet(options: SnippetOptions): string {
  const region = options.region || "us-east-1";
  return `import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "${options.endpointUrl}",
  region: "${region}",
  credentials: {
    accessKeyId: "${options.accessKeyId}",
    secretAccessKey: "${options.secretAccessKey}",
  },
  forcePathStyle: true,
});

// Example: Upload an object
await s3.send(
  new PutObjectCommand({
    Bucket: "${options.bucketName}",
    Key: "example.txt",
    Body: "Hello from S3-Split!",
  })
);`;
}

export function generatePythonSnippet(options: SnippetOptions): string {
  const region = options.region || "us-east-1";
  return `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="${options.endpointUrl}",
    region_name="${region}",
    aws_access_key_id="${options.accessKeyId}",
    aws_secret_access_key="${options.secretAccessKey}",
)

# Example: Upload an object
s3.put_object(
    Bucket="${options.bucketName}",
    Key="example.txt",
    Body=b"Hello from S3-Split!",
)`;
}

export function generateAwsCliSnippet(options: SnippetOptions): string {
  const region = options.region || "us-east-1";
  return `# Configure custom profile for S3-Split
aws configure set aws_access_key_id "${options.accessKeyId}" --profile s3-split
aws configure set aws_secret_access_key "${options.secretAccessKey}" --profile s3-split
aws configure set region "${region}" --profile s3-split

# Example: List objects using custom endpoint
aws s3 ls s3://${options.bucketName}/ --endpoint-url ${options.endpointUrl} --profile s3-split`;
}

export function generateCurlSnippet(options: SnippetOptions): string {
  const region = options.region || "us-east-1";
  return `# List objects via S3 gateway proxy with SigV4 signed curl
curl -X GET "${options.endpointUrl}/${options.bucketName}/" \\
  --aws-sigv4 "aws:amz:${region}:s3" \\
  --user "${options.accessKeyId}:${options.secretAccessKey}"

# Upload object via S3 gateway proxy
curl -X PUT "${options.endpointUrl}/${options.bucketName}/example.txt" \\
  --aws-sigv4 "aws:amz:${region}:s3" \\
  --user "${options.accessKeyId}:${options.secretAccessKey}" \\
  -H "Content-Type: text/plain" \\
  -d "Hello from S3-Split!"`;
}

export function generateAllSnippets(options: SnippetOptions): IntegrationSnippets {
  return {
    env: generateEnvSnippet(options),
    node: generateNodeSnippet(options),
    python: generatePythonSnippet(options),
    awsCli: generateAwsCliSnippet(options),
    curl: generateCurlSnippet(options),
  };
}
