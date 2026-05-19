'use client';

import React, { useState, useEffect } from 'react';
import { Download, LogOut, Filter, X, ChevronDown, Camera, AlertCircle, Loader2, CloudUpload } from "lucide-react";

interface Store { id: string; name: string; }
interface Log {
  id: string; user: { username: string }; store: { name: string };
  crateType: string; fullCrateCode: string; oneDrivePath: string | null;
  syncStatus: string; capturedAt: string;
}

export default function AdminDashboard() {
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [previewLogMeta, setPreviewLogMeta] = useState<Log | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rc_session');
    if (!saved) { window.location.href = '/'; return; }
    fetchStores(); fetchLogs();
  }, [selectedStore, dateRange]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/logs?type=stores');
      if (res.ok) setStores((await res.json()).stores);
    } catch (e) { console.error(e); }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?storeId=${selectedStore}&dateRange=${dateRange}`);
      if (res.ok) setLogs((await res.json()).logs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleExportZip = async () => {
    setIsExporting(true);
    try { window.location.href = `/api/admin/export?storeId=${selectedStore}&dateRange=${dateRange}`; }
    catch (e) { alert('ZIP Generation failed.'); }
    finally { setTimeout(() => setIsExporting(false), 3000); }
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
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleLinkOneDrive = () => window.location.href = '/api/auth/onedrive/connect';
  const handleLogout = () => { localStorage.removeItem('rc_session'); window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="bg-[#111] border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">RC LOGGER ADMIN</h1>
          <p className="text-gray-500 text-xs mt-0.5">Control Dashboard & Archive Management</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleLinkOneDrive} className="flex items-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 px-4 py-2 rounded-xl transition text-sm font-semibold">
            <CloudUpload className="w-4 h-4" /> Authorize OneDrive
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 text-gray-500 hover:text-white transition rounded-xl hover:bg-white/5 px-4 py-2 text-sm">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filters */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold text-sm flex items-center gap-2"><Filter className="w-4 h-4 text-yellow-400" /> Filter Logs</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
                <option value="" className="bg-[#1a1a1a]">All Active Stores</option>
                {stores.map(s => <option key={s.id} value={s.id} className="bg-[#1a1a1a]">{s.name}</option>)}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={dateRange} onChange={e => setDateRange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/40">
                <option value="7" className="bg-[#1a1a1a]">Last 7 Days</option>
                <option value="15" className="bg-[#1a1a1a]">Last 15 Days</option>
                <option value="30" className="bg-[#1a1a1a]">Last 30 Days</option>
                <option value="90" className="bg-[#1a1a1a]">Last 90 Days</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
            <button onClick={handleExportZip} disabled={logs.length === 0 || isExporting}
              className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold py-3 rounded-xl text-sm transition disabled:opacity-40">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? "Packing ZIP..." : "Export Filtered ZIP"}
            </button>
          </div>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between">
          <p className="text-gray-500 text-sm">Found <span className="text-white font-bold">{logs.length}</span> logs</p>
        </div>

        {/* Grid */}
        {loading && logs.length === 0 ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-yellow-400 animate-spin" /></div>
        ) : logs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {logs.map(log => (
              <button key={log.id} onClick={() => triggerPreview(log)} disabled={!log.oneDrivePath}
                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400/30 rounded-2xl overflow-hidden transition text-left disabled:opacity-70 disabled:hover:border-white/10">
                <div className="aspect-video bg-black flex items-center justify-center border-b border-white/5">
                  <Camera className="w-8 h-8 text-gray-700" />
                </div>
                <div className="p-4">
                  <p className="text-yellow-400 text-sm font-mono font-bold truncate">{log.fullCrateCode}</p>
                  <p className="text-gray-500 text-xs mt-1 truncate">{log.store.name}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-gray-600 text-xs">{new Date(log.capturedAt).toLocaleString()}</span>
                    <span className="text-blue-400 text-xs font-bold bg-blue-500/10 px-2 py-1 rounded">{log.crateType}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
            <AlertCircle className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 font-semibold">No consignment logs found</p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {activePreview && previewLogMeta && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#111]">
            <div>
              <p className="text-yellow-400 font-bold text-lg font-mono">{previewLogMeta.fullCrateCode}</p>
              <p className="text-gray-500 text-sm mt-0.5">{previewLogMeta.store.name}</p>
            </div>
            <button onClick={() => setActivePreview(null)} className="text-gray-400 hover:text-white p-3 rounded-xl hover:bg-white/5 transition">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            <img src={activePreview} alt={previewLogMeta.fullCrateCode} className="max-w-full max-h-full rounded-xl shadow-2xl" />
          </div>
          <div className="px-6 py-4 border-t border-white/10 bg-[#111] grid grid-cols-3 gap-4 text-center text-sm">
            <div><p className="text-gray-600 mb-1">Captured</p><p className="text-white font-medium">{new Date(previewLogMeta.capturedAt).toLocaleString()}</p></div>
            <div><p className="text-gray-600 mb-1">Status</p><p className="text-blue-400 font-bold">{previewLogMeta.syncStatus}</p></div>
            <div><p className="text-gray-600 mb-1">Operator</p><p className="text-yellow-400 font-bold">@{previewLogMeta.user.username}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
