import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageCircle, Pencil, Trash2, ArrowRightLeft, GraduationCap } from 'lucide-react';
import {
  getEnquiry, createEnquiry, updateEnquiry, deleteEnquiry, changeEnquiryStage,
  addEnquiryFollowUp, convertEnquiry, getConvertOptions,
} from '../../api/reception.api';
import useAuthStore from '../../store/auth.store';
import {
  inputCls, selectCls, Field, errMsg, DynamicFields, StageBadge, STAGE_LABEL, SOURCE_LABEL, KIND_LABEL,
  PRIORITY_VARIANT, LOST_REASONS, CLOSED, fmtDate, fmtDateTime, addDays, waLink,
} from './receptionUtils';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

// ─────────────────────────── create / edit ───────────────────────────
export function EnquiryFormModal({ enquiry, meta, onClose, onSaved }) {
  const me = useAuthStore((s) => s.user);
  const editing = !!enquiry;
  const [form, setForm] = useState(() => ({
    studentName: enquiry?.studentName || '',
    classSought: enquiry?.classSought || '',
    parentName: enquiry?.parentName || '',
    phone: enquiry?.phone || '',
    altPhone: enquiry?.altPhone || '',
    email: enquiry?.email || '',
    dob: enquiry?.dob || '',
    gender: enquiry?.gender || '',
    academicYear: enquiry?.academicYear || '',
    previousSchool: enquiry?.previousSchool || '',
    source: enquiry?.source || 'walk_in',
    referredBy: enquiry?.referredBy || '',
    priority: enquiry?.priority || 'medium',
    assignedToId: enquiry ? enquiry.assignedToId || '' : me?.id || '',
    nextFollowUpOn: enquiry?.nextFollowUpOn || '',
    address: enquiry?.address || '',
    notes: enquiry?.notes || '',
  }));
  const [custom, setCustom] = useState(enquiry?.customData || {});
  const [err, setErr] = useState('');
  const [dupes, setDupes] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: (force) => {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v])
      );
      payload.customData = custom;
      if (!editing && force) payload.force = true;
      return editing ? updateEnquiry(enquiry.id, payload) : createEnquiry(payload);
    },
    onSuccess: (r) => onSaved(r.data.data, r.data.message),
    onError: (e) => {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.errors?.duplicates) setDupes(d.errors.duplicates);
      else setErr(errMsg(e));
    },
  });

  const valid =
    form.studentName.trim().length >= 2 && form.classSought.trim() && form.parentName.trim().length >= 2 &&
    form.phone.replace(/\D/g, '').length >= 10;

  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${enquiry.enquiryNo}` : 'New admission enquiry'} size="lg">
      <div className="space-y-4">
        {dupes && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-800">This number already has an open enquiry:</p>
            <ul className="mt-1 text-amber-900 list-disc pl-5">
              {dupes.map((d) => <li key={d.id}>{d.enquiryNo} — {d.studentName} ({d.classSought}, {STAGE_LABEL[d.stage]})</li>)}
            </ul>
            <p className="mt-2 text-amber-800">Is this a different child (sibling)? Then create it anyway.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" loading={save.isPending} onClick={() => save.mutate(true)}>Create anyway</Button>
              <Button size="sm" variant="ghost" onClick={() => setDupes(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Student name *"><input className={inputCls} value={form.studentName} onChange={set('studentName')} /></Field>
          <Field label="Class seeking admission *"><input className={inputCls} placeholder="e.g. Class 5, Nursery" value={form.classSought} onChange={set('classSought')} /></Field>
          <Field label="Parent / guardian name *"><input className={inputCls} value={form.parentName} onChange={set('parentName')} /></Field>
          <Field label="Mobile number *" hint="10-digit. +91 or 0 prefix is removed automatically."><input className={inputCls} inputMode="tel" value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Alternate number"><input className={inputCls} inputMode="tel" value={form.altPhone} onChange={set('altPhone')} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={set('email')} /></Field>
          <Field label="Date of birth"><input type="date" className={inputCls} value={form.dob} onChange={set('dob')} /></Field>
          <Field label="Gender">
            <select className={selectCls} value={form.gender} onChange={set('gender')}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Admission year"><input className={inputCls} placeholder="e.g. 2027-28" value={form.academicYear} onChange={set('academicYear')} /></Field>
          <Field label="Previous school"><input className={inputCls} value={form.previousSchool} onChange={set('previousSchool')} /></Field>
          <Field label="How did they hear about us?">
            <select className={selectCls} value={form.source} onChange={set('source')}>
              {(meta?.sources || []).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}
            </select>
          </Field>
          {form.source === 'referral' && (
            <Field label="Referred by"><input className={inputCls} value={form.referredBy} onChange={set('referredBy')} /></Field>
          )}
          <Field label="Priority">
            <select className={selectCls} value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </Field>
          <Field label="Assigned to">
            <select className={selectCls} value={form.assignedToId} onChange={set('assignedToId')}>
              {editing && <option value="">Unassigned</option>}
              {(meta?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Next follow-up on"><input type="date" min={meta?.today} className={inputCls} value={form.nextFollowUpOn} onChange={set('nextFollowUpOn')} /></Field>
        </div>

        <Field label="Address"><textarea rows={2} className={inputCls} value={form.address} onChange={set('address')} /></Field>
        <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} /></Field>

        <DynamicFields fields={meta?.fields?.enquiry} values={custom} onChange={(k, v) => setCustom((c) => ({ ...c, [k]: v }))} />

        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" loading={save.isPending && !dupes} disabled={!valid} onClick={() => { setErr(''); save.mutate(false); }}>
          {editing ? 'Save changes' : 'Save enquiry'}
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── change stage ───────────────────────────
function StageModal({ enquiry, meta, onClose, onDone }) {
  const [stage, setStage] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const save = useMutation({
    mutationFn: () => changeEnquiryStage(enquiry.id, {
      stage, lostReason: stage === 'lost' ? lostReason : null, note: note.trim() || null,
    }),
    onSuccess: onDone,
    onError: (e) => setErr(errMsg(e)),
  });

  const options = (meta?.stages || []).filter((s) => s !== 'admitted' && s !== enquiry.stage);

  return (
    <Modal open onClose={onClose} title="Change stage" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-[#64748b]">Currently <StageBadge stage={enquiry.stage} />. To mark as admitted, use “Convert to student”.</p>
        <Field label="Move to">
          <select className={selectCls} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">Select stage…</option>
            {options.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </Field>
        {stage === 'lost' && (
          <Field label="Why was it lost? *">
            <select className={selectCls} value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
              <option value="">Select reason…</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}
        <Field label="Note (optional)"><textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" loading={save.isPending} disabled={!stage || (stage === 'lost' && !lostReason)} onClick={() => save.mutate()}>Update stage</Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────── convert to student (admin) ───────────────────────────
function ConvertModal({ enquiry, meta, onClose, onDone }) {
  const [sessionId, setSessionId] = useState('');
  const [form, setForm] = useState({ enrollmentNumber: '', classId: '', sectionId: '', rollNumber: '', admissionDate: meta?.today || '', parentEmail: enquiry.email || '' });
  const [err, setErr] = useState('');

  const { data: opts, isLoading } = useQuery({
    queryKey: ['convert-options', sessionId],
    queryFn: () => getConvertOptions(sessionId ? { sessionId } : {}).then((r) => r.data.data),
  });
  const activeSession = sessionId || opts?.sessionId || '';
  const cls = (opts?.classes || []).find((c) => c.id === form.classId);

  const save = useMutation({
    mutationFn: () => convertEnquiry(enquiry.id, {
      enrollmentNumber: form.enrollmentNumber.trim(),
      sessionId: activeSession,
      classId: form.classId,
      sectionId: form.sectionId,
      rollNumber: form.rollNumber.trim() || null,
      admissionDate: form.admissionDate || null,
      parentEmail: form.parentEmail.trim() || null,
    }),
    onSuccess: onDone,
    onError: (e) => setErr(errMsg(e)),
  });

  return (
    <Modal open onClose={onClose} title="Convert to student" size="md">
      {isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="space-y-3">
          <p className="text-sm text-[#64748b]">
            This creates the student record and enrollment for <b className="text-[#1e293b]">{enquiry.studentName}</b> from the enquiry details and marks it admitted.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Academic session">
              <select className={selectCls} value={activeSession} onChange={(e) => { setSessionId(e.target.value); setForm((f) => ({ ...f, classId: '', sectionId: '' })); }}>
                {(opts?.sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (active)' : ''}</option>)}
              </select>
            </Field>
            <Field label="Enrollment / admission no. *"><input className={inputCls} value={form.enrollmentNumber} onChange={(e) => setForm({ ...form, enrollmentNumber: e.target.value })} /></Field>
            <Field label="Class *">
              <select className={selectCls} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, sectionId: '' })}>
                <option value="">Select class…</option>
                {(opts?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Section *">
              <select className={selectCls} value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} disabled={!cls}>
                <option value="">Select section…</option>
                {(cls?.sections || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Roll number"><input className={inputCls} value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} /></Field>
            <Field label="Admission date"><input type="date" className={inputCls} value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} /></Field>
          </div>
          <Field label="Parent email (for parent portal login)"><input type="email" className={inputCls} value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" icon={GraduationCap} loading={save.isPending}
            disabled={!form.enrollmentNumber.trim() || !form.classId || !form.sectionId || !activeSession} onClick={() => save.mutate()}>
            Admit student
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────── detail + timeline ───────────────────────────
const Info = ({ label, children }) => (
  <div><p className="text-xs text-[#94a3b8]">{label}</p><p className="text-sm font-medium text-[#1e293b] break-words">{children || '—'}</p></div>
);

export function EnquiryDetailModal({ id, meta, onClose }) {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.role) === 'admin';
  const [sub, setSub] = useState(null); // 'edit' | 'stage' | 'convert'
  const [fu, setFu] = useState({ kind: 'call', note: '', nextFollowUpOn: '', stage: '' });
  const [err, setErr] = useState('');

  const { data: e, isLoading } = useQuery({ queryKey: ['enquiry', id], queryFn: () => getEnquiry(id).then((r) => r.data.data) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['enquiry', id] });
    qc.invalidateQueries({ queryKey: ['enquiries'] });
    qc.invalidateQueries({ queryKey: ['followups'] });
    qc.invalidateQueries({ queryKey: ['reception-dashboard'] });
  };

  const log = useMutation({
    mutationFn: () => addEnquiryFollowUp(id, {
      kind: fu.kind,
      note: fu.note.trim(),
      // blank date on a call/visit clears the old reminder (shows up under "No follow-up set"); a plain note keeps it
      nextFollowUpOn: fu.nextFollowUpOn || (fu.kind === 'note' ? undefined : null),
      stage: fu.stage || undefined,
    }),
    onSuccess: () => { setFu({ kind: 'call', note: '', nextFollowUpOn: '', stage: '' }); setErr(''); refresh(); },
    onError: (x) => setErr(errMsg(x)),
  });

  const remove = useMutation({
    mutationFn: () => deleteEnquiry(id),
    onSuccess: () => { refresh(); onClose(); },
    onError: (x) => window.alert(errMsg(x)),
  });

  if (isLoading || !e) {
    return <Modal open onClose={onClose} title="Enquiry" size="xl"><div className="flex justify-center py-16"><Spinner /></div></Modal>;
  }

  const closed = CLOSED.includes(e.stage);
  const fields = (meta?.fields?.enquiry || []).filter((f) => e.customData?.[f.key] !== undefined);
  const greeting = `Hello ${e.parentName}, this is ${meta?.school?.name || 'our school'} regarding ${e.studentName}'s admission enquiry.`;
  const quick = (n) => setFu((f) => ({ ...f, nextFollowUpOn: addDays(meta.today, n) }));

  return (
    <>
      <Modal open onClose={onClose} size="xl" title={`${e.enquiryNo} · ${e.studentName}`}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={e.stage} />
            <Badge label={`${e.priority} priority`} variant={PRIORITY_VARIANT[e.priority]} />
            {e.lostReason && <Badge label={`Lost: ${e.lostReason}`} variant="danger" />}
            <div className="ml-auto flex flex-wrap gap-2">
              <a href={`tel:${e.phone}`}><Button size="sm" variant="outline" icon={Phone}>Call</Button></a>
              <a href={waLink(e.phone, greeting)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" icon={MessageCircle}>WhatsApp</Button></a>
              {e.stage !== 'admitted' && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setSub('edit')}>Edit</Button>}
              {e.stage !== 'admitted' && <Button size="sm" variant="ghost" icon={ArrowRightLeft} onClick={() => setSub('stage')}>Stage</Button>}
              {isAdmin && !closed && <Button size="sm" icon={GraduationCap} onClick={() => setSub('convert')}>Convert to student</Button>}
              {isAdmin && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`Delete ${e.enquiryNo}? This cannot be undone.`) && remove.mutate()} />}
            </div>
          </div>

          {e.student && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              Admitted as <b>{e.student.name}</b> (Enrollment No. {e.student.enrollmentNumber}).
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Class sought">{e.classSought}</Info>
                <Info label="Admission year">{e.academicYear}</Info>
                <Info label="Parent">{e.parentName}</Info>
                <Info label="Phone">{e.phone}</Info>
                <Info label="Alt phone">{e.altPhone}</Info>
                <Info label="Email">{e.email}</Info>
                <Info label="Date of birth">{e.dob ? fmtDate(e.dob) : null}</Info>
                <Info label="Gender">{e.gender}</Info>
                <Info label="Previous school">{e.previousSchool}</Info>
                <Info label="Source">{SOURCE_LABEL[e.source] || e.source}{e.referredBy ? ` (${e.referredBy})` : ''}</Info>
                <Info label="Assigned to">{e.assignedToName}</Info>
                <Info label="Created by">{e.createdByName}</Info>
                <Info label="Next follow-up">{e.nextFollowUpOn ? fmtDate(e.nextFollowUpOn) : null}</Info>
                <Info label="Last contacted">{e.lastContactedAt ? fmtDateTime(e.lastContactedAt) : null}</Info>
              </div>
              <Info label="Address">{e.address}</Info>
              <Info label="Notes">{e.notes}</Info>
              {fields.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#f1f5f9]">
                  {fields.map((f) => (
                    <Info key={f.id} label={f.label}>{typeof e.customData[f.key] === 'boolean' ? (e.customData[f.key] ? 'Yes' : 'No') : String(e.customData[f.key])}</Info>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {!closed && (
                <div className="rounded-xl border border-[#e2e8f0] p-4 space-y-3 bg-[#f8fafc]">
                  <p className="font-bold text-sm text-[#1e293b]">Log a follow-up</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type">
                      <select className={selectCls} value={fu.kind} onChange={(x) => setFu({ ...fu, kind: x.target.value })}>
                        {(meta?.followUpKinds || []).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </Field>
                    <Field label="Move to stage">
                      <select className={selectCls} value={fu.stage} onChange={(x) => setFu({ ...fu, stage: x.target.value })}>
                        <option value="">Keep current</option>
                        {(meta?.stages || []).filter((s) => !CLOSED.includes(s) && s !== e.stage).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="What was discussed? *"><textarea rows={2} className={inputCls} value={fu.note} onChange={(x) => setFu({ ...fu, note: x.target.value })} /></Field>
                  <Field label="Next follow-up">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" min={meta?.today} className={`${inputCls} !w-auto`} value={fu.nextFollowUpOn} onChange={(x) => setFu({ ...fu, nextFollowUpOn: x.target.value })} />
                      <Button size="sm" variant="ghost" onClick={() => quick(1)}>Tomorrow</Button>
                      <Button size="sm" variant="ghost" onClick={() => quick(3)}>3 days</Button>
                      <Button size="sm" variant="ghost" onClick={() => quick(7)}>1 week</Button>
                    </div>
                  </Field>
                  {err && <p className="text-sm text-red-600">{err}</p>}
                  <Button className="w-full" loading={log.isPending} disabled={!fu.note.trim()} onClick={() => log.mutate()}>Save follow-up</Button>
                </div>
              )}

              <div>
                <p className="font-bold text-sm text-[#1e293b] mb-2">Timeline</p>
                <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {e.followUps.map((f) => (
                    <li key={f.id} className="border-l-2 border-[#f97316] pl-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#1e293b]">{KIND_LABEL[f.kind] || f.kind}</span>
                        <span className="text-xs text-[#94a3b8]">{fmtDateTime(f.createdAt)}</span>
                      </div>
                      {f.note && <p className="text-sm text-[#475569] mt-0.5 whitespace-pre-wrap">{f.note}</p>}
                      {f.toStage && f.fromStage && <p className="text-xs text-[#64748b] mt-0.5">{STAGE_LABEL[f.fromStage]} → {STAGE_LABEL[f.toStage]}</p>}
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        {f.doneByName}{f.nextFollowUpOn ? ` · next: ${fmtDate(f.nextFollowUpOn)}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {sub === 'edit' && (
        <EnquiryFormModal enquiry={e} meta={meta} onClose={() => setSub(null)} onSaved={() => { setSub(null); refresh(); }} />
      )}
      {sub === 'stage' && <StageModal enquiry={e} meta={meta} onClose={() => setSub(null)} onDone={() => { setSub(null); refresh(); }} />}
      {sub === 'convert' && <ConvertModal enquiry={e} meta={meta} onClose={() => setSub(null)} onDone={() => { setSub(null); refresh(); qc.invalidateQueries({ queryKey: ['students'] }); }} />}
    </>
  );
}