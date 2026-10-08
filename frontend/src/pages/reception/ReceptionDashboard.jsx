import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getReceptionDashboard } from '../../api/reception.api';
import { useReceptionBase, StageBadge, STAGE_LABEL, SOURCE_LABEL, PURPOSE_LABEL, fmtDate, fmtDateTime, duration, inputCls } from './receptionUtils';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

function Stat({ label, value, tone = 'text-[#1e293b]', to, hint }) {
  const body = (
    <Card className="h-full">
      <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-extrabold mt-1 ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-[#94a3b8] mt-1">{hint}</p>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function ReceptionDashboard() {
  const base = useReceptionBase();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['reception-dashboard', days],
    queryFn: () => getReceptionDashboard({ days }).then((r) => r.data.data),
  });

  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>;

  const { pipeline, followUps, range, bySource, dueList, visitors } = data;
  const funnel = ['new_lead', 'follow_up', 'interested', 'test_scheduled', 'interview', 'admitted', 'lost'];
  const maxStage = Math.max(1, ...funnel.map((s) => pipeline[s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Reception Overview</h1>
          <p className="text-sm text-[#64748b] mt-1">Admission enquiries and gate activity at a glance.</p>
        </div>
        <select className={`${inputCls} !w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Follow-ups due today" value={followUps.dueToday} tone="text-[#f97316]" to={`${base}/follow-ups`} />
        <Stat label="Overdue follow-ups" value={followUps.overdue} tone={followUps.overdue ? 'text-red-600' : 'text-[#1e293b]'} to={`${base}/follow-ups`} />
        <Stat label="No follow-up set" value={followUps.unscheduled} hint="Open enquiries that may be forgotten" to={`${base}/follow-ups`} />
        <Stat label="Unassigned" value={followUps.unassigned} hint="Open enquiries with no owner" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={`New enquiries (${days}d)`} value={range.newEnquiries} />
        <Stat label="Admitted" value={range.admitted} tone="text-green-600" />
        <Stat label="Lost" value={range.lost} />
        <Stat label="Conversion" value={`${range.conversionRate}%`} hint="Admitted ÷ enquiries in this period" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <h2 className="font-bold text-[#1e293b] mb-3">Pipeline (all time)</h2>
          <div className="space-y-2">
            {funnel.map((s) => (
              <div key={s} className="flex items-center gap-3">
                <div className="w-28 text-sm text-[#475569]">{STAGE_LABEL[s]}</div>
                <div className="flex-1 bg-[#f1f5f9] rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full ${s === 'admitted' ? 'bg-green-500' : s === 'lost' ? 'bg-red-400' : 'bg-[#f97316]'}`}
                    style={{ width: `${(pipeline[s] / maxStage) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm font-semibold text-[#1e293b]">{pipeline[s]}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-bold text-[#1e293b] mb-3">Where enquiries come from ({days}d)</h2>
          {bySource.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No enquiries in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#64748b] uppercase">
                  <th className="py-1">Source</th><th className="py-1 text-right">Enquiries</th>
                  <th className="py-1 text-right">Admitted</th><th className="py-1 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {bySource.map((s) => (
                  <tr key={s.source} className="border-t border-[#f1f5f9]">
                    <td className="py-2">{SOURCE_LABEL[s.source] || s.source}</td>
                    <td className="py-2 text-right">{s.total}</td>
                    <td className="py-2 text-right">{s.admitted}</td>
                    <td className="py-2 text-right font-semibold">{Math.round((s.admitted / s.total) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-[#1e293b]">Needs a call now</h2>
            <Link to={`${base}/follow-ups`} className="text-sm font-semibold text-[#f97316]">Open board</Link>
          </div>
          {dueList.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Nothing due. 🎉</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {dueList.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1e293b] truncate">{d.studentName} <span className="text-[#94a3b8] font-normal">· {d.classSought}</span></p>
                    <p className="text-xs text-[#64748b]">{d.parentName} · {d.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-semibold ${d.nextFollowUpOn < data.today ? 'text-red-600' : 'text-[#f97316]'}`}>{fmtDate(d.nextFollowUpOn)}</p>
                    <StageBadge stage={d.stage} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-[#1e293b]">Inside the campus now</h2>
            <Link to={`${base}/visitors`} className="text-sm font-semibold text-[#f97316]">Visitor log</Link>
          </div>
          <p className="text-sm text-[#64748b] mb-2">
            <b className="text-[#1e293b]">{visitors.inside}</b> inside · <b className="text-[#1e293b]">{visitors.today}</b> checked in today
            {visitors.staleInside > 0 && <span className="text-red-600"> · {visitors.staleInside} from earlier days not checked out</span>}
          </p>
          {visitors.insideList.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No visitors inside.</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {visitors.insideList.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1e293b] truncate">{v.name}{v.headCount > 1 ? ` (+${v.headCount - 1})` : ''}</p>
                    <p className="text-xs text-[#64748b]">{PURPOSE_LABEL[v.purpose] || v.purpose}{v.hostName ? ` · to meet ${v.hostName}` : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[#64748b]">{fmtDateTime(v.checkInAt)}</p>
                    <Badge label={duration(v.checkInAt)} variant="info" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}