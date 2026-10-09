import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Eye, Trash2, EyeOff, Send, Paperclip, Users } from 'lucide-react';
import { getNotesMeta, listMyNotes, deleteNote, unpublishNote, publishNote, getNoteReaders } from '../../api/notes.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { TYPE_LABELS, STATUS_BADGE, msgOf, formatBytes } from '../../components/notes/notesUtils';

const FILTERS = [['all', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['taken_down', 'Taken down']];

export default function FacultyNotes() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [readers, setReaders] = useState(null);
  const [error, setError] = useState('');

  const meta = useQuery({ queryKey: ['fa-notes-meta'], queryFn: () => getNotesMeta().then((r) => r.data.data) });
  const enabled = meta.data?.enabled;

  const list = useQuery({
    queryKey: ['fa-notes', status, q, page],
    queryFn: () => listMyNotes({ status, q: q || undefined, page }).then((r) => r.data.data),
    enabled: !!enabled,
    placeholderData: (prev) => prev,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['fa-notes'] });
  const act = useMutation({
    mutationFn: ({ kind, id }) => (kind === 'delete' ? deleteNote(id) : kind === 'unpublish' ? unpublishNote(id) : publishNote(id)),
    onSuccess: () => { setError(''); refresh(); },
    onError: (e) => setError(msgOf(e)),
  });

  const openReaders = async (n) => {
    try {
      const r = await getNoteReaders(n.id);
      setReaders({ note: n, ...r.data.data });
    } catch (e) { setError(msgOf(e)); }
  };

  if (meta.isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  if (!enabled) {
    return (
      <Card><p className="text-sm text-[#64748b] text-center py-10">Notes is not enabled for your school yet. Please ask your school admin to contact support.</p></Card>
    );
  }

  const s = meta.data.settings;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Notes</h1>
          <p className="text-sm text-[#64748b] mt-1">Share study material with the parents of your students.</p>
        </div>
        <Button icon={Plus} onClick={() => navigate('/faculty/notes/editor')}>New note</Button>
      </div>

      {s.usedPct >= 80 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          School storage is {s.usedPct}% full ({formatBytes(s.usedBytes)} of {formatBytes(s.quotaBytes)}). New uploads stop at 100%.
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{error}</div>}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([v, l]) => (
            <button key={v} onClick={() => { setStatus(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${status === v ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'}`}>
              {l}
            </button>
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
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">No notes yet. Click "New note" to create one.</p></Card>
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
                    <p className="text-xs text-[#64748b] mt-1">
                      {n.className} · {n.subjectName}{n.chapterTitle ? ` · ${n.chapterTitle}` : ''} · {n.audienceLabel || 'No audience selected'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[#94a3b8]">
                      {n.fileCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} />{n.fileCount} file{n.fileCount > 1 ? 's' : ''}</span>}
                      {n.status === 'scheduled' && n.publishAt && <span>Goes live {new Date(n.publishAt).toLocaleString('en-IN')}</span>}
                      {n.status === 'published' && n.stats && <span>Seen by {n.stats.viewed}/{n.stats.audience} parents ({n.stats.percent}%)</span>}
                      {n.status === 'taken_down' && n.takedownReason && <span className="text-red-500">Reason: {n.takedownReason}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.status === 'published' && <Button size="sm" variant="ghost" icon={Users} onClick={() => openReaders(n)}>Readers</Button>}
                    {n.status !== 'taken_down' && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => navigate(`/faculty/notes/editor/${n.id}`)}>Edit</Button>}
                    {n.status === 'draft' && <Button size="sm" variant="outline" icon={Send} loading={act.isPending} onClick={() => act.mutate({ kind: 'publish', id: n.id })}>Publish</Button>}
                    {(n.status === 'published' || n.status === 'scheduled') && <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => act.mutate({ kind: 'unpublish', id: n.id })}>Unpublish</Button>}
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { if (window.confirm('Delete this note? Parents will no longer see it.')) act.mutate({ kind: 'delete', id: n.id }); }}>Delete</Button>
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

      <Modal open={!!readers} onClose={() => setReaders(null)} title="Who has opened this note" size="lg">
        {readers && (
          <div className="space-y-3">
            <p className="text-sm text-[#475569]"><b>{readers.viewed}</b> of <b>{readers.total}</b> parents have opened it ({readers.percent}%).</p>
            <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-lg">
              {readers.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <p className="text-sm text-[#1e293b]">{s.name}</p>
                    <p className="text-xs text-[#94a3b8]">{s.sectionName}{s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}</p>
                  </div>
                  {s.viewedAt ? <Badge label={`Seen ${new Date(s.viewedAt).toLocaleDateString('en-IN')}`} variant="success" /> : <Badge label="Not seen" variant="default" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}