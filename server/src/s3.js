import {
    S3Client,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
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

// Uses the S3 multipart upload API (via @aws-sdk/lib-storage's Upload
// helper) rather than a single PutObjectCommand. This lets `body` be a
// Node readable stream instead of a fully-buffered Buffer, so uploads of
// tens of gigabytes never need to be held entirely in memory at once -
// each ~8 MiB part is streamed, uploaded, and released independently.
// Falls back gracefully to a plain in-memory Buffer body too (still works
// for small files / tests that pass one directly).
export async function putObject({ key, body, contentType }) {
    // Note: ContentLength is deliberately NOT passed here - lib-storage's
    // Upload determines/streams part sizes itself, and supplying a
    // total ContentLength alongside a streamed multipart body can conflict
    // with what the S3-compatible endpoint expects per part.
    const upload = new Upload({
        client: s3,
        params: {
            Bucket: BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType || 'application/octet-stream',
        },
        // 8 MiB parts, up to 4 concurrent part uploads - a reasonable
        // balance between memory footprint and throughput for very large
        // (multi-GB) files on typical VPS bandwidth.
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
    });
    await upload.done();
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

// Sums the size of every object under our own prefix in the (possibly
// shared) bucket, for the admin panel's "actual S3 usage" metric. Paginates
// through ListObjectsV2 in case there are many objects.
export async function getBucketUsage() {
    let continuationToken;
    let totalBytes = 0;
    let objectCount = 0;

    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: PREFIX,
                ContinuationToken: continuationToken,
            })
        );
        for (const obj of res.Contents || []) {
            totalBytes += obj.Size || 0;
            objectCount += 1;
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);

    return { totalBytes, objectCount, bucket: BUCKET, prefix: PREFIX };
}
