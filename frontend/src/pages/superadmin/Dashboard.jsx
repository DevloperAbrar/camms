import { useQuery } from '@tanstack/react-query';
import { School, TrendingUp, AlertTriangle, Ban, Clock, IndianRupee, Activity } from 'lucide-react';
import { getSADashboard } from '../../api/superadmin.api';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';

function StatCard({ label, value, icon: Icon, color, sub }) {
  const colors = {
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  val: 'text-green-700'  },
    orange: { bg: 'bg-orange-50', icon: 'text-[#f97316]',  val: 'text-[#f97316]'  },
    red:    { bg: 'bg-red-50',    icon: 'text-red-600',    val: 'text-red-700'    },
    navy:   { bg: 'bg-[#f0f4ff]', icon: 'text-[#1e293b]',  val: 'text-[#1e293b]'  },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  val: 'text-amber-700'  },
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   val: 'text-blue-700'   },
  };
  const c = colors[color] || colors.navy;
  return (
    <Card className="flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div>
        <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-extrabold mt-0.5 ${c.val}`}>{value}</p>
        {sub && <p className="text-xs text-[#94a3b8] mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

export default function SADashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sa-dashboard'],
    queryFn: () => getSADashboard().then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const d = data || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Platform Overview</h1>
        <p className="text-sm text-[#64748b] mt-1">Real-time stats across all schools on CampusSafar</p>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total Schools"       value={d.totalSchools ?? 0}            icon={School}       color="navy"   />
        <StatCard label="Active Schools"      value={d.activeSchools ?? 0}           icon={Activity}     color="green"  />
        <StatCard label="Trial Schools"       value={d.trialSchools ?? 0}            icon={Clock}        color="blue"   />
        <StatCard label="Expired Schools"     value={d.expiredSchools ?? 0}          icon={AlertTriangle} color="red"  />
        <StatCard label="Suspended"           value={d.suspendedSchools ?? 0}        icon={Ban}          color="amber"  />
        <StatCard label="Renewals Due (30d)"  value={d.renewalsDueNext30Days ?? 0}   icon={TrendingUp}   color="orange" sub="Schools expiring soon" />
      </div>

      {/* Revenue */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center">
            <IndianRupee size={28} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm text-[#64748b] font-medium">This Month's Revenue</p>
            <p className="text-3xl font-extrabold text-[#1e293b] mt-0.5">
              ₹{(d.monthRevenue ?? 0).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-[#94a3b8] mt-1">From renewals processed this calendar month</p>
          </div>
        </div>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/superadmin/schools" className="block">
          <Card className="hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Manage Schools</p>
                <p className="text-sm text-[#64748b] mt-0.5">Onboard, update, suspend schools</p>
              </div>
              <School size={24} className="text-[#cbd5e1] group-hover:text-[#f97316] transition-colors" />
            </div>
          </Card>
        </a>
        <a href="/superadmin/plans" className="block">
          <Card className="hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Subscription Plans</p>
                <p className="text-sm text-[#64748b] mt-0.5">Create and manage pricing plans</p>
              </div>
              <TrendingUp size={24} className="text-[#cbd5e1] group-hover:text-[#f97316] transition-colors" />
            </div>
          </Card>
        </a>
      </div>
    </div>
  );
}