import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const {
    S3_ENDPOINT,
    S3_REGION = 'us-east-1',
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
    S3_BUCKET,
    S3_PREFIX = '',
} = process.env;

if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    throw new Error(
        'Missing required S3 configuration. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET (see .env.example).'
    );
}

export const BUCKET = S3_BUCKET;
export const PREFIX = S3_PREFIX;

export const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
    // Most S3-compatible providers (Neo.id NOS, MinIO, etc.) require
    // path-style addressing rather than virtual-hosted-style.
    forcePathStyle: true,
});

export async function checkBucketAccess() {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
}

export function buildKey(id, originalName) {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${PREFIX}${id}-${safeName}`;
}

export async function putObject({ key, body, contentType, contentLength }) {
    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType || 'application/octet-stream',
            ContentLength: contentLength,
        })
    );
}

export async function deleteObject(key) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getPresignedDownloadUrl(key, { expiresInSeconds = 3600, filename, forceDownload = false } = {}) {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ...(forceDownload && filename
            ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"` }
            : {}),
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

// Fetches the object directly from S3 so it can be streamed back to the
// client through our own backend. Used instead of a redirect to a
// presigned S3 URL so the S3/NOS endpoint is never exposed to end users —
// the browser only ever talks to tempfile.xyz, keeping the app genuinely
// self-hosted from the visitor's point of view.
export async function getObject(key) {
    return s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
}
