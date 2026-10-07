import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, Download, FileUp, Library, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  getSyllabusChapters, createSyllabusChapter, updateSyllabusChapter, deleteSyllabusChapter, bulkCreateSyllabusChapters,
  getSyllabusTemplates, saveSyllabusTemplate, applySyllabusTemplate, deleteSyllabusTemplate,
  getSyllabusCsvTemplate, importSyllabusCsv, copySyllabus, autoScheduleSyllabus,
} from '../../api/schooladmin.api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { saveBlob, errMsg, fmtRange } from '../calendar/calendarUtils';
import { Notice, Select } from './SyllabusUI';

const inputCls = 'w-full px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]';
const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-sm font-medium text-[#374151] mb-1">{label}</span>
    {children}
  </label>
);

function ChapterForm({ initial, onSubmit, onClose, busy, err }) {
  const [f, setF] = useState({
    title: initial?.title || '', unitName: initial?.unitName || '', plannedPeriods: initial?.plannedPeriods || 1,
    plannedStart: initial?.plannedStart || '', plannedEnd: initial?.plannedEnd || '', sortOrder: initial?.sortOrder ?? '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => onSubmit({
    title: f.title, unitName: f.unitName, plannedPeriods: Number(f.plannedPeriods) || 1,
    plannedStart: f.plannedStart, plannedEnd: f.plannedEnd,
    ...(initial && f.sortOrder !== '' ? { sortOrder: Number(f.sortOrder) } : {}),
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit chapter' : 'Add chapter'}>
      <div className="space-y-3">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        <Field label="Chapter name"><input className={inputCls} value={f.title} onChange={set('title')} maxLength={200} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit (optional)"><input className={inputCls} value={f.unitName} onChange={set('unitName')} maxLength={120} /></Field>
          <Field label="Periods needed"><input type="number" min={1} max={100} className={inputCls} value={f.plannedPeriods} onChange={set('plannedPeriods')} /></Field>
          <Field label="Planned start"><input type="date" className={inputCls} value={f.plannedStart} onChange={set('plannedStart')} /></Field>
          <Field label="Planned end"><input type="date" className={inputCls} value={f.plannedEnd} onChange={set('plannedEnd')} /></Field>
          {initial && <Field label="Order number"><input type="number" min={0} className={inputCls} value={f.sortOrder} onChange={set('sortOrder')} /></Field>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!f.title.trim()} onClick={submit}>{initial ? 'Save' : 'Add chapter'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PasteModal({ onSubmit, onClose, busy, err }) {
  const [text, setText] = useState('');
  const lines = text.split('\n').map((l) => l.replace(/^\s*(chapter\s*)?\d+\s*[.:)-]\s*/i, '').trim()).filter(Boolean);
  return (
    <Modal open onClose={onClose} title="Paste chapter list">
      <div className="space-y-3">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        <p className="text-xs text-[#64748b]">One chapter per line. Numbering like "1." or "Chapter 2:" is removed automatically. Duplicates are skipped.</p>
        <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder={'1. Rational Numbers\n2. Linear Equations in One Variable\n3. Understanding Quadrilaterals'} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[#64748b]">{lines.length} chapter(s) detected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button loading={busy} disabled={!lines.length} onClick={() => onSubmit(lines.map((title) => ({ title, plannedPeriods: 1 })))}>Add {lines.length || ''} chapters</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TemplateModal({ cls, sub, hasChapters, onApply, onSave, onDelete, onClose, busy, err }) {
  const [board, setBoard] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['syl-templates', cls.name, sub.name],
    queryFn: () => getSyllabusTemplates({ className: cls.name, subjectName: sub.name }).then((r) => r.data.data),
  });
  return (
    <Modal open onClose={onClose} size="lg" title={`Templates for ${cls.name} · ${sub.name}`}>
      <div className="space-y-4">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        <p className="text-xs text-[#64748b]">Using a template only adds chapters that are missing. Nothing you already have is changed or deleted.</p>
        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : data.length === 0 ? (
          <p className="text-sm text-[#94a3b8] text-center py-6">No templates yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {data.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 ${t.matchScore >= 4 ? 'border-[#f97316] bg-orange-50/40' : 'border-[#e2e8f0]'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1e293b]">{t.className} · {t.subjectName}</p>
                  <p className="text-xs text-[#64748b] truncate">{t.board} · {t.chapterCount} chapters{t.chapters[0] ? ` · starts with ${t.chapters[0].title}` : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {t.matchScore >= 4 && <Badge label="Best match" variant="orange" />}
                  {!t.isBuiltIn && <Button variant="ghost" size="sm" icon={Trash2} disabled={busy} onClick={() => window.confirm('Delete this template?') && onDelete(t.id)} />}
                  <Button size="sm" loading={busy} onClick={() => onApply(t.id)}>Use</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {hasChapters && (
          <div className="border-t border-[#e2e8f0] pt-4 space-y-2">
            <p className="text-sm font-semibold text-[#1e293b]">Save current chapters as a template</p>
            <div className="flex gap-2">
              <input className={inputCls} value={board} onChange={(e) => setBoard(e.target.value)} maxLength={60} placeholder="Name / board, e.g. MP Board 2026" />
              <Button variant="outline" disabled={!board.trim()} loading={busy} onClick={() => onSave(board.trim())}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CsvModal({ sessionId, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(dry) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sessionId', sessionId);
    fd.append('dryRun', dry ? 'true' : 'false');
    setBusy(true); setErr('');
    try {
      const res = await importSyllabusCsv(fd);
      if (dry) setPreview(res.data.data); else onDone(res.data.message);
    } catch (e) {
      setErr(errMsg(e, 'Upload failed. Please check the file.'));
    } finally {
      setBusy(false);
    }
  }
  async function downloadTemplate() {
    try { const res = await getSyllabusCsvTemplate({ sessionId }); saveBlob(res.data, 'syllabus-template.csv'); } catch { setErr('Could not download the template.'); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Import syllabus from CSV">
      <div className="space-y-3">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        <p className="text-sm text-[#475569]">One file can cover every class and subject. Columns: <b>class, subject, unit, chapter, periods</b>. Class and subject names must match what is set up in this session.</p>
        <Button variant="outline" size="sm" icon={Download} onClick={downloadTemplate}>Download sample CSV</Button>
        <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setErr(''); }} className="block w-full text-sm" />
        {preview && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge label={`${preview.summary.toAdd} to add`} variant="success" />
              <Badge label={`${preview.summary.duplicate} duplicate`} variant="default" />
              <Badge label={`${preview.summary.errorCount} problem row(s)`} variant={preview.summary.errorCount ? 'danger' : 'default'} />
            </div>
            {preview.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                {preview.errors.map((e) => <p key={`${e.line}-${e.message}`} className="text-xs text-red-700">Row {e.line}: {e.message}</p>)}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!preview || preview.summary.errorCount ? (
            <Button loading={busy} disabled={!file} onClick={() => send(true)}>Check file</Button>
          ) : (
            <Button loading={busy} disabled={!preview.summary.toAdd} onClick={() => send(false)}>Import {preview.summary.toAdd} chapters</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ScheduleModal({ cls, sub, session, onSubmit, onClose, busy, err }) {
  const [start, setStart] = useState(session?.startDate || '');
  const [end, setEnd] = useState(session?.endDate || '');
  const [scope, setScope] = useState('subject');
  return (
    <Modal open onClose={onClose} title="Auto-schedule chapters">
      <div className="space-y-3">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        <p className="text-xs text-[#64748b]">Spreads chapters across working days (weekly offs and holidays from the Academic Calendar are skipped), in proportion to the periods each chapter needs. Existing planned dates are replaced.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teaching starts"><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Teaching ends"><input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Apply to">
          <Select value={scope} onChange={setScope} className="w-full">
            <option value="subject">{cls.name} · {sub.name} only</option>
            <option value="class">All subjects of {cls.name}</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!start || !end} onClick={() => onSubmit({ startDate: start, endDate: end, ...(scope === 'subject' ? { subjectId: sub.id } : {}) })}>Schedule</Button>
        </div>
      </div>
    </Modal>
  );
}

function CopyModal({ sessions, currentId, onClose, onDone }) {
  const options = sessions.filter((s) => s.id !== currentId);
  const [from, setFrom] = useState(options[0]?.id || '');
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(dry) {
    setBusy(true); setErr('');
    try {
      const res = await copySyllabus({ fromSessionId: from, toSessionId: currentId, dryRun: dry });
      if (dry) setSummary(res.data.data.summary); else onDone(res.data.message);
    } catch (e) {
      setErr(errMsg(e, 'Could not copy the syllabus.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Copy from a previous session">
      <div className="space-y-3">
        {err && <Notice notice={{ type: 'error', text: err }} />}
        {options.length === 0 ? <p className="text-sm text-[#94a3b8]">There is no other session to copy from.</p> : (
          <>
            <p className="text-xs text-[#64748b]">Chapters are matched by class name and subject name. Progress and planned dates are not copied, so the new year starts clean.</p>
            <Select value={from} onChange={(v) => { setFrom(v); setSummary(null); }} className="w-full">
              {options.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
            {summary && (
              <div className="flex flex-wrap gap-2">
                <Badge label={`${summary.copied} to copy`} variant="success" />
                <Badge label={`${summary.duplicate} already exist`} variant="default" />
                <Badge label={`${summary.classMismatch} class not found`} variant={summary.classMismatch ? 'warning' : 'default'} />
                <Badge label={`${summary.subjectMismatch} subject not found`} variant={summary.subjectMismatch ? 'warning' : 'default'} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {!summary ? <Button loading={busy} onClick={() => run(true)}>Preview</Button>
                : <Button loading={busy} disabled={!summary.copied} onClick={() => run(false)}>Copy {summary.copied} chapters</Button>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function AdminSetupTab({ sessionId, structure }) {
  const qc = useQueryClient();
  const classes = structure?.classes || [];
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [modalErr, setModalErr] = useState('');
  const [busy, setBusy] = useState(false);

  const cls = classes.find((c) => c.id === classId) || classes[0];
  const sub = cls?.subjects.find((s) => s.id === subjectId) || cls?.subjects[0];
  const base = { sessionId, classId: cls?.id, subjectId: sub?.id };

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['syl-chapters', sessionId, cls?.id, sub?.id],
    queryFn: () => getSyllabusChapters(base).then((r) => r.data.data),
    enabled: !!(sessionId && cls && sub),
  });

  const refresh = () => ['syl-chapters', 'syl-overview', 'syl-readiness', 'syl-scope', 'syl-templates'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const openModal = (m) => { setModalErr(''); setModal(m); };

  async function run(fn, { close = true } = {}) {
    setBusy(true); setModalErr('');
    try {
      const res = await fn();
      setNotice({ type: 'success', text: res?.data?.message || 'Done.' });
      refresh();
      if (close) setModal(null);
      return res;
    } catch (e) {
      const msg = errMsg(e, 'Something went wrong. Please try again.');
      if (modal) setModalErr(msg); else setNotice({ type: 'error', text: msg });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    const force = c.progressCount > 0;
    if (force && !window.confirm(`${c.progressCount} section(s) already have progress on this chapter. Delete it together with that progress?`)) return;
    await run(() => deleteSyllabusChapter(c.id, force ? { force: 'true' } : {}), { close: false });
  }

  if (!classes.length) {
    return <Card><p className="text-sm text-[#94a3b8] text-center py-10">Create classes and subjects for this session first.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Select value={cls?.id || ''} onChange={(v) => { setClassId(v); setSubjectId(''); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sub?.id || ''} onChange={setSubjectId}>
            {cls?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        {sub && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Plus} onClick={() => openModal('add')}>Add chapter</Button>
            <Button size="sm" variant="outline" icon={ListPlus} onClick={() => openModal('paste')}>Paste list</Button>
            <Button size="sm" variant="outline" icon={Library} onClick={() => openModal('template')}>Templates</Button>
            <Button size="sm" variant="outline" icon={FileUp} onClick={() => openModal('csv')}>Import CSV</Button>
            <Button size="sm" variant="outline" icon={Copy} onClick={() => openModal('copy')}>Copy from session</Button>
            <Button size="sm" variant="outline" icon={CalendarClock} disabled={!chapters.length} onClick={() => openModal('schedule')}>Auto-schedule</Button>
          </div>
        )}
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {!sub ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">This class has no subjects yet. Add subjects under Classes first.</p></Card>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : chapters.length === 0 ? (
        <Card>
          <div className="text-center py-10 space-y-3">
            <p className="text-sm text-[#64748b]">No chapters yet for {cls.name} · {sub.name}.</p>
            <div className="flex justify-center gap-2 flex-wrap">
              <Button size="sm" icon={Library} onClick={() => openModal('template')}>Use a ready template</Button>
              <Button size="sm" variant="outline" icon={ListPlus} onClick={() => openModal('paste')}>Paste a list</Button>
              <Button size="sm" variant="outline" icon={FileUp} onClick={() => openModal('csv')}>Import CSV</Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#64748b] bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-4 py-3">Chapter</th>
                  <th className="px-4 py-3">Periods</th>
                  <th className="px-4 py-3">Planned dates</th>
                  <th className="px-4 py-3">In exams</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {chapters.map((c, i) => (
                  <tr key={c.id} className="hover:bg-[#f8fafc]">
                    <td className="px-4 py-3 text-[#94a3b8]">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1e293b]">{c.title}</p>
                      {c.unitName && <p className="text-xs text-[#64748b]">{c.unitName}</p>}
                    </td>
                    <td className="px-4 py-3 text-[#475569]">{c.plannedPeriods}</td>
                    <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">{c.plannedStart && c.plannedEnd ? fmtRange(c.plannedStart, c.plannedEnd) : 'Not planned'}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{c.exams.length ? c.exams.map((e) => <Badge key={e.id} label={e.name} variant="orange" />) : <span className="text-xs text-[#94a3b8]">None</span>}</div></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openModal({ edit: c })} />
                        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(c)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal === 'add' && (
        <ChapterForm busy={busy} err={modalErr} onClose={() => setModal(null)} onSubmit={(d) => run(() => createSyllabusChapter({ ...base, ...d }))} />
      )}
      {modal?.edit && (
        <ChapterForm initial={modal.edit} busy={busy} err={modalErr} onClose={() => setModal(null)} onSubmit={(d) => run(() => updateSyllabusChapter(modal.edit.id, d))} />
      )}
      {modal === 'paste' && (
        <PasteModal busy={busy} err={modalErr} onClose={() => setModal(null)} onSubmit={(list) => run(() => bulkCreateSyllabusChapters({ ...base, chapters: list }))} />
      )}
      {modal === 'template' && (
        <TemplateModal
          cls={cls} sub={sub} hasChapters={chapters.length > 0} busy={busy} err={modalErr} onClose={() => setModal(null)}
          onApply={(templateId) => run(() => applySyllabusTemplate({ ...base, templateId }))}
          onSave={(board) => run(() => saveSyllabusTemplate({ ...base, board }), { close: false })}
          onDelete={(id) => run(() => deleteSyllabusTemplate(id), { close: false })}
        />
      )}
      {modal === 'csv' && (
        <CsvModal sessionId={sessionId} onClose={() => setModal(null)} onDone={(msg) => { setModal(null); setNotice({ type: 'success', text: msg }); refresh(); }} />
      )}
      {modal === 'schedule' && (
        <ScheduleModal cls={cls} sub={sub} session={structure.session} busy={busy} err={modalErr} onClose={() => setModal(null)} onSubmit={(d) => run(() => autoScheduleSyllabus({ sessionId, classId: cls.id, ...d }))} />
      )}
      {modal === 'copy' && (
        <CopyModal sessions={structure.sessions} currentId={sessionId} onClose={() => setModal(null)} onDone={(msg) => { setModal(null); setNotice({ type: 'success', text: msg }); refresh(); }} />
      )}
    </div>
  );
}