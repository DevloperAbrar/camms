import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Settings2 } from 'lucide-react';
import { listNotesSchools, saveNotesSchool } from '../../api/notes.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { msgOf, formatBytes } from '../../components/notes/notesUtils';

const QUOTA_GB = [1, 2, 5, 10, 20, 50];
const FILE_MB = [5, 10, 15, 25];
const sel = 'w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]';

export default function NotesAccess() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ enabled: true, quotaMb: 2048, maxFileMb: 10 });

  const { data = [], isLoading } = useQuery({
    queryKey: ['sa-notes-schools', search],
    queryFn: () => listNotesSchools({ search: search || undefined }).then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: () => saveNotesSchool(edit.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-notes-schools'] }); setEdit(null); },
  });

  const openEdit = (s) => {
    setForm({ enabled: s.settings.enabled, quotaMb: s.settings.quotaMb || 2048, maxFileMb: s.settings.maxFileMb || 10 });
    setEdit(s);
    save.reset();
  };

  const quotaOptions = [...new Set([...QUOTA_GB.map((g) => g * 1024), form.quotaMb])].sort((a, b) => a - b);
  const fileOptions = [...new Set([...FILE_MB, form.maxFileMb])].sort((a, b) => a - b);

  const columns = [
    { key: 'name', label: 'School', render: (r) => (<div><p className="font-semibold text-[#1e293b]">{r.name}</p><p className="text-xs text-[#94a3b8]">{r.code}</p></div>) },
    { key: 'enabled', label: 'Notes', render: (r) => <Badge label={r.settings.enabled ? 'Enabled' : 'Off'} variant={r.settings.enabled ? 'success' : 'default'} /> },
    { key: 'usage', label: 'Storage', render: (r) => r.settings.quotaMb ? (
      <div className="min-w-[150px]">
        <p className="text-xs text-[#475569]">{formatBytes(r.settings.usedBytes)} / {formatBytes(r.settings.quotaBytes)}</p>
        <div className="mt-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div className={`h-full ${r.settings.usedPct >= 90 ? 'bg-red-500' : r.settings.usedPct >= 80 ? 'bg-amber-500' : 'bg-[#f97316]'}`} style={{ width: `${Math.min(100, r.settings.usedPct)}%` }} />
        </div>
      </div>
    ) : <span className="text-xs text-[#94a3b8]">—</span> },
    { key: 'file', label: 'Max file', render: (r) => (r.settings.quotaMb ? `${r.settings.maxFileMb} MB` : '—') },
    { key: 'notes', label: 'Notes', render: (r) => r.noteCount },
    { key: 'actions', label: '', render: (r) => <Button size="sm" variant="outline" icon={Settings2} onClick={() => openEdit(r)}>Manage</Button> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Notes Access</h1>
        <p className="text-sm text-[#64748b] mt-1">Notes is a paid add-on. Switch it on per school and set the storage they are paying for.</p>
      </div>

      <Card>
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search school name or code"
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
        </div>
      </Card>

      <Table columns={columns} data={data} loading={isLoading} emptyMessage="No schools found." />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Notes — ${edit?.name || ''}`} size="sm">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-[#374151]">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            Enable Notes for this school
          </label>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Storage quota</label>
            <select className={sel} value={form.quotaMb} onChange={(e) => setForm((f) => ({ ...f, quotaMb: Number(e.target.value) }))}>
              {quotaOptions.map((mb) => <option key={mb} value={mb}>{mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Max size per file</label>
            <select className={sel} value={form.maxFileMb} onChange={(e) => setForm((f) => ({ ...f, maxFileMb: Number(e.target.value) }))}>
              {fileOptions.map((mb) => <option key={mb} value={mb}>{mb} MB</option>)}
            </select>
          </div>
          <p className="text-xs text-[#64748b]">Turning Notes off hides it from teachers and parents. Existing notes and files are kept.</p>
          {save.isError && <p className="text-sm text-red-600">{msgOf(save.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}