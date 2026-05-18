'use client';

import React, { useRef, useState, useEffect } from 'react';
import { db, type LocalLog } from '@/lib/dexie';
import styles from '@/styles/Home.module.css';

export default function UserDashboard() {
  const [session, setSession] = useState<{ username: string; role: string; storeName: string } | null>(null);
  
  // Auth Form
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Camera & Capture states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Crate validation states
  const [cratePrefix, setCratePrefix] = useState(''); // 6 numeric digits
  const [crateType, setCrateType] = useState<'PERM' | 'COLD'>('PERM');
  const [crateSuffix, setCrateSuffix] = useState(''); // 16 numeric digits
  const [validationError, setValidationError] = useState('');
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync Queue states
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Check login on load
  useEffect(() => {
    const saved = localStorage.getItem('rc_session');
    if (saved) {
      setSession(JSON.parse(saved));
    }
  }, []);

  // Update offline sync count
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
      startCamera();
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
    setAuthError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });

      if (!res.ok) {
        const data = await res.json();
        setAuthError(data.message || 'Login failed.');
        return;
      }

      const data = await res.json();
      if (data.user.role === 'ADMIN') {
        // Simple client-side redirect for convenience if user is admin
        window.location.href = '/admin';
        return;
      }

      const userSession = {
        username: data.user.username,
        role: data.user.role,
        storeName: data.user.store.name,
      };

      localStorage.setItem('rc_session', JSON.stringify(userSession));
      setSession(userSession);
    } catch (err) {
      setAuthError('Connection failed.');
    }
  };

  const handleLogout = () => {
    stopCamera();
    localStorage.removeItem('rc_session');
    setSession(null);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setValidationError('Direct camera access failed. Please enable permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const captureSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setCapturedBlob(blob);
              setPreviewUrl(URL.createObjectURL(blob));
              stopCamera();
            }
          },
          'image/jpeg',
          0.85 // Optimum 15% quality compression
        );
      }
    }
  };

  const retakeSnapshot = () => {
    setCapturedBlob(null);
    setPreviewUrl(null);
    startCamera();
  };

  const validateCrateInput = () => {
    if (!/^\d{6}$/.test(cratePrefix)) {
      setValidationError('Crate prefix requires exactly 6 numeric digits.');
      return false;
    }
    if (!/^\d{16}$/.test(crateSuffix)) {
      setValidationError('Crate suffix requires exactly 16 numeric digits.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const triggerSyncQueue = async () => {
    if (!navigator.onLine) return;
    try {
      const pendingItems = await db.localLogs.where('syncStatus').equals('PENDING').toArray();
      if (pendingItems.length === 0) return;

      setSyncStatusMsg(`Restored connection! Syncing ${pendingItems.length} logs...`);

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
          const errData = await res.json();
          await db.localLogs.update(item.id!, { 
            syncStatus: 'FAILED',
            errorMessage: errData.message || 'Sync failed.'
          });
        }
      }

      setSyncStatusMsg('All pending queues uploaded to OneDrive successfully.');
      updatePendingCount();
      setTimeout(() => setSyncStatusMsg(''), 3000);
    } catch (e) {
      console.error('Queue sync worker failed: ', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCrateInput() || !capturedBlob) return;

    setIsSubmitting(true);
    const logData: LocalLog = {
      cratePrefix,
      crateType,
      crateSuffix,
      capturedAt: new Date(),
      imageBlob: capturedBlob,
      syncStatus: 'PENDING',
    };

    try {
      // 1. Commit transactionally to client local db
      await db.localLogs.add(logData);
      await updatePendingCount();

      // 2. Perform realtime cloud sync if network is operational
      if (navigator.onLine) {
        setSyncStatusMsg('Network detected. Syncing snapshot to Microsoft OneDrive...');
        const base64Image = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(capturedBlob);
          reader.onloadend = () => resolve(reader.result as string);
        });

        const response = await fetch('/api/crate-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cratePrefix,
            crateType,
            crateSuffix,
            capturedAt: logData.capturedAt.toISOString(),
            imageBuffer: base64Image,
          }),
        });

        if (response.ok) {
          setSyncStatusMsg('Logs captured and safely uploaded to OneDrive!');
          await db.localLogs.where({ cratePrefix, crateSuffix }).modify({ syncStatus: 'SYNCED' });
          updatePendingCount();
        } else {
          setSyncStatusMsg('Cloud upload deferred. Log stored in local sync queue.');
        }
      } else {
        setSyncStatusMsg('Local buffer complete! Sync will trigger when network is detected.');
      }

      // Reset Form State
      setTimeout(() => {
        setCratePrefix('');
        setCrateSuffix('');
        setCapturedBlob(null);
        setPreviewUrl(null);
        setSyncStatusMsg('');
        setIsSubmitting(false);
        startCamera();
      }, 2500);

    } catch (err) {
      setValidationError('Local database buffering transaction failed.');
      setIsSubmitting(false);
    }
  };

  // Auth login view
  if (!session) {
    return (
      <div className={styles.container}>
        <div style={{ marginTop: '80px', width: '100%' }}>
          <div className={styles.glassPanel}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '1.8rem', color: 'var(--accent-cyan)' }}>RC LOGGER</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                Reverse Consignment Logger System
              </p>
            </div>
            
            <form onSubmit={handleLogin}>
              <div className={styles.formGroup}>
                <label>Username</label>
                <input
                  type="text"
                  required
                  placeholder="operator_store01"
                  className={styles.inputField}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className={styles.inputField}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              {authError && <div className={styles.error}>{authError}</div>}

              <button type="submit" className={styles.button} style={{ marginTop: '12px' }}>
                Secure Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Camera intake view
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>RC LOGGER</h1>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
            <span className={styles.badge}>{session.storeName}</span>
            <button className={styles.logoutBtn} onClick={handleLogout}>Logout</button>
          </div>
        </div>
        {pendingSyncCount > 0 && (
          <span 
            className={styles.badge} 
            style={{ 
              background: 'rgba(255, 183, 0, 0.1)', 
              borderColor: 'var(--accent-yellow)', 
              color: 'var(--accent-yellow)' 
            }}
          >
            {pendingSyncCount} Pending Sync
          </span>
        )}
      </div>

      <div className={styles.cameraContainer}>
        {!previewUrl ? (
          <div className={styles.videoWrapper}>
            <video ref={videoRef} autoPlay playsInline muted className={styles.videoElement} />
            <button type="button" onClick={captureSnapshot} className={styles.captureBtn}>
              <div className={styles.captureBtnInner} />
            </button>
          </div>
        ) : (
          <div className={styles.videoWrapper}>
            <img src={previewUrl} alt="Captured preview" className={styles.previewImage} />
            <div className={styles.retakeOverlay}>
              <button type="button" onClick={retakeSnapshot} className={styles.retakeBtn}>
                Retake Snapshot
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div className={styles.formGroup}>
          <label>Crate Reference Pattern</label>
          <div className={styles.inputTemplateRow}>
            {/* Prefix Blank */}
            <input
              type="text"
              maxLength={6}
              placeholder="123456"
              required
              className={styles.prefixInput}
              value={cratePrefix}
              onChange={(e) => setCratePrefix(e.target.value.replace(/\D/g, ''))}
            />
            
            <span className={styles.patternDivider}>)_</span>

            {/* Type Switcher */}
            <select
              className={styles.typeSelector}
              value={crateType}
              onChange={(e) => setCrateType(e.target.value as 'PERM' | 'COLD')}
            >
              <option value="PERM">PERM</option>
              <option value="COLD">COLD</option>
            </select>

            <span className={styles.patternDivider}>_(</span>

            {/* Suffix Blank */}
            <input
              type="text"
              maxLength={16}
              placeholder="7890123456789012"
              required
              className={styles.suffixInput}
              value={crateSuffix}
              onChange={(e) => setCrateSuffix(e.target.value.replace(/\D/g, ''))}
            />

            <span className={styles.patternClosing}>)</span>
          </div>
        </div>

        {validationError && <p className={styles.error}>{validationError}</p>}
        {syncStatusMsg && <p className={styles.successText}>{syncStatusMsg}</p>}

        <button
          type="submit"
          className={styles.button}
          disabled={isSubmitting || !capturedBlob || !!validationError}
          style={{ marginTop: '16px' }}
        >
          {isSubmitting ? 'Processing sync...' : 'Submit Return Log'}
        </button>
      </form>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
