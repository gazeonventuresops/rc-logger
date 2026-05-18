'use client';

import React, { useState, useEffect } from 'react';
import styles from '@/styles/Home.module.css';

interface Store {
  id: string;
  name: string;
}

interface Log {
  id: string;
  user: { username: string };
  store: { name: string };
  crateType: string;
  fullCrateCode: string;
  oneDrivePath: string | null;
  syncStatus: string;
  capturedAt: string;
}

export default function AdminDashboard() {
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Lightbox Preview States
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [previewLogMeta, setPreviewLogMeta] = useState<Log | null>(null);

  useEffect(() => {
    // Check local session
    const saved = localStorage.getItem('rc_session');
    if (!saved) {
      window.location.href = '/';
      return;
    }

    fetchStores();
    fetchLogs();
  }, [selectedStore, dateRange]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/logs?type=stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?storeId=${selectedStore}&dateRange=${dateRange}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    try {
      window.location.href = `/api/admin/export?storeId=${selectedStore}&dateRange=${dateRange}`;
    } catch (e) {
      alert('ZIP Generation failed.');
    } finally {
      setTimeout(() => setIsExporting(false), 3000);
    }
  };

  const triggerPreview = async (log: Log) => {
    if (!log.oneDrivePath) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/logs?type=preview&path=${encodeURIComponent(log.oneDrivePath)}`);
      if (res.ok) {
        const data = await res.json();
        setActivePreview(data.url);
        setPreviewLogMeta(log);
      } else {
        alert('Could not download preview stream.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkOneDrive = () => {
    window.location.href = '/api/auth/onedrive/connect';
  };

  const handleLogout = () => {
    localStorage.removeItem('rc_session');
    window.location.href = '/';
  };

  return (
    <div className={styles.adminContainer}>
      <div className={styles.adminHeader}>
        <div className={styles.adminTitleGroup}>
          <h1>RC LOGGER ADMIN</h1>
          <p>Control Dashboard & Consignment Archive Management</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleLinkOneDrive} 
            className={styles.previewBtn}
            style={{ borderColor: 'var(--accent-yellow)', color: 'var(--accent-yellow)' }}
          >
            Authorize OneDrive
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn} style={{ margin: 0 }}>
            Logout Panel
          </button>
        </div>
      </div>

      <div className={styles.controlRow}>
        <select 
          className={styles.filterSelect}
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
        >
          <option value="">All Active Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select 
          className={styles.filterSelect}
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="7">Last 7 Days</option>
          <option value="15">Last 15 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>

        <button 
          onClick={handleExportZip} 
          disabled={logs.length === 0 || isExporting} 
          className={styles.exportBtn}
        >
          {isExporting ? 'Packing ZIP...' : 'Export Filtered ZIP'}
        </button>
      </div>

      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading return logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No consignment logs found matching selected criteria.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Operator</th>
                <th>Store</th>
                <th>Crate Number</th>
                <th>Type</th>
                <th>Intake Date</th>
                <th>Cloud Sync</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.user.username}</td>
                  <td>{log.store.name}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{log.fullCrateCode}</td>
                  <td>
                    <span 
                      style={{ 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        background: log.crateType === 'PERM' ? 'rgba(0, 242, 254, 0.1)' : 'rgba(255, 51, 102, 0.1)',
                        color: log.crateType === 'PERM' ? 'var(--accent-cyan)' : 'var(--accent-red)'
                      }}
                    >
                      {log.crateType}
                    </span>
                  </td>
                  <td>{new Date(log.capturedAt).toLocaleString()}</td>
                  <td>
                    <span className={`${styles.syncIndicator} ${log.syncStatus === 'SYNCED' ? styles.synced : log.syncStatus === 'PENDING' ? styles.pending : styles.failed}`}>
                      {log.syncStatus}
                    </span>
                  </td>
                  <td>
                    <button 
                      disabled={!log.oneDrivePath} 
                      onClick={() => triggerPreview(log)} 
                      className={styles.previewBtn}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lightbox Photo Preview */}
      {activePreview && previewLogMeta && (
        <div className={styles.lightbox} onClick={() => setActivePreview(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => setActivePreview(null)}>✕</button>
            <img src={activePreview} alt="Crate Return" className={styles.lightboxImage} />
            <div className={styles.lightboxMeta}>
              <h3 style={{ color: 'var(--accent-cyan)' }}>{previewLogMeta.fullCrateCode}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>
                Captured by {previewLogMeta.user.username} at {previewLogMeta.store.name} on {new Date(previewLogMeta.capturedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
