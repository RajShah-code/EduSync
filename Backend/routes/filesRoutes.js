const express = require('express');
const router = express.Router();
const { BrevoClient } = require('@getbrevo/brevo');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const protect = require('../middleware/authMiddleware');

// In-memory rate limiting map: userId -> Array of timestamp numbers
const rateLimitMap = new Map();
const MAX_SENDS_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

// Export rateLimitMap for reset/inspection in verification tests if needed
router._rateLimitMap = rateLimitMap;

/**
 * POST /files/email-zip
 * Auth: Student role required
 * Body: { zipData: "base64...", recipientEmail: "string", folderName?: "string" }
 */
router.post('/email-zip', protect(['student']), async (req, res) => {
  const userId = req.user?.id;
  const studentName = req.user?.name || req.user?.email || 'Student';
  const { zipData, recipientEmail, folderName } = req.body || {};

  console.log(`[DEBUG] Email Zip Request received from User ID: ${userId}, Recipient: ${recipientEmail || 'N/A'}`);

  // 1. Email format validation
  if (!recipientEmail || typeof recipientEmail !== 'string') {
    return res.status(400).json({ message: 'Recipient email is required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail.trim())) {
    console.log(`[DEBUG] Email validation failed for: ${recipientEmail}`);
    return res.status(400).json({ message: 'Invalid recipient email format.' });
  }

  if (!zipData || typeof zipData !== 'string') {
    return res.status(400).json({ message: 'Zip file data is required.' });
  }

  // 2. Decode base64 payload & Size Check
  let zipBuffer;
  try {
    // Strip data URL prefix if present (e.g., "data:application/zip;base64,...")
    const cleanBase64 = zipData.includes(',') ? zipData.split(',')[1] : zipData;
    zipBuffer = Buffer.from(cleanBase64, 'base64');
  } catch (err) {
    console.error(`[DEBUG] Failed to decode zip base64 payload: ${err.message}`);
    return res.status(400).json({ message: 'Invalid zip file base64 data.' });
  }

  const sizeInMB = (zipBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[DEBUG] Size check: ${zipBuffer.length} bytes (~${sizeInMB} MB)`);

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  if (zipBuffer.length > MAX_SIZE_BYTES) {
    console.log(`[DEBUG] Size check rejected: Payload ${sizeInMB} MB exceeds 20MB limit`);
    return res.status(413).json({
      message: `Zip payload exceeds maximum allowed size of 20MB (received ${sizeInMB} MB).`,
    });
  }

  // 3. Rate Limit Check (max 5 per student per hour)
  const now = Date.now();
  let userTimestamps = rateLimitMap.get(userId) || [];
  userTimestamps = userTimestamps.filter((ts) => now - ts < ONE_HOUR_MS);

  console.log(`[DEBUG] Rate-limit check: User ID ${userId} has ${userTimestamps.length} sends in the last hour.`);

  if (userTimestamps.length >= MAX_SENDS_PER_HOUR) {
    console.log(`[DEBUG] Rate limit exceeded for User ID ${userId}`);
    return res.status(429).json({
      message: `Rate limit exceeded. Maximum ${MAX_SENDS_PER_HOUR} email sends allowed per hour. Please try again later.`,
    });
  }

  // 4. Backblaze B2 Upload & Presigned URL Generation
  let downloadUrl;
  const objectKey = `uploads/${userId}-${Date.now()}.zip`;
  const bucketName = process.env.B2_BUCKET_NAME;

  try {
    const keyId = process.env.B2_KEY_ID;
    const applicationKey = process.env.B2_APPLICATION_KEY;
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION || 'us-east-005';

    if (!keyId || !applicationKey || !endpoint || !bucketName) {
      console.error('[DEBUG] B2 configuration missing (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, or B2_ENDPOINT not set).');
      return res.status(500).json({ message: 'B2 storage service is not configured on the server.' });
    }

    const s3Client = new S3Client({
      endpoint: endpoint,
      region: region,
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: applicationKey,
      },
    });

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: zipBuffer,
      ContentType: 'application/zip',
    });

    await s3Client.send(putCommand);
    console.log(`[DEBUG] B2 upload success. Bucket: ${bucketName}, Key: ${objectKey}`);

    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Presigned link expires in 48 hours (172,800 seconds)
    const EXPIRES_IN_SECONDS = 48 * 60 * 60;
    downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: EXPIRES_IN_SECONDS });
    console.log(`[DEBUG] B2 presigned GET URL generated successfully. Key: ${objectKey}, Expiry: 48 hours`);
  } catch (err) {
    console.error(`[DEBUG] B2 upload/presign failure for User ID ${userId}:`, err.message);
    return res.status(500).json({
      message: `Failed to upload zip package to cloud storage: ${err.message}`,
      error: err.message,
    });
  }

  // 5. Brevo Transactional Email Send (Download Link Body, No Attachment)
  try {
    const brevoApiKey = process.env.BREVO_API_KEY;

    if (!brevoApiKey) {
      console.error('[DEBUG] Brevo configuration missing (BREVO_API_KEY not set).');
      return res.status(500).json({ message: 'Email service is not configured on the server.' });
    }

    const brevoClient = new BrevoClient({ apiKey: brevoApiKey });

    const formattedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const mailBodyText = `Hello,\n\nPlease find the download link for the zipped folder requested by ${studentName}.\n\nYour files are ready: ${downloadUrl}\nThis link expires in 48 hours.\n\nDate: ${formattedDate}\nSize: ${sizeInMB} MB\n\nBest regards,\nEduSync Platform`;

    console.log(`[DEBUG] Initiating Brevo API send to recipient: ${recipientEmail.trim()}`);
    const startTime = Date.now();

    const response = await brevoClient.transactionalEmails.sendTransacEmail({
      sender: { name: 'EduSync', email: 'edusync.platform@gmail.com' },
      to: [{ email: recipientEmail.trim() }],
      subject: `EduSync Folder Download - ${studentName} (${formattedDate})`,
      textContent: mailBodyText,
    });

    const durationMs = Date.now() - startTime;
    const messageId = response.data?.messageId || response.messageId || 'sent';
    console.log(`[DEBUG] Brevo API send success in ${durationMs}ms. MessageId: ${messageId}`);

    // Record this send attempt for rate limiting only on confirmed successful send
    userTimestamps.push(now);
    rateLimitMap.set(userId, userTimestamps);

    return res.status(200).json({
      message: 'Folder uploaded and email download link sent successfully!',
      messageId: messageId,
      recipient: recipientEmail.trim(),
    });
  } catch (err) {
    const fullErrStr = err.body ? `${err.message} (Body: ${JSON.stringify(err.body)})` : err.message;
    console.error(`[DEBUG] Brevo API send failure for recipient ${recipientEmail}:`, fullErrStr);
    return res.status(500).json({
      message: `Failed to send email: ${fullErrStr}`,
      error: err.message,
      responseDetails: err.body || null,
    });
  }
});

module.exports = router;
