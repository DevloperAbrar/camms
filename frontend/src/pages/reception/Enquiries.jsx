import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Search, Phone, MessageCircle } from 'lucide-react';
import { getEnquiries, exportEnquiriesCsv } from '../../api/reception.api';
import {
  useReceptionMeta, inputCls, selectCls, errMsg, saveBlob, StageBadge, STAGE_LABEL, SOURCE_LABEL,
  PRIORITY_VARIANT, CLOSED, fmtDate, waLink,
} from './receptionUtils';
import { EnquiryFormModal, EnquiryDetailModal } from './EnquiryModals';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

const EMPTY = { stage: 'open', source: '', assignedToId: '', followUp: '', priority: '', from: '', to: '' };

export default function Enquiries() {
  const qc = useQueryClient();
  const { data: meta } = useReceptionMeta();
  const [filters, setFilters] = useState(EMPTY);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = Object.fromEntries(
    Object.entries({ ...filters, search, page, limit: 25, sort: filters.followUp ? 'followUp' : '' }).filter(([, v]) => v !== '' && v !== null)
  );

  const { data, isLoading } = useQuery({
    queryKey: ['enquiries', params],
    queryFn: () => getEnquiries(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const counts = data?.stageCounts || {};
  const openCount = Object.entries(counts).filter(([s]) => !CLOSED.includes(s)).reduce((a, [, n]) => a + n, 0);
  const allCount = Object.values(counts).reduce((a, n) => a + n, 0);
  const chips = [
    { key: 'open', label: 'Open', n: openCount },
    ...(meta?.stages || []).map((s) => ({ key: s, label: STAGE_LABEL[s], n: counts[s] || 0 })),
    { key: '', label: 'All', n: allCount },
  ];

  const doExport = async () => {
    try {
      const { search: _s, page: _p, limit: _l, ...rest } = params;
      const r = await exportEnquiriesCsv({ ...rest, ...(search ? { search } : {}) });
      saveBlob(r.data, 'enquiries.csv');
    } catch (e) { window.alert(errMsg(e)); }
  };

  const columns = [
    { key: 'enq', label: 'Enquiry', render: (e) => (<div><p className="font-semibold text-[#1e293b]">{e.studentName}</p><p className="text-xs text-[#94a3b8]">{e.enquiryNo} · {e.classSought}</p></div>) },
    {
      key: 'parent', label: 'Parent', render: (e) => (
        <div className="flex items-center gap-2">
          <div><p className="text-[#1e293b]">{e.parentName}</p><p className="text-xs text-[#64748b]">{e.phone}</p></div>
          <a href={`tel:${e.phone}`} onClick={(x) => x.stopPropagation()} className="p-1.5 rounded-lg text-[#64748b] hover:bg-[#f1f5f9]"><Phone size={15} /></a>
          <a href={waLink(e.phone)} target="_blank" rel="noreferrer" onClick={(x) => x.stopPropagation()} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"><MessageCircle size={15} /></a>
        </div>
      ),
    },
    { key: 'src', label: 'Source', render: (e) => SOURCE_LABEL[e.source] || e.source },
    { key: 'stage', label: 'Stage', render: (e) => <StageBadge stage={e.stage} /> },
    { key: 'pri', label: 'Priority', render: (e) => <Badge label={e.priority} variant={PRIORITY_VARIANT[e.priority]} /> },
    {
      key: 'next', label: 'Next follow-up', render: (e) => {
        if (CLOSED.includes(e.stage)) return '—';
        if (!e.nextFollowUpOn) return <span className="text-amber-600 text-xs font-semibold">Not set</span>;
        const late = meta && e.nextFollowUpOn < meta.today;
        return <span className={late ? 'text-red-600 font-semibold' : e.nextFollowUpOn === meta?.today ? 'text-[#f97316] font-semibold' : ''}>{fmtDate(e.nextFollowUpOn)}{late ? ' (overdue)' : ''}</span>;
      },
    },
    { key: 'who', label: 'Assigned', render: (e) => e.assignedToName || <span className="text-[#94a3b8]">—</span> },
    { key: 'act', label: '', render: (e) => <Button size="sm" variant="outline" onClick={() => setOpenId(e.id)}>Open</Button> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Admission Enquiries</h1>
          <p className="text-sm text-[#64748b] mt-1">Capture every enquiry, never miss a follow-up, and convert to a student in one click.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={Download} onClick={doExport}>Export CSV</Button>
          <Button icon={Plus} onClick={() => setCreating(true)}>New enquiry</Button>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex justify-between gap-3">
          <span>{notice}</span>
          <button className="font-semibold" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.key || 'all'}
            onClick={() => setF('stage', c.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${
              filters.stage === c.key ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white text-[#475569] border-[#e2e8f0] hover:border-[#cbd5e1]'
            }`}
          >
            {c.label} <span className="opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input className={`${inputCls} pl-9`} placeholder="Search name, phone, enquiry no…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <select className={selectCls} value={filters.source} onChange={(e) => setF('source', e.target.value)}>
            <option value="">All sources</option>
            {(meta?.sources || []).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
          <select className={selectCls} value={filters.assignedToId} onChange={(e) => setF('assignedToId', e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {(meta?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className={selectCls} value={filters.followUp} onChange={(e) => setF('followUp', e.target.value)}>
            <option value="">Any follow-up</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="upcoming">Upcoming</option>
            <option value="none">Not scheduled</option>
          </select>
          <select className={selectCls} value={filters.priority} onChange={(e) => setF('priority', e.target.value)}>
            <option value="">Any priority</option>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <div className="col-span-2 flex items-center gap-2">
            <input type="date" className={inputCls} value={filters.from} onChange={(e) => setF('from', e.target.value)} />
            <span className="text-[#94a3b8] text-sm">to</span>
            <input type="date" className={inputCls} value={filters.to} onChange={(e) => setF('to', e.target.value)} />
          </div>
          <Button variant="ghost" onClick={() => { setFilters(EMPTY); setSearchInput(''); }}>Clear filters</Button>
        </div>
      </Card>

      <Card padding={false}>
        <div className="p-4">
          <Table columns={columns} data={data?.enquiries || []} loading={isLoading} emptyMessage="No enquiries match these filters" />
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-[#64748b]">
              <span>{data.total} enquiries</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {data.page} of {data.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {creating && (
        <EnquiryFormModal
          meta={meta}
          onClose={() => setCreating(false)}
          onSaved={(result, message) => {
            setCreating(false);
            const sib = result.siblings?.length ? ` Heads-up: this parent already has a child here (${result.siblings.map((s) => s.name).join(', ')}) — mention the sibling benefit.` : '';
            setNotice(`${message}.${sib}`);
            qc.invalidateQueries({ queryKey: ['enquiries'] });
            qc.invalidateQueries({ queryKey: ['followups'] });
            qc.invalidateQueries({ queryKey: ['reception-dashboard'] });
          }}
        />
      )}
      {openId && <EnquiryDetailModal id={openId} meta={meta} onClose={() => setOpenId(null)} />}
    </div>
  );
}