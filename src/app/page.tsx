'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { db, type LocalLog } from '@/lib/dexie';
import {
  Camera, RotateCcw, Save, LogOut, CheckCircle, AlertCircle,
  Package2, Shield, FlipHorizontal, CloudUpload,
  Loader2, X, ChevronDown, Eye, EyeOff, Store
} from "lucide-react";

const STORES = [
  "SS Rajkot Nana Mava ES2",
  "SS Rajkot KKV Chowk ES4",
  "SS Rajkot Atika South ES6",
];

const CRATE_TYPES = ["PERM", "COLD"] as const;
type CrateType = typeof CRATE_TYPES[number];

const CRATE_TYPE_COLORS: Record<CrateType, string> = {
  PERM: "#F8CC00",
  COLD: "#3B82F6",
};

export default function App() {
  const [session, setSession] = useState<{ username: string; role: string; storeName: string } | null>(null);

  // Auth Form
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedStore, setSelectedStore] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Camera & Capture states
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState("");

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);

  // Crate validation states
  const [cratePrefix, setCratePrefix] = useState('');
  const [crateType, setCrateType] = useState<CrateType>('PERM');
  const [crateSuffix, setCrateSuffix] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync Queue states
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const saved = localStorage.getItem('rc_session');
    if (saved) setSession(JSON.parse(saved));
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updatePendingCount = async () => {
    try {
      const count = await db.localLogs.where('syncStatus').equals('PENDING').count();
      setPendingSyncCount(count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (session) {
      updatePendingCount();
      // Listen for online events
      window.addEventListener('online', triggerSyncQueue);
      return () => {
        stopCamera();
        window.removeEventListener('online', triggerSyncQueue);
      };
    }
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const isAdmin = usernameInput.trim().toLowerCase() === "admin";
    if (!selectedStore && !isAdmin) {
      setAuthError("Please select your store before logging in.");
      return;
    }
    setAuthError('');
    setAuthLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim(), password: passwordInput }),
      });

      if (!res.ok) {
        const data = await res.json();
        setAuthError(data.message || 'Login failed.');
        setAuthLoading(false);
        return;
      }

      const data = await res.json();
      if (data.user.role === 'ADMIN') {
        window.location.href = '/admin';
        return;
      }

      const userSession = {
        username: data.user.username,
        role: data.user.role,
        storeName: selectedStore,
      };

      localStorage.setItem('rc_session', JSON.stringify(userSession));
      setSession(userSession);
    } catch (err) {
      setAuthError('Connection failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    stopCamera();
    localStorage.removeItem('rc_session');
    setSession(null);
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (mode?: "environment" | "user") => {
    const m = mode ?? facingMode;
    setCameraError("");
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: m }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err: any) {
      setCameraError('Camera access denied or no camera found.');
    }
  }, [facingMode]);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => setCameraError("Video preview failed."));
    }
  }, [cameraActive]);

  const flipCamera = async () => {
    const m = facingMode === "environment" ? "user" : "environment";
    setFacingMode(m);
    await startCamera(m);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setCameraError("Video not ready."); return; }

    const now = new Date();
    const fullCrateName = `${cratePrefix}_${crateType}_${crateSuffix}`;

    let w = video.videoWidth, h = video.videoHeight;
    if (w > 800 || h > 600) {
      const r = Math.min(800 / w, 600 / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    // Overlay Watermark
    const bannerH = Math.max(72, Math.round(h * 0.16));
    const pad = 10;
    ctx.fillStyle = "rgba(0,0,0,0.84)";
    ctx.fillRect(0, h - bannerH, w, bannerH);
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.fillRect(0, h - bannerH, w, 3);
    const fs1 = Math.max(14, Math.round(w * 0.026));
    const fs2 = Math.max(11, Math.round(w * 0.019));
    const lineH = Math.round(bannerH / 3.2);

    ctx.font = `bold ${fs1}px 'Courier New', monospace`;
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.textAlign = "left";
    ctx.fillText(fullCrateName, pad, h - bannerH + lineH);

    ctx.fillStyle = crateType === "COLD" ? "#3B82F6" : "#1a1a1a";
    ctx.fillRect(w - fs1 * 3.2 - pad, h - bannerH + 6, fs1 * 3.2, fs1 + 8);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${fs2}px 'Courier New', monospace`;
    ctx.textAlign = "right";
    ctx.fillText(`[${crateType}]`, w - pad, h - bannerH + lineH + 2);

    ctx.font = `${fs2}px 'Courier New', monospace`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    const ds = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const ts = now.toLocaleTimeString("en-IN", { hour12: false });
    ctx.fillText(`${ds}  ${ts}`, pad, h - bannerH + lineH * 2.1);

    ctx.fillStyle = "#999";
    ctx.fillText(session!.storeName, pad, h - bannerH + lineH * 3.1);
    ctx.fillStyle = CRATE_TYPE_COLORS[crateType];
    ctx.font = `bold ${fs2}px 'Courier New', monospace`;
    ctx.textAlign = "right";
    ctx.fillText(`@${session!.username}`, w - pad, h - bannerH + lineH * 3.1);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setCapturedPhoto(dataUrl);
    setCapturedAt(now);
    stopCamera();
    setSubmitError("");
  };

  const retake = async () => {
    setCapturedPhoto(null);
    setCapturedAt(null);
    setSubmitError("");
    await startCamera();
  };

  const validateCrateInput = () => {
    if (!/^\d+$/.test(cratePrefix)) { setSubmitError('Crate prefix requires numeric digits.'); return false; }
    if (!/^\d+$/.test(crateSuffix)) { setSubmitError('Crate suffix requires numeric digits.'); return false; }
    return true;
  };

  const triggerSyncQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const pendingItems = await db.localLogs.where('syncStatus').equals('PENDING').toArray();
      if (pendingItems.length === 0) return;

      for (const item of pendingItems) {
        const base64Image = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(item.imageBlob);
          reader.onloadend = () => resolve(reader.result as string);
        });

        const res = await fetch('/api/crate-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cratePrefix: item.cratePrefix,
            crateType: item.crateType,
            crateSuffix: item.crateSuffix,
            capturedAt: item.capturedAt.toISOString(),
            imageBuffer: base64Image,
          }),
        });

        if (res.ok) {
          await db.localLogs.update(item.id!, { syncStatus: 'SYNCED' });
        } else {
          await db.localLogs.update(item.id!, { syncStatus: 'FAILED' });
        }
      }
      updatePendingCount();
    } catch (e) {
      console.error('Queue sync worker failed: ', e);
    }
  };

  const submitPhoto = async () => {
    if (!validateCrateInput() || !capturedPhoto) return;
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(capturedPhoto);
      const blob = await response.blob();

      const logData: LocalLog = {
        cratePrefix, crateType, crateSuffix,
        capturedAt: capturedAt || new Date(),
        imageBlob: blob,
        syncStatus: 'PENDING',
      };

      await db.localLogs.add(logData);
      await updatePendingCount();

      if (navigator.onLine) {
        const res = await fetch('/api/crate-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cratePrefix, crateType, crateSuffix,
            capturedAt: logData.capturedAt.toISOString(),
            imageBuffer: capturedPhoto,
          }),
        });
        if (res.ok) {
          await db.localLogs.where({ cratePrefix, crateSuffix }).modify({ syncStatus: 'SYNCED' });
          updatePendingCount();
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setCratePrefix('');
        setCrateSuffix('');
        setCapturedPhoto(null);
        startCamera();
      }, 2500);

    } catch (err: any) {
      setSubmitError(`Save failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Auth Login View ---
  if (!session) {
    const isAdmin = usernameInput.trim().toLowerCase() === "admin";
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 via-transparent to-green-600/5 pointer-events-none" />
        <div className="relative w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-400 rounded-3xl mb-4 shadow-lg shadow-yellow-400/25">
              <Package2 className="w-10 h-10 text-black" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">RC Logger</h1>
            <p className="text-gray-500 text-sm mt-1 font-medium">Reverse Consignment · Blinkit</p>
          </div>
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-5">Sign In</h2>
            {authError && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm leading-snug">{authError}</p>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Username</label>
                <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5" /> Your Store {!isAdmin && <span className="text-yellow-400">*</span>}
                </label>
                <div className="relative">
                  <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} required={!isAdmin}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-yellow-400/60 cursor-pointer">
                    <option value="" className="bg-[#1a1a1a] text-gray-400">Select your store...</option>
                    {STORES.map(s => <option key={s} value={s} className="bg-[#1a1a1a] text-white">{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>
              <button type="submit" disabled={authLoading || !usernameInput || !passwordInput || (!selectedStore && !isAdmin)}
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black py-3.5 rounded-xl transition-all disabled:opacity-40 mt-2">
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- Camera Intake View ---
  const canCapture = cratePrefix.trim().length > 0 && crateSuffix.trim().length > 0;
  const fullCrateName = canCapture ? `${cratePrefix}_${crateType}_${crateSuffix}` : null;
  const typeColor = CRATE_TYPE_COLORS[crateType];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
            <Package2 className="w-4 h-4 text-black" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">RC Logger</p>
            <p className="text-gray-500 text-xs leading-none mt-0.5 max-w-[150px] truncate">{session.storeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingSyncCount > 0 && (
            <span className="text-xs bg-yellow-400/15 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-semibold">
              {pendingSyncCount} saved offline
            </span>
          )}
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-white transition rounded-lg hover:bg-white/5">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-8">
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Crate Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Crate Number <span className="text-yellow-400">*</span>
            </label>
            <div className="flex items-stretch gap-2">
              <input type="tel" value={cratePrefix} onChange={e => setCratePrefix(e.target.value.replace(/\D/g, ""))} placeholder="123456" maxLength={10}
                className="w-[76px] bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60" />
              <div className="relative flex-shrink-0">
                <select value={crateType} onChange={e => setCrateType(e.target.value as CrateType)}
                  className="appearance-none h-full rounded-xl px-3 pr-7 py-3 text-sm font-black font-mono border focus:outline-none cursor-pointer"
                  style={{ backgroundColor: crateType === "PERM" ? "rgba(248,204,0,0.15)" : "rgba(59,130,246,0.15)", borderColor: `${typeColor}55`, color: typeColor }}>
                  {CRATE_TYPES.map(t => <option key={t} value={t} className="bg-[#1a1a1a]">{t}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: typeColor }} />
              </div>
              <input type="tel" value={crateSuffix} onChange={e => setCrateSuffix(e.target.value.replace(/\D/g, ""))} placeholder="16 DIGITS" maxLength={16}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400/60" />
            </div>
            {fullCrateName && (
              <div className="mt-2 flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5">
                <Shield className="w-3 h-3 flex-shrink-0" style={{ color: typeColor }} />
                <span className="text-xs font-mono text-gray-400">ID: <span className="font-bold" style={{ color: typeColor }}>{fullCrateName}</span></span>
              </div>
            )}
          </div>

          {success && (
            <div className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/25 rounded-xl p-3">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm font-medium">Photo logged and queued for cloud sync!</p>
            </div>
          )}
          {(cameraError || submitError) && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{cameraError || submitError}</p>
            </div>
          )}

          {/* Camera Box */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#111]">
            {capturedPhoto ? (
              <div>
                <div className="relative">
                  <img src={capturedPhoto} alt="Preview" className="w-full block" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <span className="bg-blue-500/80 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1"><CloudUpload className="w-3 h-3" /> Sync</span>
                  </div>
                </div>
                <div className="flex gap-2 p-3 bg-[#0f0f0f]">
                  <button onClick={retake} disabled={isSubmitting} className="flex-1 flex justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl text-sm font-semibold">
                    <RotateCcw className="w-4 h-4" /> Retake
                  </button>
                  <button onClick={submitPhoto} disabled={isSubmitting} className="flex-[2] flex justify-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black py-3 rounded-xl text-sm">
                    {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Submit Photo</>}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className={`relative bg-black ${cameraActive ? "block" : "hidden"}`}>
                  <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setCameraReady(true)} className="w-full max-h-[65vh] object-cover" />
                  {cameraReady && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-3 py-2" style={{ borderTop: `2px solid ${typeColor}55` }}>
                      <p className="font-bold text-xs font-mono" style={{ color: typeColor }}>{fullCrateName || "ENTER CRATE NUMBER"}</p>
                    </div>
                  )}
                  <button onClick={capturePhoto} disabled={!canCapture || !cameraReady}
                    className="absolute left-1/2 -translate-x-1/2 bottom-[4rem] w-16 h-16 rounded-full flex items-center justify-center border-[3px] border-black disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: typeColor }}><Camera className="w-7 h-7 text-black" />
                  </button>
                  <button onClick={flipCamera} className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white p-2 rounded-xl">
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                </div>
                {!cameraActive && (
                  <div className="flex flex-col items-center py-14 px-4 text-center">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                      <Camera className="w-9 h-9 text-gray-600" />
                    </div>
                    <p className="text-gray-400 text-sm mb-5">{canCapture ? "Ready to capture" : "Enter crate number to enable camera"}</p>
                    <button onClick={() => startCamera()} disabled={!canCapture}
                      className="text-black font-black px-8 py-3.5 rounded-xl disabled:opacity-30 transition"
                      style={{ backgroundColor: canCapture ? typeColor : "#555" }}>
                      Open Camera
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
