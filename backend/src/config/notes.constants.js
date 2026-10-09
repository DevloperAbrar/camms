const MB = 1024 * 1024;

const NOTE_TYPES = ['note', 'formula_sheet', 'worksheet', 'revision', 'homework'];

// Allowlist. `magic` is checked against the first bytes of the uploaded object.
const FILE_TYPES = {
  'application/pdf': { exts: ['pdf'], magic: 'pdf', group: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { exts: ['docx'], magic: 'zip', group: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { exts: ['pptx'], magic: 'zip', group: 'document' },
  'image/jpeg': { exts: ['jpg', 'jpeg'], magic: 'jpeg', group: 'image' },
  'image/png': { exts: ['png'], magic: 'png', group: 'image' },
  'image/webp': { exts: ['webp'], magic: 'webp', group: 'image' },
};

const LIMITS = {
  maxFilesPerNote: 5,
  maxLinksPerNote: 10,
  maxInlineImagesPerNote: 10,
  maxNoteBytes: 25 * MB,
  imageAttachmentMaxBytes: 5 * MB,
  inlineImageMaxBytes: 2 * MB,
  defaultFileMb: 10,
  fileMbCeiling: 25,
  maxHtmlChars: 300000,
  uploadUrlTtlSec: 300,
  viewUrlTtlSec: 600,
  editUrlTtlSec: 3600,
  pendingUploadTtlHours: 24,
  orphanImageGraceMinutes: 30,
  trashRetentionDays: 30,
};

// True when the first bytes of the file look like what its declared type should be.
function matchesMagic(kind, b) {
  if (!b || b.length < 12) return false;
  switch (kind) {
    case 'pdf':  return b.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'zip':  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    case 'jpeg': return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'png':  return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'webp': return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
    default:     return false;
  }
}

module.exports = { MB, NOTE_TYPES, FILE_TYPES, LIMITS, matchesMagic };