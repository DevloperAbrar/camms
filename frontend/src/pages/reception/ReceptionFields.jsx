import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Eye, EyeOff } from 'lucide-react';
import {
  getReceptionFields, createReceptionField, updateReceptionField, deleteReceptionField, reorderReceptionFields,
} from '../../api/reception.api';
import { inputCls, selectCls, Field, errMsg } from './receptionUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';

const TYPE_LABEL = { text: 'Short text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Yes / No' };

export default function ReceptionFields() {
  const qc = useQueryClient();
  const [scope, setScope] = useState('enquiry');
  const [modal, setModal] = useState(null); // { field? }
  const [form, setForm] = useState({ label: '', type: 'text', options: '', isRequired: false });
  const [err, setErr] = useState('');

  const { data } = useQuery({
    queryKey: ['reception-fields', scope],
    queryFn: () => getReceptionFields({ scope, all: 1 }).then((r) => r.data.data),
  });
  const fields = data || [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reception-fields'] });
    qc.invalidateQueries({ queryKey: ['reception-meta'] });
  };
  const parseOptions = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: () => {
      const options = form.type === 'select' ? parseOptions(form.options) : undefined;
      return modal.field
        ? updateReceptionField(modal.field.id, { label: form.label.trim(), isRequired: form.isRequired, ...(modal.field.type === 'select' ? { options } : {}) })
        : createReceptionField({ scope, label: form.label.trim(), type: form.type, isRequired: form.isRequired, options });
    },
    onSuccess: () => { setModal(null); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const toggle = useMutation({ mutationFn: (f) => updateReceptionField(f.id, { isActive: !f.isActive }), onSuccess: refresh, onError: (e) => window.alert(errMsg(e)) });
  const remove = useMutation({ mutationFn: (f) => deleteReceptionField(f.id), onSuccess: refresh, onError: (e) => window.alert(errMsg(e)) });
  const move = useMutation({
    mutationFn: ({ i, dir }) => {
      const ids = fields.map((f) => f.id);
      [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
      return reorderReceptionFields({ scope, ids });
    },
    onSuccess: refresh, onError: (e) => window.alert(errMsg(e)),
  });

  const open = (field) => {
    setErr('');
    setForm(field
      ? { label: field.label, type: field.type, options: (field.options || []).join('\n'), isRequired: field.isRequired }
      : { label: '', type: 'text', options: '', isRequired: false });
    setModal({ field });
  };

  const optionsOk = form.type !== 'select' || parseOptions(form.options).length >= 2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Form Fields</h1>
          <p className="text-sm text-[#64748b] mt-1">Add the extra questions your school wants on the enquiry and visitor forms (e.g. “Sibling studying here?”, “Vehicle type”).</p>
        </div>
        <Button icon={Plus} onClick={() => open(null)}>Add field</Button>
      </div>

      <div className="flex rounded-lg border border-[#e2e8f0] overflow-hidden bg-white w-fit">
        {[{ v: 'enquiry', l: 'Enquiry form' }, { v: 'visitor', l: 'Visitor form' }].map((o) => (
          <button key={o.v} onClick={() => setScope(o.v)} className={`px-4 py-2 text-sm font-semibold ${scope === o.v ? 'bg-[#1e293b] text-white' : 'text-[#475569]'}`}>{o.l}</button>
        ))}
      </div>

      <Card padding={false}>
        {fields.length === 0 ? (
          <p className="p-6 text-sm text-[#94a3b8]">No custom fields yet. The standard fields are always shown.</p>
        ) : (
          <ul className="divide-y divide-[#f1f5f9]">
            {fields.map((f, i) => (
              <li key={f.id} className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${f.isActive ? '' : 'opacity-60'}`}>
                <div>
                  <p className="font-semibold text-[#1e293b]">{f.label}</p>
                  <p className="text-xs text-[#94a3b8]">{TYPE_LABEL[f.type]}{f.type === 'select' ? ` · ${(f.options || []).join(', ')}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  {f.isRequired && <Badge label="Required" variant="orange" />}
                  {!f.isActive && <Badge label="Hidden" variant="default" />}
                  <Button size="sm" variant="ghost" icon={ArrowUp} disabled={i === 0 || move.isPending} onClick={() => move.mutate({ i, dir: -1 })} />
                  <Button size="sm" variant="ghost" icon={ArrowDown} disabled={i === fields.length - 1 || move.isPending} onClick={() => move.mutate({ i, dir: 1 })} />
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(f)} />
                  <Button size="sm" variant="ghost" icon={f.isActive ? EyeOff : Eye} onClick={() => toggle.mutate(f)} />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`Delete “${f.label}”? Values already saved on old records are kept but no longer shown.`) && remove.mutate(f)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.field ? 'Edit field' : `Add ${scope} field`} size="sm">
        <div className="space-y-3">
          <Field label="Label"><input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <Field label="Type">
            <select className={selectCls} value={form.type} disabled={!!modal?.field} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {form.type === 'select' && (
            <Field label="Options" hint="One option per line (at least 2)">
              <textarea rows={4} className={inputCls} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} /> Required
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={save.isPending} disabled={form.label.trim().length < 2 || !optionsOk} onClick={() => save.mutate()}>
            {modal?.field ? 'Save changes' : 'Add field'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}