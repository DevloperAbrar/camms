export const PACE_META = {
    ahead:           { label: 'Ahead of plan',   variant: 'success', bar: '#16a34a' },
    on_track:        { label: 'On track',        variant: 'success', bar: '#16a34a' },
    slightly_behind: { label: 'Slightly behind', variant: 'warning', bar: '#f59e0b' },
    behind:          { label: 'Behind plan',     variant: 'danger',  bar: '#dc2626' },
    no_plan:         { label: 'No plan dates',   variant: 'default', bar: '#f97316' },
  };
  
  export const RISK_META = {
    ready: { label: 'Fully covered',   variant: 'success', bar: '#16a34a' },
    ok:    { label: 'On course',       variant: 'info',    bar: '#3b82f6' },
    watch: { label: 'Needs attention', variant: 'warning', bar: '#f59e0b' },
    high:  { label: 'At risk',         variant: 'danger',  bar: '#dc2626' },
  };
  
  export const STATUS_OPTIONS = [
    { value: 'not_started', label: 'Not started' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed',   label: 'Completed' },
  ];
  
  export const fmtPct = (n) => {
    const v = Number(n ?? 0);
    return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  };
  
  export function examDaysLabel(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return '';
    if (daysLeft > 1) return `${daysLeft} days left`;
    if (daysLeft === 1) return 'Tomorrow';
    if (daysLeft === 0) return 'Starts today';
    return 'Exam already started';
  }
  
  export function updatedLabel(daysSince) {
    if (daysSince === null || daysSince === undefined) return 'Never updated';
    if (daysSince === 0) return 'Updated today';
    if (daysSince === 1) return 'Updated yesterday';
    return `Updated ${daysSince} days ago`;
  }
  
  export const teacherNames = (teachers) => (teachers?.length ? teachers.map((t) => t.name).join(', ') : 'No teacher assigned');