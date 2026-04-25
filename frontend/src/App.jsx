import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import MapComponent from './components/MapComponent';
import './App.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend, Filler
);

const API_BASE = 'http://localhost:8000';

const CHART_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0d1526', borderColor: 'rgba(99,102,241,0.3)', borderWidth: 1 } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 10 } } },
  }
};

/* ── Toast system ─────────────────────────── */
let toastIdCounter = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg) => {
    const id = ++toastIdCounter;
    setToasts(p => [...p, { id, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  return [toasts, addToast];
}

/* ── Analytics Modal ─────────────────────────── */
function AnalyticsModal({ data, onClose }) {
  if (!data) return null;
  const { simulation: sim, comparison: cmp, agent, drivers, order_types, priority_counts, tick_history } = data;

  const barData = {
    labels: ['AI Model', 'Baseline'],
    datasets: [{
      label: 'Delivery Rate %',
      data: [cmp.ai_delivery_rate, cmp.baseline_delivery_rate],
      backgroundColor: ['rgba(99,102,241,0.75)', 'rgba(100,116,139,0.5)'],
      borderColor: ['#6366f1', '#475569'],
      borderWidth: 2,
      borderRadius: 6,
    }]
  };

  const rewardData = {
    labels: agent.reward_history.map((_, i) => i + 1),
    datasets: [{
      label: 'Cumulative Reward',
      data: agent.reward_history,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.12)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
    }]
  };

  const doughnutData = {
    labels: ['Food 🍔', 'Parcel 📦', 'Medical 💊'],
    datasets: [{
      data: [order_types.food, order_types.parcel, order_types.medical],
      backgroundColor: ['rgba(245,158,11,0.8)', 'rgba(99,102,241,0.8)', 'rgba(16,185,129,0.8)'],
      borderColor: ['#0d1526', '#0d1526', '#0d1526'],
      borderWidth: 2,
    }]
  };

  const deliveredHistory = {
    labels: tick_history.map(t => t.tick),
    datasets: [
      {
        label: 'Delivered',
        data: tick_history.map(t => t.delivered),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
      },
      {
        label: 'Cancelled',
        data: tick_history.map(t => t.cancelled),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
      }
    ]
  };

  const lineOptMulti = {
    ...CHART_OPTS_BASE,
    plugins: { ...CHART_OPTS_BASE.plugins, legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } } }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title-row">
            <div className="modal-icon">📊</div>
            <div>
              <div className="modal-title">Simulation Analytics</div>
              <div className="modal-subtitle">
                {sim.total_ticks} ticks · {sim.n_drivers} drivers · RL-trained agent
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* KPI Row */}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-icon">✅</div>
              <div className="kpi-val c-delivered">{sim.delivered}</div>
              <div className="kpi-label">Delivered</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">❌</div>
              <div className="kpi-val c-cancelled">{sim.cancelled}</div>
              <div className="kpi-label">Cancelled</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">📈</div>
              <div className="kpi-val" style={{ color: '#6366f1' }}>{sim.delivery_rate}%</div>
              <div className="kpi-label">Success Rate</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">⏱️</div>
              <div className="kpi-val" style={{ color: '#06b6d4' }}>{sim.avg_delivery_ticks}</div>
              <div className="kpi-label">Avg Ticks/Delivery</div>
            </div>
          </div>

          {/* AI vs Baseline comparison banner */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem', padding:'0.75rem 1rem', background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:'var(--radius-lg)' }}>
            <span style={{ fontSize:'1.5rem' }}>🤖</span>
            <div>
              <div style={{ fontSize:'0.8rem', fontWeight:700, color:'#10b981' }}>AI outperformed baseline by {cmp.improvement_pct}%</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>AI: {cmp.ai_delivery_rate}% delivery rate vs. Nearest-Driver baseline: {cmp.baseline_delivery_rate}%</div>
            </div>
            <span className="improvement-badge" style={{ marginLeft:'auto' }}>+{cmp.improvement_pct}% ↑</span>
          </div>

          {/* Charts */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title"><span className="chart-title-dot"></span>AI vs Baseline Delivery Rate</div>
              <div style={{ height: 160 }}>
                <Bar data={barData} options={{ ...CHART_OPTS_BASE, plugins: { ...CHART_OPTS_BASE.plugins, legend: { display: false } } }} />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title"><span className="chart-title-dot" style={{ background:'#10b981' }}></span>Deliveries &amp; Cancellations over Time</div>
              <div style={{ height: 160 }}>
                <Line data={deliveredHistory} options={lineOptMulti} />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title"><span className="chart-title-dot" style={{ background:'#6366f1' }}></span>Cumulative RL Reward</div>
              <div style={{ height: 160 }}>
                {agent.reward_history.length > 0
                  ? <Line data={rewardData} options={CHART_OPTS_BASE} />
                  : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)', fontSize:'0.75rem' }}>Not enough training steps yet</div>
                }
              </div>
            </div>
            <div className="chart-card" style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
              <div className="chart-title" style={{ width:'100%' }}><span className="chart-title-dot" style={{ background:'#f59e0b' }}></span>Order Type Breakdown</div>
              <div style={{ height: 150, width: 150 }}>
                <Doughnut data={doughnutData} options={{
                  responsive:true, maintainAspectRatio:false,
                  plugins:{ legend:{ display:true, position:'right', labels:{ color:'#94a3b8', font:{ size:10 }, boxWidth:10 } }, tooltip: CHART_OPTS_BASE.plugins.tooltip }
                }} />
              </div>
            </div>
          </div>

          {/* Agent Stats */}
          <div style={{ marginBottom:'0.75rem' }}>
            <div className="section-label">🧠 RL Agent Internals</div>
            <div className="agent-stats">
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.total_reward.toFixed(1)}</div>
                <div className="agent-stat-label">Total Reward</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.train_steps}</div>
                <div className="agent-stat-label">Train Steps</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.memory_size}</div>
                <div className="agent-stat-label">Memory Buffer</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.avg_td_error}</div>
                <div className="agent-stat-label">Avg TD Error</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.epsilon}</div>
                <div className="agent-stat-label">Epsilon (ε)</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.learning_rate}</div>
                <div className="agent-stat-label">Learn Rate</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{agent.gamma}</div>
                <div className="agent-stat-label">Gamma (γ)</div>
              </div>
              <div className="agent-stat">
                <div className="agent-stat-val">{priority_counts?.urgent || 0}</div>
                <div className="agent-stat-label">Urgent Orders</div>
              </div>
            </div>
          </div>

          {/* Driver Performance */}
          <div>
            <div className="section-label">🚗 Driver Performance</div>
            <div className="chart-card" style={{ padding:'0.5rem' }}>
              <table className="driver-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Deliveries</th>
                    <th>Reward Earned</th>
                    <th>Avg per Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map(d => (
                    <tr key={d.id}>
                      <td><span className="driver-id-badge">{d.id}</span><span style={{ marginLeft:'0.5rem' }}>{d.name}</span></td>
                      <td style={{ color: '#10b981', fontWeight:700 }}>{d.deliveries}</td>
                      <td style={{ color: '#6366f1', fontFamily:'monospace' }}>{d.total_reward}</td>
                      <td style={{ color: '#94a3b8' }}>
                        {d.deliveries > 0 ? (d.total_reward / d.deliveries).toFixed(1) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Log Entry classifier ─────────────────── */
function getLogClass(log) {
  if (log.includes('🔁') || log.includes('rescheduled')) return 'log-reschedule';
  if (log.includes('🎉') || log.includes('delivered') || log.includes('✅')) return 'log-success';
  if (log.includes('❌') || log.includes('cancelled') || log.includes('stalled')) return 'log-danger';
  if (log.includes('🌦️') || log.includes('🚦') || log.includes('weather') || log.includes('Traffic')) return 'log-warning';
  if (log.includes('📬') || log.includes('🤝') || log.includes('Assignment') || log.includes('Assigned')) return 'log-info';
  return 'log-default';
}

/* ── Main App ─────────────────────────────── */
function App() {
  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState({ active: false, tick: 0, weather: 'Clear', stats: {}, chaos_log: [], reschedule_events: [] });
  const [nDrivers, setNDrivers] = useState(5);
  const [simSpeed, setSimSpeed] = useState(1);
  const [logExpanded, setLogExpanded] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toasts, addToast] = useToasts();
  const logRef = useRef(null);
  const sliderRef = useRef(null);
  const seenReschedules = useRef(new Set());

  // Update slider fill via DOM (CSS variables blocked in React inline styles)
  useEffect(() => {
    if (sliderRef.current) {
      const pct = ((nDrivers - 5) / (20 - 5)) * 100;
      sliderRef.current.style.setProperty('--pct', `${pct}%`);
    }
  }, [nDrivers]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [status.chaos_log]);

  // Toast for reschedule events
  useEffect(() => {
    if (!status.reschedule_events) return;
    status.reschedule_events.forEach(ev => {
      const key = `${ev.order_id}-${ev.tick}`;
      if (!seenReschedules.current.has(key)) {
        seenReschedules.current.add(key);
        addToast(ev.message);
      }
    });
  }, [status.reschedule_events, addToast]);

  // Poll for data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dr, or, st] = await Promise.all([
          axios.get(`${API_BASE}/drivers`),
          axios.get(`${API_BASE}/orders`),
          axios.get(`${API_BASE}/status`),
        ]);
        setDrivers(dr.data);
        setOrders(or.data);
        setStatus(st.data);
      } catch {}
    };
    fetchData();
    const id = setInterval(fetchData, 1000 / simSpeed);
    return () => clearInterval(id);
  }, [simSpeed]);

  const handleStart = async () => {
    try {
      setApiError(null);
      // n_drivers sent as query param — matches backend Query() parameter
      await axios.post(`${API_BASE}/simulation/start?n_drivers=${nDrivers}`);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Start failed';
      setApiError(`Start error: ${msg}`);
      console.error('Start failed', e);
    }
  };

  const handleStop = async () => {
    try {
      setApiError(null);
      await axios.post(`${API_BASE}/simulation/stop`);
      // Fetch analytics after a short pause
      setTimeout(async () => {
        try {
          const res = await axios.get(`${API_BASE}/analytics`);
          setAnalyticsData(res.data);
          setShowAnalytics(true);
        } catch (e) {
          console.error('Analytics fetch failed', e);
        }
      }, 600);
    } catch (e) {
      console.error('Stop failed', e);
    }
  };

  const handleReset = async () => {
    try {
      setApiError(null);
      await axios.post(`${API_BASE}/simulation/reset`);
      setAnalyticsData(null);
      setShowAnalytics(false);
      seenReschedules.current.clear();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || 'Reset failed';
      setApiError(`Reset error: ${msg}`);
      console.error('Reset failed', e);
    }
  };

  const handleSpeedChange = async (speed) => {
    setSimSpeed(speed);
    try {
      await axios.post(`${API_BASE}/simulation/speed?speed=${speed}`);
    } catch (e) {
      console.error('Speed change failed', e);
    }
  };

  // (sliderPct is now managed via sliderRef effect above)

  const weatherConfig = {
    Clear:  { icon: '☀️', cls: 'clear',  label: 'Clear Skies' },
    Rain:   { icon: '🌧️', cls: 'rain',   label: 'Rainy Conditions' },
    Stormy: { icon: '⛈️', cls: 'stormy', label: 'Storm Alert' },
  };
  const wx = weatherConfig[status.weather] || weatherConfig.Clear;

  const stats = status.stats || {};

  return (
    <div className="app-container">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">🚚</div>
            <div>
              <div className="brand-title">Last-Mile Chaos</div>
            </div>
          </div>
          <div className="brand-sub">Multi-Agent RL Delivery Simulation</div>
          <div className="header-badges">
            <span className="badge badge-rl">Q-Learning</span>
            <span className="badge badge-live"><span className="live-dot"></span>{status.active ? 'Live' : 'Idle'}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="sidebar-section">
          <div className="section-label">📦 Order Stats</div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Delivered</div>
              <div className="stat-value c-delivered">{stats.delivered || 0}</div>
              <div className="stat-sub">completed</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cancelled</div>
              <div className="stat-value c-cancelled">{stats.cancelled || 0}</div>
              <div className="stat-sub">by customer</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending</div>
              <div className="stat-value c-pending">{stats.pending || 0}</div>
              <div className="stat-sub">in queue</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active</div>
              <div className="stat-value c-active">{stats.active_drivers || 0}</div>
              <div className="stat-sub">on road</div>
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="sidebar-section">
          <div className="section-label">🌍 Environment</div>
          <div className={`weather-bar ${wx.cls}`} style={{ marginBottom:'0.75rem' }}>
            <span className="weather-icon">{wx.icon}</span>
            <div>
              <div className="weather-label">Current Weather</div>
              <div className="weather-name">{wx.label}</div>
            </div>
            <div className="weather-tick font-mono">T:{status.tick}</div>
          </div>

          {/* Driver slider */}
          <div className="section-label">🚗 Drivers</div>
          <div className="driver-control" style={{ marginBottom:'0.75rem' }}>
            <div className="driver-row">
              <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>Fleet size (min 5)</span>
              <span className="driver-count-badge">🚗 {nDrivers}</span>
            </div>
            <input
              ref={sliderRef}
              type="range"
              min={5} max={20} step={1}
              value={nDrivers}
              disabled={status.active}
              className="driver-slider"
              onChange={e => setNDrivers(Number(e.target.value))}
            />
            <div className="slider-labels"><span>5</span><span>10</span><span>15</span><span>20</span></div>
          </div>

          {/* Simulation Speed Control */}
          <div className="section-label">⚡ Simulation Speed</div>
          <div className="driver-control" style={{ marginBottom:'0.75rem' }}>
            <div className="speed-buttons" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
              {[1, 2, 5, 10].map(speed => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`btn ${simSpeed === speed ? 'btn-active-speed' : 'btn-ghost'}`}
                  style={{
                    flex: 1, padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer',
                    background: simSpeed === speed ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                    color: simSpeed === speed ? '#818cf8' : 'var(--text-muted)',
                    border: `1px solid ${simSpeed === speed ? '#6366f1' : 'transparent'}`,
                    borderRadius: 'var(--radius)'
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="btn-row">
            {!status.active ? (
              <button className="btn btn-start" onClick={handleStart}>
                ▶ Start
              </button>
            ) : (
              <button className="btn btn-stop" onClick={handleStop}>
                ■ Stop
              </button>
            )}
            <button className="btn btn-reset" onClick={handleReset}>↺ Reset</button>
          </div>

          {apiError && (
            <div style={{ marginTop:'0.5rem', padding:'0.5rem 0.65rem', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'var(--radius)', fontSize:'0.7rem', color:'#ef4444', lineHeight:1.4 }}>
              ⚠️ {apiError}
            </div>
          )}

          {analyticsData && !showAnalytics && (
            <button
              className="btn btn-reset"
              style={{ width:'100%', marginTop:'0.5rem', color:'#6366f1', borderColor:'rgba(99,102,241,0.4)' }}
              onClick={() => setShowAnalytics(true)}
            >
              📊 View Last Analysis
            </button>
          )}
        </div>

        {/* Log */}
        <div className="sidebar-section" style={{ flex:1, display:'flex', flexDirection:'column', paddingBottom:'0.75rem' }}>
          <div className="log-header">
            <div className="section-label" style={{ marginBottom:0 }}>📋 Chaos Log</div>
            <div className="log-actions">
              <button className="btn btn-ghost" onClick={() => setLogExpanded(p => !p)}>
                {logExpanded ? '↙ Collapse' : '↗ Expand'}
              </button>
            </div>
          </div>
          <div className={`chaos-log-wrapper ${logExpanded ? 'expanded' : 'collapsed'}`}>
            <div className="chaos-log-container" ref={logRef}>
              {status.chaos_log?.length > 0
                ? status.chaos_log.map((log, i) => (
                    <div key={i} className={`log-entry ${getLogClass(log)}`}>
                      <span className="log-index font-mono">[{String(i).padStart(2, '0')}]</span>
                      {log}
                    </div>
                  ))
                : <div style={{ opacity:0.4, fontSize:'0.75rem', padding:'0.5rem', fontStyle:'italic' }}>No events yet…</div>
              }
            </div>
          </div>
        </div>
      </aside>

      {/* ── Map ── */}
      <main className="map-container">
        <MapComponent drivers={drivers} orders={orders} trafficJams={status.traffic_jams} weatherZones={status.weather_zones} weather={status.weather} />
      </main>

      {/* ── Analytics Modal ── */}
      {showAnalytics && analyticsData && (
        <AnalyticsModal data={analyticsData} onClose={() => setShowAnalytics(false)} />
      )}

      {/* ── Toast Container ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <div className="toast-title">🔁 Driver Rescheduled</div>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
