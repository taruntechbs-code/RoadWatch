import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAnomalies, getBudgetOverview, getComplaintHeatmap, getContractorScores } from '../api/analytics.js';

const CHENNAI_CENTER = [13.0827, 80.2707];

function formatINR(value) {
  const amount = Number(value || 0);
  if (amount >= 10000000) return `Rs ${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `Rs ${(amount / 100000).toFixed(1)}L`;
  return `Rs ${amount.toLocaleString('en-IN')}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

function shortLabel(value, max = 18) {
  const text = value || 'Unknown';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function SkeletonBlock() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-2/5 animate-pulse rounded bg-slate-600/70" />
      <div className="h-56 animate-pulse rounded-xl bg-slate-700/60" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-16 animate-pulse rounded-xl bg-slate-700/60" />
        <div className="h-16 animate-pulse rounded-xl bg-slate-700/60" />
        <div className="h-16 animate-pulse rounded-xl bg-slate-700/60" />
      </div>
    </div>
  );
}

function Card({ title, subtitle, loading, error, children }) {
  return (
    <section className="min-h-[30rem] rounded-xl border border-slate-700/70 bg-[#162235] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 border-b border-slate-700/80 pb-4">
        <h2 className="text-xl font-bold text-[#f8fafc]">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-[#94a3b8]">{subtitle}</p> : null}
      </div>
      {loading ? <SkeletonBlock /> : null}
      {!loading && error ? <p className="rounded-xl border border-red-500/40 bg-red-950/80 p-4 text-sm text-red-100">{error}</p> : null}
      {!loading && !error ? children : null}
    </section>
  );
}

function EmptyState({ children, tall = false }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-[#0f172a]/70 p-6 text-center ${tall ? 'min-h-80' : ''}`}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#1e293b] text-sm font-black text-[#38bdf8]">RW</div>
      <p className="max-w-sm text-sm leading-6 text-[#94a3b8]">{children}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-[#0f172a] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className="mt-1 text-lg font-black text-[#f8fafc]">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, accentClass, detail }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#162235] p-5 shadow-xl shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">{label}</p>
          <p className="mt-2 text-3xl font-black text-[#f8fafc]">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${accentClass}`}>
          {label.slice(0, 1)}
        </span>
      </div>
      {detail ? <p className="mt-3 text-sm text-[#94a3b8]">{detail}</p> : null}
    </div>
  );
}

function BudgetTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-xl border border-slate-600 bg-[#0f172a] p-4 text-sm text-[#f1f5f9] shadow-2xl">
      <p className="mb-2 max-w-64 font-bold">{row.fullLabel || row.label}</p>
      <div className="space-y-1 text-[#cbd5e1]">
        <p>Sanctioned: <span className="font-semibold text-[#38bdf8]">{formatINR(row.sanctioned_amount)}</span></p>
        <p>Spent: <span className="font-semibold text-amber-300">{formatINR(row.spent_amount)}</span></p>
        <p>Complaints: {row.complaint_count || 0}</p>
      </div>
    </div>
  );
}

function BudgetOverview({ data, loading, error }) {
  const [view, setView] = useState('road');
  const rows = view === 'road' ? data?.by_road || [] : data?.by_contractor || [];
  const chartRows = rows
    .slice()
    .sort((a, b) => (b.sanctioned_amount || 0) - (a.sanctioned_amount || 0))
    .slice(0, 6)
    .map((row) => {
      const fullLabel = view === 'road' ? row.road_name : row.contractor_name;
      return { ...row, fullLabel, label: shortLabel(fullLabel, 16) };
    });
  const totalSanctioned = rows.reduce((sum, row) => sum + Number(row.sanctioned_amount || 0), 0);
  const totalSpent = rows.reduce((sum, row) => sum + Number(row.spent_amount || 0), 0);
  const utilization = totalSanctioned ? (totalSpent / totalSanctioned) * 100 : 0;

  return (
    <Card title="Budget Overview" subtitle="Sanctioned amount compared with actual public works spend." loading={loading} error={error}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-700 bg-[#0f172a] p-1">
          {[
            ['road', 'By Road'],
            ['contractor', 'By Contractor'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${view === key ? 'bg-[#38bdf8] text-[#0f172a] shadow-lg shadow-cyan-500/20' : 'text-[#94a3b8] hover:text-[#f1f5f9]'}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Top 6 by sanctioned budget</p>
      </div>

      {chartRows.length ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Total sanctioned" value={formatINR(totalSanctioned)} />
            <MiniStat label="Total spent" value={formatINR(totalSpent)} />
            <MiniStat label="Utilization" value={formatPercent(utilization)} />
          </div>
          <div className="h-80 rounded-xl bg-[#0f172a] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 14, right: 12, left: 8, bottom: 28 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} height={44} />
                <YAxis stroke="#94a3b8" tickFormatter={formatINR} tick={{ fontSize: 11 }} width={72} />
                <Tooltip content={<BudgetTooltip />} cursor={{ fill: 'rgba(56, 189, 248, 0.08)' }} />
                <Bar dataKey="sanctioned_amount" name="Sanctioned" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="spent_amount" name="Spent" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <EmptyState tall>No budget records are available yet. Sanctioned and spent amounts will appear once project data is loaded.</EmptyState>
      )}
    </Card>
  );
}

function densityColor(ratio) {
  if (ratio >= 0.7) return '#ef4444';
  if (ratio >= 0.35) return '#f97316';
  return '#facc15';
}

function DefectHeatmap({ data, loading, error }) {
  const points = data?.points || [];
  const maxIntensity = Math.max(...points.map((point) => point.intensity || 0), 1);

  return (
    <Card title="Defect Heatmap" subtitle="Complaint density across Chennai road corridors." loading={loading} error={error}>
      {points.length ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-700 shadow-inner shadow-black/30">
            <MapContainer center={CHENNAI_CENTER} zoom={11} scrollWheelZoom={false} className="h-80 w-full">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {points.map((point) => {
                const ratio = (point.intensity || 1) / maxIntensity;
                const color = densityColor(ratio);
                return (
                  <CircleMarker
                    key={point.road_id}
                    center={[point.lat, point.lng]}
                    radius={10 + ratio * 24}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.32 + ratio * 0.38, opacity: 0.75, weight: 2 }}
                  >
                    <Popup>
                      <strong>{point.road_name}</strong>
                      <br />
                      {point.zone}
                      <br />
                      Complaints: {point.complaint_count}
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0f172a] px-4 py-3 text-sm text-[#94a3b8]">
            <span>Brighter, larger markers indicate higher complaint density.</span>
            <div className="flex items-center gap-3">
              {[
                ['Low', '#facc15'],
                ['Medium', '#f97316'],
                ['High', '#ef4444'],
              ].map(([label, color]) => (
                <span key={label} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState tall>Complaint density will appear here as reports are submitted. This panel is ready to surface hotspots across Chennai roads.</EmptyState>
      )}
    </Card>
  );
}

function bandClasses(band) {
  if (band === 'High Risk') return 'bg-red-500 text-white';
  if (band === 'Watchlist') return 'bg-amber-400 text-[#0f172a]';
  if (band === 'Moderate') return 'bg-yellow-300 text-[#0f172a]';
  return 'bg-green-500 text-white';
}

function riskColor(score) {
  if ((score || 0) >= 75) return 'bg-red-500';
  if ((score || 0) >= 50) return 'bg-amber-400';
  if ((score || 0) >= 25) return 'bg-yellow-300';
  return 'bg-green-500';
}

function ContractorScorecard({ data, loading, error }) {
  const rows = (data?.contractors || [])
    .slice()
    .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0) || (b.complaint_count || 0) - (a.complaint_count || 0))
    .slice(0, 8);

  return (
    <Card title="Contractor Scorecard" subtitle="Risk, repeat repairs, and complaint burden by contractor." loading={loading} error={error}>
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#0f172a] text-xs uppercase tracking-wide text-[#94a3b8]">
              <tr>
                <th className="px-4 py-3">Contractor</th>
                <th className="px-4 py-3">Roads</th>
                <th className="px-4 py-3">Complaints</th>
                <th className="px-4 py-3">Repeat Repairs</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-[#162235]">
              {rows.map((contractor) => (
                <tr key={contractor.contractor_id} className="transition hover:bg-[#1e293b]">
                  <td className="px-4 py-4 pr-6">
                    <p className="font-bold text-[#f8fafc]">{contractor.contractor_name}</p>
                    <p className="mt-1 text-xs text-[#94a3b8]">{contractor.contractor_id}</p>
                  </td>
                  <td className="px-4 py-4 text-[#cbd5e1]">{contractor.roads_handled}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[#0f172a] px-3 py-1 text-xs font-bold text-[#38bdf8]">{contractor.complaint_count}</span>
                  </td>
                  <td className="px-4 py-4 text-[#cbd5e1]">{contractor.repeat_repair_count ?? 0}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 w-28 overflow-hidden rounded-full bg-[#0f172a]">
                        <div className={`h-full rounded-full ${riskColor(contractor.risk_score)}`} style={{ width: `${Math.min(100, contractor.risk_score || 0)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-[#f8fafc]">{contractor.risk_score ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${bandClasses(contractor.performance_band)}`}>
                      {contractor.performance_band}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState tall>No contractor score data yet. Contractor reliability metrics will populate as project and complaint records grow.</EmptyState>
      )}
    </Card>
  );
}

function healthClass(score) {
  if (score == null) return 'bg-slate-500 text-white';
  if (score < 40) return 'bg-red-500 text-white';
  if (score < 60) return 'bg-amber-400 text-[#0f172a]';
  return 'bg-green-500 text-white';
}

function FlagChips({ flags }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {flags.map((flag) => (
        <span key={flag} className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
          {flag}
        </span>
      ))}
    </div>
  );
}

function AnomalyAlerts({ data, loading, error }) {
  const roads = data?.roads || [];
  const contractors = data?.contractors || [];

  return (
    <Card title="Anomaly Alerts" subtitle="Rule-based alerts for spending, repair recency, and repeat failures." loading={loading} error={error}>
      {!roads.length && !contractors.length ? <EmptyState tall>No anomalies detected in the current dataset.</EmptyState> : null}
      {roads.length ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#94a3b8]">Flagged Roads</h3>
            <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200">{roads.length} active alerts</span>
          </div>
          <div className="space-y-3">
            {roads.slice(0, 6).map((road) => (
              <article key={road.road_id} className="rounded-xl border border-slate-700 bg-[#0f172a] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-[#f8fafc]">{road.road_name}</p>
                    <p className="mt-1 text-sm text-[#94a3b8]">{road.zone} / {road.contractor_name || 'Contractor unavailable'}</p>
                  </div>
                  <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">{road.complaint_count} complaints</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Spent" value={formatINR(road.spent_amount)} />
                  <MiniStat label="Sanctioned" value={formatINR(road.sanctioned_amount)} />
                  <div className="rounded-xl border border-slate-700/70 bg-[#162235] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Health score</p>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${healthClass(road.health_score)}`}>{road.health_score ?? 'NA'}</span>
                  </div>
                </div>
                <FlagChips flags={road.anomaly_flags} />
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {contractors.length ? (
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#94a3b8]">Flagged Contractors</h3>
          <div className="space-y-3">
            {contractors.map((contractor) => (
              <article key={contractor.contractor_id} className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-[#f8fafc]">{contractor.contractor_name}</p>
                    <p className="mt-1 text-sm text-[#cbd5e1]">{contractor.flagged_roads_count} flagged roads</p>
                  </div>
                  <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-[#0f172a]">
                    Risk {contractor.risk_score ?? 0} to {contractor.adjusted_risk_score}
                  </span>
                </div>
                <FlagChips flags={contractor.anomaly_flags} />
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function DashboardPage() {
  const [budget, setBudget] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [contractors, setContractors] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [loading, setLoading] = useState({ budget: true, heatmap: true, contractors: true, anomalies: true });
  const [errors, setErrors] = useState({});
  const [loadedAt, setLoadedAt] = useState(null);

  useEffect(() => {
    const loadCard = async (key, fn, setter) => {
      try {
        const result = await fn();
        setter(result);
      } catch {
        setErrors((current) => ({ ...current, [key]: 'Unable to load this dashboard section.' }));
      } finally {
        setLoading((current) => ({ ...current, [key]: false }));
      }
    };

    loadCard('budget', getBudgetOverview, setBudget);
    loadCard('heatmap', getComplaintHeatmap, setHeatmap);
    loadCard('contractors', getContractorScores, setContractors);
    loadCard('anomalies', getAnomalies, setAnomalies);
    setLoadedAt(new Date());
  }, []);

  const metrics = useMemo(() => {
    const totalComplaints = contractors?.contractors?.reduce((sum, contractor) => sum + (contractor.complaint_count || 0), 0) || 0;
    const flaggedRoads = anomalies?.roads?.length || 0;
    const watchlist = contractors?.contractors?.filter((contractor) => ['Watchlist', 'High Risk'].includes(contractor.performance_band)).length || 0;
    const budgetRows = budget?.by_contractor || [];
    const totalSanctioned = budgetRows.reduce((sum, row) => sum + Number(row.sanctioned_amount || 0), 0);
    return { totalComplaints, flaggedRoads, watchlist, totalSanctioned };
  }, [anomalies, budget, contractors]);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#0f172a] px-4 py-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-7 rounded-xl border border-slate-700/70 bg-[#162235] p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#38bdf8]">Civic intelligence console</p>
              <h1 className="text-3xl font-black text-[#f8fafc] md:text-4xl">Transparency Dashboard</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#94a3b8]">
                Budget, complaints, contractor reliability, and anomaly alerts across Chennai roads.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total complaints" value={metrics.totalComplaints.toLocaleString('en-IN')} accentClass="bg-[#38bdf8] text-[#0f172a]" detail="Across contractors and road projects" />
          <MetricCard label="Flagged roads" value={metrics.flaggedRoads.toLocaleString('en-IN')} accentClass="bg-red-500 text-white" detail="Rule-based anomaly alerts" />
          <MetricCard label="Watchlist contractors" value={metrics.watchlist.toLocaleString('en-IN')} accentClass="bg-amber-400 text-[#0f172a]" detail="Watchlist or high-risk bands" />
          <MetricCard label="Last updated" value={loadedAt ? loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'} accentClass="bg-green-500 text-white" detail={`Tracked budget ${formatINR(metrics.totalSanctioned)}`} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <BudgetOverview data={budget} loading={loading.budget} error={errors.budget} />
          <DefectHeatmap data={heatmap} loading={loading.heatmap} error={errors.heatmap} />
          <ContractorScorecard data={contractors} loading={loading.contractors} error={errors.contractors} />
          <AnomalyAlerts data={anomalies} loading={loading.anomalies} error={errors.anomalies} />
        </div>
      </section>
    </main>
  );
}

export default DashboardPage;
