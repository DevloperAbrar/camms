import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Paperclip, Download, Eye, ExternalLink, FileText } from 'lucide-react';
import { getMyChildren } from '../../api/parent.api';
import { getParentNotesMeta, listParentNotes, getParentNote, getParentNoteAttachmentUrl } from '../../api/notes.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import NoteContent from '../../components/notes/NoteContent';
import { TYPE_LABELS, msgOf, formatBytes, openSignedUrl } from '../../components/notes/notesUtils';

export default function ParentNotes() {
  const qc = useQueryClient();
  const [childId, setChildId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [unread, setUnread] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
  });
  const sid = childId || children[0]?.id || '';

  const meta = useQuery({
    queryKey: ['pa-notes-meta', sid],
    queryFn: () => getParentNotesMeta({ studentId: sid }).then((r) => r.data.data),
    enabled: !!sid,
  });
  const enabled = meta.data?.enabled;

  const list = useQuery({
    queryKey: ['pa-notes', sid, subjectId, chapterId, unread, q, page],
    queryFn: () => listParentNotes({ studentId: sid, subjectId: subjectId || undefined, chapterId: chapterId || undefined, unread: unread ? '1' : undefined, q: q || undefined, page }).then((r) => r.data.data),
    enabled: !!sid && !!enabled,
    placeholderData: (prev) => prev,
  });

  const detail = useQuery({
    queryKey: ['pa-note', sid, openId],
    queryFn: () => getParentNote(openId, { studentId: sid }).then((r) => r.data.data),
    enabled: !!openId,
    gcTime: 0, // signed image links expire, always fetch fresh
  });

  const closeNote = () => {
    setOpenId(null);
    qc.invalidateQueries({ queryKey: ['pa-notes'] });
    qc.invalidateQueries({ queryKey: ['pa-notes-meta'] });
  };

  const openFile = (a, disposition) => {
    setError('');
    openSignedUrl(() => getParentNoteAttachmentUrl(openId, a.id, { studentId: sid, disposition }).then((r) => r.data.data.url))
      .catch((e) => setError(msgOf(e)));
  };

  const pickChild = (id) => { setChildId(id); setSubjectId(''); setChapterId(''); setPage(1); };
  const chaptersForSubject = (meta.data?.chapters || []).filter((c) => !subjectId || c.subjectId === subjectId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Study Notes</h1>
        <p className="text-sm text-[#64748b] mt-1">Notes and material shared by your child's teachers.</p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button key={c.id} onClick={() => pickChild(c.id)}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${sid === c.id ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingChildren || (sid && meta.isLoading) ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !sid ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No children found.</p></Card>
      ) : !enabled ? (
        <Card><p className="text-sm text-[#64748b] text-center py-10">Study notes are not available for this school.</p></Card>
      ) : (
        <>
          <p className="text-sm text-[#475569]">{meta.data.className} · Section {meta.data.sectionName}{meta.data.totalUnread > 0 ? ` · ${meta.data.totalUnread} unread` : ''}</p>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setSubjectId(''); setChapterId(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${!subjectId ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}>All subjects</button>
            {meta.data.subjects.map((s) => (
              <button key={s.id} onClick={() => { setSubjectId(s.id); setChapterId(''); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${subjectId === s.id ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}>
                {s.name} ({s.count}){s.unread > 0 && <span className="ml-1.5 inline-block bg-[#f97316] text-white text-[10px] rounded-full px-1.5 py-0.5">{s.unread}</span>}
              </button>
            ))}
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search notes"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
              </div>
              {chaptersForSubject.length > 0 && (
                <select value={chapterId} onChange={(e) => { setChapterId(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white">
                  <option value="">All chapters</option>
                  {chaptersForSubject.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.count})</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-sm text-[#475569]">
                <input type="checkbox" checked={unread} onChange={(e) => { setUnread(e.target.checked); setPage(1); }} /> Unread only
              </label>
            </div>
          </Card>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>}

          {list.isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !list.data?.notes.length ? (
            <Card><p className="text-sm text-[#94a3b8] text-center py-10">No notes yet.</p></Card>
          ) : (
            <div className="space-y-3">
              {list.data.notes.map((n) => (
                <Card key={n.id} className="cursor-pointer hover:border-[#f97316] transition-colors">
                  <button className="w-full text-left" onClick={() => setOpenId(n.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#1e293b]">{n.title}</p>
                      {n.isNew && <Badge label="New" variant="orange" />}
                      <Badge label={TYPE_LABELS[n.type] || n.type} variant="default" />
                    </div>
                    <p className="text-xs text-[#64748b] mt-1">
                      {n.subjectName}{n.chapterTitle ? ` · ${n.chapterTitle}` : ''} · {n.authorName} · {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-IN') : ''}
                    </p>
                    {n.fileCount > 0 && <p className="text-xs text-[#94a3b8] mt-1 inline-flex items-center gap-1"><Paperclip size={12} />{n.fileCount} attachment{n.fileCount > 1 ? 's' : ''}</p>}
                  </button>
                </Card>
              ))}
              {list.data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="text-sm text-[#64748b]">Page {page} of {list.data.totalPages}</span>
                  <Button size="sm" variant="ghost" disabled={page >= list.data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={!!openId} onClose={closeNote} title={detail.data?.title || 'Note'} size="xl">
        {detail.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : detail.isError ? (
          <p className="text-sm text-red-600">{msgOf(detail.error, 'Could not open this note.')}</p>
        ) : detail.data && (
          <div className="space-y-5">
            <p className="text-xs text-[#64748b]">{detail.data.subjectName}{detail.data.chapterTitle ? ` · ${detail.data.chapterTitle}` : ''} · {detail.data.authorName}</p>
            <NoteContent html={detail.data.contentHtml} />
            {detail.data.attachments.length > 0 && (
              <div>
                <p className="text-sm font-bold text-[#1e293b] mb-2">Attachments</p>
                <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-lg">
                  {detail.data.attachments.map((a) => {
                    const previewable = a.kind === 'link' || a.mime === 'application/pdf' || (a.mime || '').startsWith('image/');
                    const canDownload = detail.data.allowDownload && a.kind === 'file';
                    return (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={16} className="text-[#94a3b8] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-[#1e293b] truncate">{a.fileName}</p>
                            <p className="text-xs text-[#94a3b8] truncate">{a.kind === 'link' ? a.url : formatBytes(a.sizeBytes)}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          {a.kind === 'link' && <Button size="sm" variant="outline" icon={ExternalLink} onClick={() => openFile(a, 'inline')}>Open link</Button>}
                          {a.kind === 'file' && previewable && <Button size="sm" variant="outline" icon={Eye} onClick={() => openFile(a, 'inline')}>View</Button>}
                          {canDownload && <Button size="sm" variant="outline" icon={Download} onClick={() => openFile(a, 'attachment')}>Download</Button>}
                          {a.kind === 'file' && !previewable && !canDownload && <span className="text-xs text-[#94a3b8]">View-only</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}