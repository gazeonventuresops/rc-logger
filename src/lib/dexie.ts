import Dexie, { type Table } from 'dexie';

export interface LocalLog {
  id?: number;
  cratePrefix: string;
  crateType: 'PERM' | 'COLD';
  crateSuffix: string;
  capturedAt: Date;
  imageBlob: Blob;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
}

export class RCLocalDatabase extends Dexie {
  localLogs!: Table<LocalLog>;

  constructor() {
    super('RCLoggerLocalDB');
    this.version(1).stores({
      localLogs: '++id, cratePrefix, crateSuffix, crateType, syncStatus, capturedAt'
    });
  }
}

export const db = new RCLocalDatabase();
