const crypto = require('crypto');
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');
const httpError = require('../utils/httpError');

let client = null;

function isConfigured() {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
}

function getClient() {
  if (!isConfigured()) throw httpError(503, 'File storage is not configured yet. Please contact support.');
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
      // R2 rejects the extra checksum params newer SDK versions add to presigned URLs
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

const isNotFound = (err) => err && (err.name === 'NotFound' || err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404));

// schools/<schoolId>/notes/<noteId>/<random>.<ext>  (random name, so keys can't be guessed)
function buildKey({ schoolId, noteId, ext }) {
  return `schools/${schoolId}/notes/${noteId}/${crypto.randomUUID()}.${ext}`;
}

function contentDisposition(type, fileName) {
  const safe = String(fileName || 'file').replace(/[\r\n"\\/]/g, '_');
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function presignUpload({ key, contentType, expiresIn }) {
  const cmd = new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(getClient(), cmd, { expiresIn, signableHeaders: new Set(['content-type']) });
}

async function presignDownload({ key, contentType, fileName, disposition = 'inline', expiresIn }) {
  const cmd = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ResponseContentType: contentType || undefined,
    ResponseContentDisposition: contentDisposition(disposition === 'attachment' ? 'attachment' : 'inline', fileName),
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
}

async function head(key) {
  try {
    const r = await getClient().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return { size: Number(r.ContentLength || 0), contentType: r.ContentType || null };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function readHead(key, bytes = 16) {
  const r = await getClient().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }));
  return Buffer.from(await r.Body.transformToByteArray());
}

async function remove(key) {
  if (!key) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

async function removeMany(keys) {
  const list = keys.filter(Boolean);
  for (let i = 0; i < list.length; i += 500) {
    await getClient().send(new DeleteObjectsCommand({
      Bucket: env.R2_BUCKET,
      Delete: { Objects: list.slice(i, i + 500).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}

module.exports = { isConfigured, buildKey, presignUpload, presignDownload, head, readHead, remove, removeMany };