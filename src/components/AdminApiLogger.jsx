import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminApiLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ totalCalls: 0, errorRate: 0, avgLag: 0 });

  useEffect(() => {
    async function loadApiLogs() {
      try {
        const { data, error } = await supabase.from('external_api_logs').select('*').order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        setLogs(data || []);
        if (data && data.length > 0) {
          const failures = data.filter(l => l.http_status_code !== 200).length;
          const totalLag = data.reduce((sum, l) => sum + (l.sync_lag_ms || 0), 0);
          setMetrics({
            totalCalls: data.length,
            errorRate: ((failures / data.length) * 100).toFixed(1),
            avgLag: Math.round(totalLag / data.length)
          });
        }
      } catch (err) {
        console.error('API Logger error:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadApiLogs();
    const channel = supabase.channel('live-api-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'external_api_logs' }, (payload) => {
        setLogs(prev => [payload.new, ...prev]);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (loading) return <div className="loading-state">Connecting to API streaming relays...</div>;

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">API Telemetry Node</span>
        <h2 className="panel-title">External Channel Integration Logs</h2>
        <p className="panel-subtitle">Audit webhook executions and sync latencies.</p>
      </div>
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Webhook Syncs</div>
          <div className="stat-value">{metrics.totalCalls} calls</div>
        </div>
        <div className="stat-card error-card">
          <div className="stat-label error">Sync Failure Rate</div>
          <div className="stat-value error">{metrics.errorRate}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Sync Latency</div>
          <div className="stat-value">{metrics.avgLag} <span className="unit">ms</span></div>
        </div>
      </section>
      <div className="data-table-wrapper">
        <h3>Real-Time Payload Audit Log</h3>
        {logs.length === 0 ? (
          <div className="empty-state-box">No webhook logs recorded yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Channel</th>
                <th>Summary</th>
                <th>Lag</th>
                <th>HTTP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td><strong>{log.endpoint_path}</strong><div className="row-meta">{new Date(log.created_at).toLocaleString()}</div></td>
                  <td><span className="channel-tag">{log.channel_source}</span></td>
                  <td className="truncate">{log.payload_summary}</td>
                  <td>{log.sync_lag_ms}ms</td>
                  <td><span className={`status-badge ${log.http_status_code === 200 ? 'success' : 'error'}`}>{log.http_status_code}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
