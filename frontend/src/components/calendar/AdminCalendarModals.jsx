import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  saveCalendarSettings, copyCalendar, createCalendarCategory, updateCalendarCategory, deleteCalendarCategory,
} from '../../api/schooladmin.api';
import { DOW, KIND_LABEL, fmtDate, errMsg } from './calendarUtils';

const inputCls = 'w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316]';
const labelCls = 'block text-sm font-medium text-[#374151] mb-1';

function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{children}</div>;
}

// ------------------------------------------------------------------ add / edit event
export function EventFormModal({
  open, onClose, initial, defaultDate, session, categories, classes, events, onSave, onDelete, saving, deleting, error,
}) {
  const activeCategories = useMemo(() => categories.filter((c) => c.isActive || c.id === initial?.categoryId), [categories, initial]);
  const blank = useMemo(() => ({
    title: '', categoryId: '', startDate: '', endDate: '', startTime: '', endTime: '',
    location: '', description: '', audience: 'all', classIds: [],
  }), []);
  const [f, setF] = useState(blank);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (initial) {
      setF({
        title: initial.title, categoryId: initial.categoryId,
        startDate: initial.startDate, endDate: initial.endDate,
        startTime: initial.startTime || '', endTime: initial.endTime || '',
        location: initial.location || '', description: initial.description || '',
        audience: initial.audience, classIds: initial.classIds || [],
      });
    } else {
      const d = defaultDate || session?.startDate || '';
      setF({ ...blank, startDate: d, endDate: d, categoryId: activeCategories[0]?.id || '' });
    }
  }, [open, initial, defaultDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleClass = (id) => set('classIds', f.classIds.includes(id) ? f.classIds.filter((c) => c !== id) : [...f.classIds, id]);

  const overlaps = useMemo(() => {
    if (!f.startDate) return [];
    const end = f.endDate || f.startDate;
    return events.filter((e) => e.id !== initial?.id && e.startDate <= end && e.endDate >= f.startDate).slice(0, 3);
  }, [events, f.startDate, f.endDate, initial]);

  const submit = (e) => {
    e.preventDefault();
    onSave({
      categoryId: f.categoryId,
      title: f.title,
      description: f.description || null,
      startDate: f.startDate,
      endDate: f.endDate || f.startDate,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
      location: f.location || null,
      audience: f.audience,
      classIds: f.classIds,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit event' : 'Add event'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Title <span className="text-red-500">*</span></label>
          <input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Diwali Vacation" required maxLength={120} />
        </div>

        <div>
          <label className={labelCls}>Category <span className="text-red-500">*</span></label>
          <select className={inputCls} value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
            {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name} ({KIND_LABEL[c.kind]})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>From <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={f.startDate} min={session?.startDate} max={session?.endDate}
              onChange={(e) => setF((p) => ({ ...p, startDate: e.target.value, endDate: p.endDate && p.endDate >= e.target.value ? p.endDate : e.target.value }))} required />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={f.endDate} min={f.startDate || session?.startDate} max={session?.endDate}
              onChange={(e) => set('endDate', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Start time (optional)</label>
            <input type="time" className={inputCls} value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>End time (optional)</label>
            <input type="time" className={inputCls} value={f.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
        </div>

        {overlaps.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Already on these dates: {overlaps.map((o) => `${o.title} (${fmtDate(o.startDate)})`).join(', ')}
          </div>
        )}

        <div>
          <label className={labelCls}>Location (optional)</label>
          <input className={inputCls} value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={120} />
        </div>

        <div>
          <label className={labelCls}>Notes (optional)</label>
          <textarea className={inputCls} rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={1000} />
        </div>

        <div>
          <label className={labelCls}>Who can see this</label>
          <select className={inputCls} value={f.audience} onChange={(e) => set('audience', e.target.value)}>
            <option value="all">Everyone (staff and parents)</option>
            <option value="staff">Staff only</option>
          </select>
        </div>

        {classes.length > 0 && (
          <div>
            <label className={labelCls}>Classes</label>
            <p className="text-xs text-[#94a3b8] mb-2">Leave empty for the whole school. Pick classes to show it only to them.</p>
            <div className="flex flex-wrap gap-2">
              {classes.map((c) => {
                const on = f.classIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${on ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <ErrorBox>{error}</ErrorBox>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            {initial && !confirmDelete && (
              <Button variant="ghost" icon={Trash2} className="text-red-500 hover:text-red-600" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )}
            {initial && confirmDelete && (
              <Button variant="danger" size="sm" loading={deleting} onClick={() => onDelete(initial)}>Confirm delete</Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>{initial ? 'Save changes' : 'Add event'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ copy from previous session
export function CopyCalendarModal({ open, onClose, sessions, target }) {
  const qc = useQueryClient();
  const others = sessions.filter((s) => s.id !== target?.id);
  const [sourceId, setSourceId] = useState('');
  const [mode, setMode] = useState('same_date');
  const [kinds, setKinds] = useState(['holiday', 'exam', 'event', 'working_day']);
  const [copySettings, setCopySettings] = useState(true);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSourceId(others[0]?.id || '');
    setPreview(null);
    setDone(null);
  }, [open, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (dryRun) => ({ sourceSessionId: sourceId, targetSessionId: target.id, mode, kinds, copySettings, dryRun });

  const previewMutation = useMutation({
    mutationFn: () => copyCalendar(body(true)).then((r) => r.data.data.summary),
    onSuccess: setPreview,
  });

  const copyMutation = useMutation({
    mutationFn: () => copyCalendar(body(false)).then((r) => r.data.data.summary),
    onSuccess: (summary) => {
      setDone(summary);
      qc.invalidateQueries({ queryKey: ['ad-calendar'] });
    },
  });

  const toggleKind = (k) => {
    setPreview(null);
    setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  const error = errMsg(previewMutation.error, '') || errMsg(copyMutation.error, '');

  return (
    <Modal open={open} onClose={onClose} title={`Copy calendar into ${target?.label || ''}`} size="md">
      {done ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Copied {done.copied} event(s). Please review the dates, they are marked "Check date" until you confirm them.
          </div>
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          {others.length === 0 ? (
            <p className="text-sm text-[#64748b]">You need at least one more session to copy from.</p>
          ) : (
            <>
              <div>
                <label className={labelCls}>Copy from</label>
                <select className={inputCls} value={sourceId} onChange={(e) => { setSourceId(e.target.value); setPreview(null); }}>
                  {others.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>How should dates move?</label>
                <div className="space-y-2">
                  {[
                    { id: 'same_date', t: 'Same date next year', d: 'Good for fixed dates like 15 Aug, 26 Jan, 25 Dec' },
                    { id: 'same_weekday', t: 'Same weekday', d: 'Keeps Monday as Monday, good for exams and meetings' },
                  ].map((o) => (
                    <label key={o.id} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer ${mode === o.id ? 'border-[#f97316] bg-orange-50' : 'border-[#e2e8f0]'}`}>
                      <input type="radio" className="mt-1" checked={mode === o.id} onChange={() => { setMode(o.id); setPreview(null); }} />
                      <span>
                        <span className="block text-sm font-semibold text-[#1e293b]">{o.t}</span>
                        <span className="block text-xs text-[#64748b]">{o.d}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>What to copy</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleKind(k)}
                      className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold ${kinds.includes(k) ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}
                    >
                      {label}s
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-[#374151]">
                <input type="checkbox" checked={copySettings} onChange={(e) => { setCopySettings(e.target.checked); setPreview(null); }} />
                Also copy weekly off settings
              </label>

              {preview && (
                <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#334155] space-y-1">
                  <p><span className="font-bold">{preview.copied}</span> of {preview.total} events will be copied.</p>
                  {preview.duplicate > 0 && <p className="text-xs text-[#64748b]">{preview.duplicate} already exist and will be skipped.</p>}
                  {preview.outOfRange > 0 && <p className="text-xs text-[#64748b]">{preview.outOfRange} fall outside the new session dates and will be skipped.</p>}
                  {preview.classMismatch > 0 && <p className="text-xs text-[#64748b]">{preview.classMismatch} are for classes that do not exist in the new session.</p>}
                </div>
              )}

              <ErrorBox>{error}</ErrorBox>

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                {!preview ? (
                  <Button disabled={!sourceId || kinds.length === 0} loading={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
                    Preview
                  </Button>
                ) : (
                  <Button disabled={preview.copied === 0 && !copySettings} loading={copyMutation.isPending} onClick={() => copyMutation.mutate()}>
                    Copy {preview.copied} event(s)
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ weekly off settings
export function CalendarSettingsModal({ open, onClose, session, settings }) {
  const qc = useQueryClient();
  const [off, setOff] = useState([0]);
  const [sats, setSats] = useState([]);

  useEffect(() => {
    if (!open) return;
    setOff(settings?.weeklyOffDays || [0]);
    setSats(settings?.offSaturdays || []);
  }, [open, settings]);

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const mutation = useMutation({
    mutationFn: () => saveCalendarSettings({ sessionId: session.id, weeklyOffDays: off, offSaturdays: off.includes(6) ? [] : sats }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-calendar'] }); onClose(); },
  });

  return (
    <Modal open={open} onClose={onClose} title="Weekly off days" size="sm">
      <div className="space-y-5">
        <div>
          <label className={labelCls}>Days the school is closed every week</label>
          <div className="flex flex-wrap gap-2">
            {DOW.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle(off, setOff, i)}
                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold ${off.includes(i) ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {!off.includes(6) && (
          <div>
            <label className={labelCls}>Saturdays that are off</label>
            <p className="text-xs text-[#94a3b8] mb-2">For example pick 2nd and 4th if those Saturdays are holidays.</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggle(sats, setSats, n)}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold ${sats.includes(n) ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b]'}`}
                >
                  {n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`}
                </button>
              ))}
            </div>
          </div>
        )}

        <ErrorBox>{errMsg(mutation.error, mutation.isError ? 'Could not save settings.' : '')}</ErrorBox>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={off.length >= 7} onClick={() => mutation.mutate()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ categories
function CategoryRow({ cat, onChanged }) {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [err, setErr] = useState('');

  useEffect(() => { setName(cat.name); setColor(cat.color); }, [cat.name, cat.color]);

  const update = useMutation({
    mutationFn: (data) => updateCalendarCategory(cat.id, data),
    onSuccess: () => { setErr(''); onChanged(); },
    onError: (e) => setErr(errMsg(e, 'Could not update')),
  });
  const remove = useMutation({
    mutationFn: () => deleteCalendarCategory(cat.id),
    onSuccess: () => { setErr(''); onChanged(); },
    onError: (e) => setErr(errMsg(e, 'Could not delete')),
  });

  const dirty = name.trim() !== cat.name || color !== cat.color;

  return (
    <div className={`border border-[#e2e8f0] rounded-lg p-3 ${cat.isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded border border-[#e2e8f0] p-0.5 bg-white shrink-0" />
        <input className={`${inputCls} flex-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <Badge label={KIND_LABEL[cat.kind]} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {dirty && (
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ name: name.trim(), color })}>Save</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => update.mutate({ isActive: !cat.isActive })}>
            {cat.isActive ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-500 hover:text-red-600" loading={remove.isPending} onClick={() => remove.mutate()}>
          Delete
        </Button>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}

export function CategoriesModal({ open, onClose, categories }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('event');
  const [color, setColor] = useState('#f97316');

  const refresh = () => qc.invalidateQueries({ queryKey: ['ad-calendar'] });

  const create = useMutation({
    mutationFn: () => createCalendarCategory({ name: name.trim(), kind, color }),
    onSuccess: () => { setName(''); refresh(); },
  });

  return (
    <Modal open={open} onClose={onClose} title="Event categories" size="md">
      <div className="space-y-5">
        <p className="text-xs text-[#64748b]">
          The type decides how a category behaves. A Holiday type removes the day from working days, a Working day type makes a weekly off day a school day, Exam and Event types only show on the calendar.
        </p>

        <div className="space-y-2">
          {categories.map((c) => <CategoryRow key={c.id} cat={c} onChanged={refresh} />)}
        </div>

        <div className="border-t border-[#eef2f7] pt-4">
          <p className="text-sm font-semibold text-[#1e293b] mb-2">Add your own</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded border border-[#e2e8f0] p-0.5 bg-white shrink-0" />
            <input className={`${inputCls} flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual Day" maxLength={40} />
            <select className={`${inputCls} sm:w-40`} value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Button icon={Plus} loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>Add</Button>
          </div>
          <ErrorBox>{errMsg(create.error, create.isError ? 'Could not add category.' : '')}</ErrorBox>
        </div>

        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}