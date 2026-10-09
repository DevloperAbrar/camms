import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Send, CalendarClock, Paperclip, Link2, Trash2, FileText, ExternalLink } from 'lucide-react';
import {
  getNotesMeta, getNoteChapters, getNoteStudents, getMyNote, createNote, updateNote, publishNote,
  addNoteLink, removeNoteAttachment, getMyNoteAttachmentUrl,
} from '../../api/notes.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import RichTextEditor from '../../components/notes/RichTextEditor';
import {
  TYPE_LABELS, STATUS_BADGE, ACCEPT_FILES, msgOf, formatBytes, compressImage, uploadNoteFile, openSignedUrl,
} from '../../components/notes/notesUtils';

const selectCls = 'w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]';
const labelCls = 'text-sm font-medium text-[#374151]';

export default function NoteEditor() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const idRef = useRef(paramId || null);
  const loadedFor = useRef(paramId ? null : 'new');
  const fileRef = useRef(null);

  const [ready, setReady] = useState(!paramId);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState(null);
  const [schedule, setSchedule] = useState('');
  const [link, setLink] = useState({ title: '', url: '' });
  const [form, setForm] = useState({
    title: '', type: 'note', combo: '', chapterId: '', allowDownload: true,
    mode: 'sections', sectionIds: [], studentIds: [], studentSection: '', html: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const meta = useQuery({ queryKey: ['fa-notes-meta'], queryFn: () => getNotesMeta().then((r) => r.data.data) });
  const note = useQuery({
    queryKey: ['fa-note', paramId],
    queryFn: () => getMyNote(paramId).then((r) => r.data.data),
    enabled: !!paramId,
  });

  // Fill the form once when an existing note arrives (never again, so refetches don't wipe typing)
  useEffect(() => {
    if (!note.data || loadedFor.current === paramId) return;
    const n = note.data;
    loadedFor.current = paramId;
    idRef.current = paramId;
    setForm({
      title: n.title, type: n.type, combo: `${n.classId}|${n.subjectId}`, chapterId: n.chapterId || '',
      allowDownload: n.allowDownload, mode: n.audience.mode, sectionIds: n.audience.sectionIds,
      studentIds: n.audience.studentIds, studentSection: '', html: n.contentHtml,
    });
    setReady(true);
  }, [note.data, paramId]);

  const classes = meta.data?.classes || [];
  const [classId, subjectId] = form.combo.split('|');
  const comboOptions = classes.flatMap((c) => c.subjects.map((s) => ({ value: `${c.classId}|${s.subjectId}`, label: `${c.className} · ${s.subjectName}` })));
  const sections = classes.find((c) => c.classId === classId)?.subjects.find((s) => s.subjectId === subjectId)?.sections || [];

  const chapters = useQuery({
    queryKey: ['fa-note-ch', classId, subjectId],
    queryFn: () => getNoteChapters({ classId, subjectId }).then((r) => r.data.data),
    enabled: !!(classId && subjectId),
  });
  const students = useQuery({
    queryKey: ['fa-note-stu', classId, subjectId, form.studentSection],
    queryFn: () => getNoteStudents({ classId, subjectId, sectionId: form.studentSection }).then((r) => r.data.data),
    enabled: !!(classId && subjectId && form.mode === 'students' && form.studentSection),
  });

  const status = note.data?.status || 'draft';
  const locked = status === 'taken_down';
  const toggle = (key, id) => set(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);

  const payload = () => ({
    title: form.title.trim(), type: form.type, classId, subjectId, chapterId: form.chapterId || null,
    allowDownload: form.allowDownload, contentHtml: form.html,
    audience: {
      mode: form.mode,
      sectionIds: form.mode === 'sections' ? form.sectionIds : [],
      studentIds: form.mode === 'students' ? form.studentIds : [],
    },
  });

  // Saves the draft (creating it on the first call) and returns the note id
  async function save() {
    if (form.title.trim().length < 2) throw new Error('Enter a title (at least 2 characters) first');
    if (!classId || !subjectId) throw new Error('Select the class and subject first');
    if (idRef.current) {
      await updateNote(idRef.current, payload());
    } else {
      const r = await createNote(payload());
      const nid = r.data.data.id;
      idRef.current = nid;
      loadedFor.current = nid;
      navigate(`/faculty/notes/editor/${nid}`, { replace: true });
    }
    return idRef.current;
  }

  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); }
    catch (e) { setMsg({ ok: false, text: msgOf(e) }); }
    finally { setBusy(false); setProgress(null); }
  };

  const saveDraft = () => run(async () => {
    const nid = await save();
    qc.invalidateQueries({ queryKey: ['fa-note', nid] });
    qc.invalidateQueries({ queryKey: ['fa-notes'] });
  }, 'Saved');

  const publish = (when) => run(async () => {
    const nid = await save();
    await publishNote(nid, when ? { publishAt: new Date(when).toISOString() } : {});
    qc.invalidateQueries({ queryKey: ['fa-notes'] });
    navigate('/faculty/notes');
  });

  const onUploadImage = async (file) => {
    const nid = await save();
    const small = await compressImage(file);
    const att = await uploadNoteFile(nid, small, 'inline_image');
    return { assetId: att.id, url: att.previewUrl };
  };

  const onPickFiles = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    run(async () => {
      const nid = await save();
      for (const f of files) {
        const file = f.type.startsWith('image/') ? await compressImage(f) : f;
        await uploadNoteFile(nid, file, 'file', setProgress);
      }
      qc.invalidateQueries({ queryKey: ['fa-note', nid] });
    }, 'File uploaded');
  };

  const onAddLink = () => run(async () => {
    const nid = await save();
    await addNoteLink(nid, link);
    setLink({ title: '', url: '' });
    qc.invalidateQueries({ queryKey: ['fa-note', nid] });
  });

  const onRemove = (attId) => run(async () => {
    await removeNoteAttachment(idRef.current, attId);
    qc.invalidateQueries({ queryKey: ['fa-note', idRef.current] });
  });

  if (meta.isLoading || (paramId && !ready)) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!meta.data?.enabled) return <Card><p className="text-sm text-[#64748b] text-center py-10">Notes is not enabled for your school.</p></Card>;
  if (!comboOptions.length) return <Card><p className="text-sm text-[#64748b] text-center py-10">You have no class and subject assigned yet, so you cannot post notes.</p></Card>;

  const attachments = note.data?.attachments || [];
  const sb = STATUS_BADGE[status] || STATUS_BADGE.draft;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/faculty/notes')}>Back</Button>
          <h1 className="text-xl font-extrabold text-[#1e293b]">{paramId ? 'Edit note' : 'New note'}</h1>
          <Badge label={sb.label} variant={sb.variant} />
        </div>
      </div>

      {locked && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">This note was taken down by the school admin{note.data?.takedownReason ? `: ${note.data.takedownReason}` : ''}. You cannot edit it.</div>}
      {msg && <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>{msg.text}</div>}

      <Card>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className={labelCls}>Title <span className="text-red-500">*</span></label>
            <input className={selectCls} value={form.title} maxLength={200} disabled={locked} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Chapter 3 - Quadratic equations (formula sheet)" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Class and subject <span className="text-red-500">*</span></label>
            <select className={selectCls} value={form.combo} disabled={locked || status !== 'draft'} onChange={(e) => setForm((f) => ({ ...f, combo: e.target.value, chapterId: '', sectionIds: [], studentIds: [], studentSection: '' }))}>
              <option value="">Select</option>
              {comboOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Type</label>
            <select className={selectCls} value={form.type} disabled={locked} onChange={(e) => set('type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Syllabus chapter (optional)</label>
            <select className={selectCls} value={form.chapterId} disabled={locked || !subjectId} onChange={(e) => set('chapterId', e.target.value)}>
              <option value="">Not linked</option>
              {(chapters.data || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#374151] self-end pb-2">
            <input type="checkbox" checked={form.allowDownload} disabled={locked} onChange={(e) => set('allowDownload', e.target.checked)} />
            Allow parents to download files
          </label>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold text-[#1e293b] mb-3">Who gets this note?</p>
        <div className="flex gap-2 mb-3">
          {[['sections', 'Whole section'], ['students', 'Selected students']].map(([v, l]) => (
            <button key={v} type="button" disabled={locked} onClick={() => set('mode', v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${form.mode === v ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}>{l}</button>
          ))}
        </div>
        {!subjectId ? (
          <p className="text-sm text-[#94a3b8]">Select class and subject first.</p>
        ) : form.mode === 'sections' ? (
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <label key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm cursor-pointer ${form.sectionIds.includes(s.id) ? 'border-[#f97316] bg-orange-50' : 'border-[#e2e8f0]'}`}>
                <input type="checkbox" disabled={locked} checked={form.sectionIds.includes(s.id)} onChange={() => toggle('sectionIds', s.id)} />
                Section {s.name}
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <select className={selectCls} value={form.studentSection} onChange={(e) => set('studentSection', e.target.value)}>
              <option value="">Pick a section to choose students from</option>
              {sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </select>
            {students.isLoading && <Spinner size="sm" />}
            {students.data && (
              <div className="max-h-60 overflow-y-auto border border-[#e2e8f0] rounded-lg divide-y divide-[#f1f5f9]">
                {students.data.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[#f8fafc]">
                    <input type="checkbox" disabled={locked} checked={form.studentIds.includes(s.id)} onChange={() => toggle('studentIds', s.id)} />
                    {s.name}{s.rollNumber ? <span className="text-xs text-[#94a3b8]"> · Roll {s.rollNumber}</span> : null}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-[#64748b]">{form.studentIds.length} student{form.studentIds.length === 1 ? '' : 's'} selected</p>
          </div>
        )}
      </Card>

      <div>
        <p className="text-sm font-bold text-[#1e293b] mb-2">Content</p>
        <RichTextEditor value={form.html} onChange={(h) => set('html', h)} onUploadImage={onUploadImage} onError={(e) => setMsg({ ok: false, text: msgOf(e) })} disabled={locked} />
        <p className="text-xs text-[#94a3b8] mt-1.5">Hindi and English both work. Pasted or uploaded images are compressed automatically (max 10 per note).</p>
      </div>

      <Card>
        <p className="text-sm font-bold text-[#1e293b] mb-1">Attachments</p>
        <p className="text-xs text-[#64748b] mb-3">PDF, DOCX, PPTX or images. Up to 5 files per note. PDFs open directly for parents; for Word/PowerPoint they can only download, so a PDF is better.</p>
        {attachments.length > 0 && (
          <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-lg mb-3">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {a.kind === 'link' ? <Link2 size={16} className="text-[#94a3b8] shrink-0" /> : <FileText size={16} className="text-[#94a3b8] shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm text-[#1e293b] truncate">{a.fileName}</p>
                    <p className="text-xs text-[#94a3b8] truncate">{a.kind === 'link' ? a.url : formatBytes(a.sizeBytes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openSignedUrl(() => getMyNoteAttachmentUrl(idRef.current, a.id).then((r) => r.data.data.url)).catch((e) => setMsg({ ok: false, text: msgOf(e) }))}>Open</Button>
                  {!locked && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onRemove(a.id)}>Remove</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {!locked && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="outline" icon={Paperclip} loading={busy && progress !== null} onClick={() => fileRef.current && fileRef.current.click()}>Upload file</Button>
              {progress !== null && <span className="text-sm text-[#f97316] font-medium">{progress}%</span>}
              <input ref={fileRef} type="file" multiple accept={ACCEPT_FILES} className="hidden" onChange={onPickFiles} />
            </div>
            <div className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2">
              <input className={selectCls} placeholder="Link title (e.g. Video lecture)" value={link.title} onChange={(e) => setLink((l) => ({ ...l, title: e.target.value }))} />
              <input className={selectCls} placeholder="https://youtube.com/..." value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} />
              <Button variant="outline" icon={Link2} disabled={!link.title.trim() || !link.url.trim()} onClick={onAddLink}>Add link</Button>
            </div>
          </div>
        )}
      </Card>

      {!locked && (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <Button variant="outline" icon={Save} loading={busy && progress === null} onClick={saveDraft}>{status === 'published' ? 'Save changes' : 'Save draft'}</Button>
            {status !== 'published' && (
              <>
                <Button icon={Send} onClick={() => publish(null)} disabled={busy}>Publish now</Button>
                <div className="flex items-end gap-2 ml-auto">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#64748b]">Or schedule for</label>
                    <input type="datetime-local" className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
                  </div>
                  <Button variant="secondary" icon={CalendarClock} disabled={!schedule || busy} onClick={() => publish(schedule)}>Schedule</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}