const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ── Mirrors Backend/routes/filesRoutes.js's B2 upload flow ─────────────────
//
// filesRoutes.js doesn't export these constants (or the S3Client setup), and
// it's explicitly off-limits to edit (read-only reference per the Connect
// phases' rules), so true reuse via import isn't possible — these are
// deliberately kept numerically identical to filesRoutes.js's
// MAX_SIZE_BYTES / MAX_SENDS_PER_HOUR / ONE_HOUR_MS. If those ever change
// there, change them here too.
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_SENDS_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

// Separate rate-limit map from filesRoutes.js's _rateLimitMap — that one
// counts an unrelated action (email-zip sends); conflating the two would
// incorrectly throttle a student's assignment submissions based on their
// zip-email usage, or vice versa.
const connectRateLimitMap = new Map();

function checkUploadRateLimit(userId) {
  const now = Date.now();
  let timestamps = connectRateLimitMap.get(userId) || [];
  timestamps = timestamps.filter((ts) => now - ts < ONE_HOUR_MS);
  const allowed = timestamps.length < MAX_SENDS_PER_HOUR;
  return {
    allowed,
    record: () => {
      timestamps.push(now);
      connectRateLimitMap.set(userId, timestamps);
    },
  };
}

// decodeBase64File — strips an optional data-URL prefix, decodes, and
// enforces the 20MB cap. Throws { status, message } shaped errors so
// controllers can just catch and respond.
function decodeBase64File(base64Data) {
  let buffer;
  try {
    const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    buffer = Buffer.from(clean, 'base64');
  } catch {
    throw { status: 400, message: 'Invalid file base64 data' };
  }

  const sizeInMB = (buffer.length / (1024 * 1024)).toFixed(2);
  if (buffer.length > MAX_SIZE_BYTES) {
    throw { status: 413, message: `File exceeds maximum allowed size of 20MB (received ${sizeInMB} MB)` };
  }

  return buffer;
}

function getS3Client() {
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION || 'us-east-005';
  const bucketName = process.env.B2_BUCKET_NAME;

  if (!keyId || !applicationKey || !endpoint || !bucketName) {
    throw { status: 500, message: 'B2 storage service is not configured on the server.' };
  }

  return {
    bucketName,
    client: new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
    }),
  };
}

// uploadBufferToB2 — under the connect-assignments/ key prefix, reusing the
// existing B2 bucket (no new bucket) per the task's instruction.
async function uploadBufferToB2(buffer, objectKey, contentType) {
  const { bucketName, client } = getS3Client();
  await client.send(
    new PutObjectCommand({ Bucket: bucketName, Key: objectKey, Body: buffer, ContentType: contentType || 'application/octet-stream' })
  );
  return objectKey;
}

// getPresignedUrlForKey — generated fresh on every read (never baked into
// the DB), so attachment_url/file_url stay valid indefinitely even though
// any single presigned link expires.
async function getPresignedUrlForKey(objectKey, expiresInSeconds = 48 * 60 * 60) {
  if (!objectKey) return null;
  const { bucketName, client } = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// deleteObjectFromB2 — used by material deletion so removing the DB row
// never leaves an orphaned file in the bucket.
async function deleteObjectFromB2(objectKey) {
  if (!objectKey) return;
  const { bucketName, client } = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey }));
}

module.exports = {
  MAX_SIZE_BYTES,
  MAX_SENDS_PER_HOUR,
  checkUploadRateLimit,
  decodeBase64File,
  uploadBufferToB2,
  getPresignedUrlForKey,
  deleteObjectFromB2,
};
