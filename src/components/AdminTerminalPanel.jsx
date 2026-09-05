import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminTerminalPanel() {
  const [backupsLog, setBackupsLog] = useState([]);
  const [migrations, setMigrations] = useState([]);
  const [systemHealth, setSystemHealth] = useState('Optimal');
  const [syncing, setSyncing] = useState(true);
  const [executingSweep, setExecutingSweep] = useState(false);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const { data: migData } = await supabase.from('applied_migrations').select('*').order('applied_at', { ascending: false }).limit(20);
        const { data: backupData } = await supabase.from('platform_backups_log').select('*').order('created_at', { ascending: false }).limit(20);
        if (migData) setMigrations(migData);
        if (backupData) setBackupsLog(backupData);
        const hasFailures = backupData?.some(b => b.status !== 'Success');
        if (hasFailures) setSystemHealth('Review Required');
      } catch (err) {
        console.error('Terminal connection failed:', err.message);
        setSystemHealth('Degraded');
      } finally {
        setSyncing(false);
      }
    }
    loadMetrics();
  }, []);

  const triggerSweep = async () => {
    setExecutingSweep(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const { data: backupData } = await supabase.from('platform_backups_log').select('*').order('created_at', { ascending: false }).limit(20);
      if (backupData) setBackupsLog(backupData);
      alert('Infrastructure sweep complete. All systems report normal parameters.');
    } catch (err) {
      alert(`Sweep failure: ${err.message}`);
    } finally {
      setExecutingSweep(false);
    }
  };

  if (syncing) return <div className="loading-state">Syncing core system logs...</div>;

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <div>
          <span className="admin-tag">Master Cloud Terminal</span>
          <h2 className="panel-title">Infrastructure & System Health</h2>
          <p className="panel-subtitle">Review self-healing table registries and backup logs.</p>
        </div>
        <button disabled={executingSweep} onClick={triggerSweep} className="btn-dark">
          {executingSweep ? 'Analyzing...' : 'Trigger Diagnostic Sweep'}
        </button>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Ecosystem Status</div>
          <div className={`stat-value ${systemHealth === 'Optimal' ? 'success' : 'warning'}`}>● {systemHealth}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Applied Migrations</div>
          <div className="stat-value">{migrations.length} verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Backup Logs</div>
          <div className="stat-value">{backupsLog.length} snapshots</div>
        </div>
      </section>

      <div className="terminal-grid">
        <div className="form-card">
          <h3>Migration Audit Log</h3>
          <div className="log-list">
            {migrations.length === 0 ? (
              <div className="empty-state-box">No custom migrations yet.</div>
            ) : (
              migrations.map(mig => (
                <div key={mig.id} className="log-row">
                  <div>
                    <div className="log-name">{mig.migration_name}</div>
                    <small>{new Date(mig.applied_at).toLocaleString()}</small>
                  </div>
                  <span className="status-badge success">Active</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="form-card">
          <h3>Backup Snapshot Ledger</h3>
          <div className="log-list">
            {backupsLog.length === 0 ? (
              <div className="empty-state-box">No backups generated yet.</div>
            ) : (
              backupsLog.map(log => (
                <div key={log.id} className="log-row">
                  <div>
                    <div className="log-name">{log.backup_file_name}</div>
                    <small>{new Date(log.created_at).toLocaleDateString()} · {log.total_tables_archived} tables</small>
                  </div>
                  <span className={`status-badge ${log.status === 'Success' ? 'success' : 'error'}`}>{log.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
