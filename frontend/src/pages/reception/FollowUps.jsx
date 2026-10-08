import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle } from 'lucide-react';
import { getFollowUps } from '../../api/reception.api';
import { useReceptionMeta, StageBadge, PRIORITY_VARIANT, fmtDate, fmtDateTime, waLink } from './receptionUtils';
import { EnquiryDetailModal } from './EnquiryModals';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

function Section({ title, tone, rows, onOpen, meta, empty }) {
  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
        <h2 className={`font-bold ${tone}`}>{title}</h2>
        <Badge label={String(rows.length)} variant="default" />
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-[#94a3b8]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[#f1f5f9]">
          {rows.map((e) => (
            <li key={e.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#1e293b]">{e.studentName} <span className="text-[#94a3b8] font-normal">· {e.classSought}</span></p>
                <p className="text-sm text-[#64748b]">{e.parentName} · {e.phone}</p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  {e.enquiryNo}{e.nextFollowUpOn ? ` · due ${fmtDate(e.nextFollowUpOn)}` : ''}
                  {e.lastContactedAt ? ` · last contact ${fmtDateTime(e.lastContactedAt)}` : ' · never contacted'}
                  {e.assignedToName ? ` · ${e.assignedToName}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StageBadge stage={e.stage} />
                <Badge label={e.priority} variant={PRIORITY_VARIANT[e.priority]} />
                <a href={`tel:${e.phone}`} className="p-2 rounded-lg text-[#64748b] hover:bg-[#f1f5f9]"><Phone size={16} /></a>
                <a href={waLink(e.phone, `Hello ${e.parentName}, this is ${meta?.school?.name || 'our school'} regarding ${e.studentName}'s admission enquiry.`)} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-green-600 hover:bg-green-50"><MessageCircle size={16} /></a>
                <Button size="sm" onClick={() => onOpen(e.id)}>Log follow-up</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function FollowUps() {
  const { data: meta } = useReceptionMeta();
  const [mine, setMine] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['followups', mine],
    queryFn: () => getFollowUps(mine ? { assignedToId: 'me' } : {}).then((r) => r.data.data),
  });

  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Follow-up Board</h1>
          <p className="text-sm text-[#64748b] mt-1">Work top to bottom. Speed of follow-up decides who gets the admission.</p>
        </div>
        <div className="flex rounded-lg border border-[#e2e8f0] overflow-hidden bg-white">
          {[{ v: false, l: 'Everyone' }, { v: true, l: 'Assigned to me' }].map((o) => (
            <button key={o.l} onClick={() => setMine(o.v)}
              className={`px-4 py-2 text-sm font-semibold ${mine === o.v ? 'bg-[#1e293b] text-white' : 'text-[#475569]'}`}>{o.l}</button>
          ))}
        </div>
      </div>

      <Section title="Overdue" tone="text-red-600" rows={data.overdue} onOpen={setOpenId} meta={meta} empty="No overdue follow-ups." />
      <Section title="Due today" tone="text-[#f97316]" rows={data.today_} onOpen={setOpenId} meta={meta} empty="Nothing due today." />
      <Section title="Next 7 days" tone="text-[#1e293b]" rows={data.upcoming} onOpen={setOpenId} meta={meta} empty="Nothing scheduled this week." />
      <Section title="No follow-up set (at risk of being forgotten)" tone="text-amber-600" rows={data.unscheduled} onOpen={setOpenId} meta={meta} empty="Every open enquiry has a next step." />

      {openId && <EnquiryDetailModal id={openId} meta={meta} onClose={() => setOpenId(null)} />}
    </div>
  );
}