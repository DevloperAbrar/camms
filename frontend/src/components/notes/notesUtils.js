import axios from 'axios';
import { initiateNoteUpload, confirmNoteUpload, removeNoteAttachment } from '../../api/notes.api';

export const TYPE_LABELS = {
  note: 'Lecture note', formula_sheet: 'Formula sheet', worksheet: 'Worksheet', revision: 'Revision', homework: 'Homework',
};

export const STATUS_BADGE = {
  draft: { label: 'Draft', variant: 'default' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  published: { label: 'Published', variant: 'success' },
  taken_down: { label: 'Taken down', variant: 'danger' },
};

export const ACCEPT_FILES = '.pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp';

export const msgOf = (e, fallback = 'Something went wrong. Please try again.') =>
  e?.response?.data?.message || e?.message || fallback;

export function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Resizes to max 1600px and re-encodes as WebP (same look, ~70-80% smaller). Falls back to the original file on any problem.
export async function compressImage(file, { maxDim = 1600, quality = 0.82 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob || (blob.size >= file.size && scale === 1)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

// initiate -> upload straight to R2 -> confirm. The file never passes through our server.
export async function uploadNoteFile(noteId, file, kind, onProgress) {
  const init = await initiateNoteUpload(noteId, { fileName: file.name, mime: file.type, sizeBytes: file.size, kind });
  const { attachmentId, uploadUrl, headers } = init.data.data;
  try {
    await axios.put(uploadUrl, file, {
      headers,
      withCredentials: false,
      onUploadProgress: (e) => onProgress && onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    });
  } catch (err) {
    removeNoteAttachment(noteId, attachmentId).catch(() => {});
    throw new Error('Upload failed. Check your internet connection and try again.');
  }
  const res = await confirmNoteUpload(noteId, attachmentId);
  return res.data.data;
}

// Opens a freshly signed link. The blank tab is opened first so popup blockers allow it.
export async function openSignedUrl(fetchUrl) {
  const w = window.open('', '_blank');
  if (w) w.opener = null;
  try {
    const url = await fetchUrl();
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (err) {
    if (w) w.close();
    throw err;
  }
}