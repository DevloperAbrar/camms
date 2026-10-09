import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, Ban, RotateCcw, ExternalLink, FileText } from 'lucide-react';
import { getAdminNotesUsage, listAdminNotes, getAdminNote, takedownNote, restoreNote, getAdminNoteAttachmentUrl } from '../../api/notes.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import NoteContent from '../../components/notes/NoteContent';
import { TYPE_LABELS, STATUS_BADGE, msgOf, formatBytes, openSignedUrl } from '../../components/notes/notesUtils';

const FILTERS = [['all', 'All'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['draft', 'Drafts'], ['taken_down', 'Taken down']];

export default function AdminNotes() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState(null);
  const [down, setDown] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const usage = useQuery({ queryKey: ['ad-notes-usage'], queryFn: () => getAdminNotesUsage().then((r) => r.data.data) });
  const enabled = usage.data?.settings.enabled;

  const list = useQuery({
    queryKey: ['ad-notes', status, q, page],
    queryFn: () => listAdminNotes({ status, q: q || undefined, page }).then((r) => r.data.data),
    enabled: !!enabled,
    placeholderData: (prev) => prev,
  });
  const detail = useQuery({
    queryKey: ['ad-note', viewId],
    queryFn: () => getAdminNote(viewId).then((r) => r.data.data),
    enabled: !!viewId,
    gcTime: 0,
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['ad-notes'] }); qc.invalidateQueries({ queryKey: ['ad-notes-usage'] }); };
  const takedown = useMutation({
    mutationFn: () => takedownNote(down.id, { reason }),
    onSuccess: () => { setDown(null); setReason(''); setError(''); refresh(); },
    onError: (e) => setError(msgOf(e)),
  });
  const restore = useMutation({
    mutationFn: (id) => restoreNote(id),
    onSuccess: () => { setError(''); refresh(); },
    onError: (e) => setError(msgOf(e)),
  });

  if (usage.isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!enabled) {
    return <Card><p className="text-sm text-[#64748b] text-center py-10">Notes is not enabled for your school. Contact support to switch it on.</p></Card>;
  }
  const s = usage.data.settings;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Notes Oversight</h1>
        <p className="text-sm text-[#64748b] mt-1">See every note shared by teachers and take down anything inappropriate.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#475569]">
          <span>Storage used: <b>{formatBytes(s.usedBytes)}</b> of <b>{formatBytes(s.quotaBytes)}</b> ({s.usedPct}%)</span>
          <span>{usage.data.total} notes · {usage.data.published} published</span>
        </div>
        <div className="mt-2 h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div className={`h-full ${s.usedPct >= 90 ? 'bg-red-500' : s.usedPct >= 80 ? 'bg-amber-500' : 'bg-[#f97316]'}`} style={{ width: `${Math.min(100, s.usedPct)}%` }} />
        </div>
      </Card>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => { setStatus(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${status === v ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}>{l}</button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by title"
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          </div>
        </div>
      </Card>

      {list.isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !list.data?.notes.length ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">No notes found.</p></Card>
      ) : (
        <div className="space-y-3">
          {list.data.notes.map((n) => {
            const b = STATUS_BADGE[n.status] || STATUS_BADGE.draft;
            return (
              <Card key={n.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[#1e293b] break-words">{n.title}</p>
                      <Badge label={b.label} variant={b.variant} />
                      <Badge label={TYPE_LABELS[n.type] || n.type} variant="orange" />
                    </div>
                    <p className="text-xs text-[#64748b] mt-1">{n.authorName} · {n.className} · {n.subjectName} · {n.audienceLabel || 'No audience'}</p>
                    {n.status === 'published' && n.stats && <p className="text-xs text-[#94a3b8] mt-1">Seen by {n.stats.viewed}/{n.stats.audience} parents ({n.stats.percent}%)</p>}
                    {n.status === 'taken_down' && <p className="text-xs text-red-500 mt-1">Reason: {n.takedownReason}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" icon={Eye} onClick={() => setViewId(n.id)}>View</Button>
                    {n.status !== 'taken_down' && <Button size="sm" variant="danger" icon={Ban} onClick={() => { setDown(n); setReason(''); setError(''); }}>Take down</Button>}
                    {n.status === 'taken_down' && <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => restore.mutate(n.id)}>Restore</Button>}
                  </div>
                </div>
              </Card>
            );
          })}
          {list.data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-[#64748b]">Page {page} of {list.data.totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= list.data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}

      <Modal open={!!viewId} onClose={() => setViewId(null)} title={detail.data?.title || 'Note'} size="xl">
        {detail.isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : detail.data && (
          <div className="space-y-5">
            <p className="text-xs text-[#64748b]">{detail.data.authorName} · {detail.data.className} · {detail.data.subjectName}</p>
            <NoteContent html={detail.data.contentHtml} />
            {detail.data.attachments.length > 0 && (
              <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-lg">
                {detail.data.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0"><FileText size={16} className="text-[#94a3b8]" /><p className="text-sm truncate">{a.fileName}</p></div>
                    <Button size="sm" variant="ghost" icon={ExternalLink}
                      onClick={() => openSignedUrl(() => getAdminNoteAttachmentUrl(detail.data.id, a.id).then((r) => r.data.data.url)).catch((e) => setError(msgOf(e)))}>Open</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!down} onClose={() => setDown(null)} title="Take down this note" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-[#475569]">Parents will stop seeing "{down?.title}" immediately and the teacher will be told why.</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="Reason (required)"
            className="w-full px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDown(null)}>Cancel</Button>
            <Button variant="danger" loading={takedown.isPending} disabled={reason.trim().length < 3} onClick={() => takedown.mutate()}>Take down</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}