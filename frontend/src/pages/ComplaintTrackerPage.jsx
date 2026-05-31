import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getComplaint } from '../api/complaints.js';
import { ROAD_TYPE_COLORS } from '../components/RoadDetailPanel.jsx';

const statuses = ['Submitted', 'Routed', 'Acknowledged', 'In Progress', 'Resolved'];
const statusClasses = {
  Submitted: 'bg-slate-500 text-white',
  Routed: 'bg-blue-500 text-white',
  Acknowledged: 'bg-yellow-400 text-[#0f172a]',
  'In Progress': 'bg-orange-500 text-white',
  Resolved: 'bg-green-500 text-white',
};

function formatDateTime(value) {
  if (!value) return 'Pending routing';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ComplaintTrackerPage() {
  const { complaint_id } = useParams();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getComplaint(complaint_id)
      .then((data) => {
        if (active) setComplaint(data);
      })
      .catch(() => {
        if (active) setError('Unable to load complaint details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [complaint_id]);

  const currentIndex = Math.max(0, statuses.indexOf(complaint?.status || 'Submitted'));
  const issues = complaint?.issue_types?.length ? complaint.issue_types : [complaint?.issue_type].filter(Boolean);
  const hasRouting = Boolean(complaint?.assigned_authority_name);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#0f172a] px-4 py-8">
      <section className="mx-auto max-w-4xl">
        <Link className="mb-5 inline-block text-sm font-semibold text-[#38bdf8]" to="/">
          Back to map
        </Link>

        {loading ? <p className="rounded-xl bg-[#1e293b] p-5 text-[#94a3b8]">Loading complaint...</p> : null}
        {!loading && error ? <p className="rounded-xl bg-red-950 p-5 text-red-100">{error}</p> : null}

        {!loading && complaint ? (
          <div className="space-y-5">
            <header className="rounded-xl bg-[#1e293b] p-5 shadow-2xl">
              <p className="text-sm text-[#94a3b8]">Complaint ID</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <code className="rounded-xl bg-[#334155] px-3 py-2 text-sm text-[#38bdf8]">
                  {complaint.complaint_id}
                </code>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusClasses[complaint.status] || statusClasses.Submitted}`}>
                  {complaint.status}
                </span>
              </div>
            </header>

            <section className="rounded-xl bg-[#1e293b] p-5 shadow-2xl">
              <h2 className="mb-5 text-lg font-bold text-[#f1f5f9]">Status Timeline</h2>
              <div className="space-y-4">
                {statuses.map((status, index) => {
                  const done = index <= currentIndex;
                  return (
                    <div key={status} className="flex items-center gap-4">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${done ? 'border-[#38bdf8] bg-[#38bdf8] text-[#0f172a]' : 'border-[#94a3b8] text-[#94a3b8]'}`}>
                        {done ? '●' : '○'}
                      </span>
                      <span className={done ? 'font-semibold text-[#f1f5f9]' : 'text-[#94a3b8]'}>{status}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-5 md:grid-cols-2">
              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Road</h3>
                <p className="font-bold text-[#f1f5f9]">{complaint.road_name}</p>
                {complaint.road_type ? (
                  <span className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: ROAD_TYPE_COLORS[complaint.road_type] || '#38bdf8' }}>
                    {complaint.road_type}
                  </span>
                ) : null}
              </div>

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Issue</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {issues.map((issue) => (
                    <span key={issue} className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-[#38bdf8]">
                      {issue}
                    </span>
                  ))}
                  <span className="rounded-full bg-[#334155] px-3 py-1 text-xs font-bold text-[#f1f5f9]">{complaint.severity}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#94a3b8]">{complaint.description}</p>
              </div>

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl md:col-span-2">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">AI Triage</h3>
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#38bdf8] px-3 py-1 text-xs font-bold text-[#0f172a]">
                    Urgency: {complaint.urgency_score ?? 'Pending'}/10
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      complaint.safety_risk ? 'bg-red-500 text-white' : 'bg-[#334155] text-[#f1f5f9]'
                    }`}
                  >
                    {complaint.safety_risk ? 'Safety Risk' : 'No Immediate Safety Risk'}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[#f1f5f9]">{complaint.ai_summary || 'AI summary pending.'}</p>
                {complaint.ai_reasoning ? (
                  <p className="mt-3 text-xs leading-5 text-[#94a3b8]">{complaint.ai_reasoning}</p>
                ) : null}
              </div>

              {complaint.media_url ? (
                <a className="rounded-xl bg-[#1e293b] p-5 shadow-xl" href={complaint.media_url} target="_blank" rel="noreferrer">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Photo</h3>
                  <img className="h-48 w-full rounded-xl object-cover" src={complaint.media_url} alt="Complaint media" />
                </a>
              ) : null}

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Location</h3>
                <p className="font-mono text-sm text-[#f1f5f9]">{complaint.lat}, {complaint.lng}</p>
              </div>

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Authority</h3>
                {hasRouting ? (
                  <>
                    <p className="font-semibold text-[#f1f5f9]">{complaint.assigned_authority_name}</p>
                    <p className="mt-2 text-sm text-[#94a3b8]">
                      {complaint.assigned_officer}
                      {complaint.designation ? `, ${complaint.designation}` : ''}
                    </p>
                  </>
                ) : (
                  <p className="font-semibold text-amber-300">Routing pending manual review</p>
                )}
              </div>

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">SLA</h3>
                <p className="text-[#f1f5f9]">{formatDateTime(complaint.sla_deadline)}</p>
              </div>

              <div className="rounded-xl bg-[#1e293b] p-5 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#94a3b8]">Submitted</h3>
                <p className="text-[#f1f5f9]">{formatDateTime(complaint.created_at)}</p>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default ComplaintTrackerPage;
