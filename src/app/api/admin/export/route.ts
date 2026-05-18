import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFreshOneDriveClient } from '@/lib/onedrive';
import JSZip from 'jszip';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') || undefined;
    const dateRange = parseInt(searchParams.get('dateRange') || '7', 10);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dateRange);

    // 1. Fetch matching logs
    const logs = await prisma.crateLog.findMany({
      where: {
        storeId: storeId || undefined,
        capturedAt: { gte: cutoffDate },
        syncStatus: 'SYNCED',
      },
      include: { store: true },
    });

    if (logs.length === 0) {
      return NextResponse.json({ message: 'No records found matching criteria.' }, { status: 404 });
    }

    const zip = new JSZip();
    const graphClient = await getFreshOneDriveClient();

    // 2. Load file contents from OneDrive
    for (const log of logs) {
      if (!log.oneDrivePath) continue;

      try {
        const itemStream = await graphClient
          .api(`/me/drive/root:${log.oneDrivePath}:/content`)
          .get();

        const buffer = await streamToBuffer(itemStream);

        const dateFolder = log.capturedAt.toISOString().slice(0, 10);
        // Path matches format: /StoreName/YYYY-MM-DD/Cratenumber-date-time.jpg
        const filename = log.oneDrivePath.substring(log.oneDrivePath.lastIndexOf('/') + 1);
        const zipPath = `${log.store.name}/${dateFolder}/${filename}`;

        zip.file(zipPath, buffer);
      } catch (err) {
        console.error(`Failed downloading path: ${log.oneDrivePath}`, err);
        // Continue zipping other items even if one fails
      }
    }

    // 3. Output raw node buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=RC_Logger_Export_${Date.now()}.zip`,
      },
    });

  } catch (error: any) {
    console.error('ZIP compilation route error: ', error);
    return NextResponse.json({ message: 'ZIP compilation failed.', details: error.message }, { status: 500 });
  }
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks: any[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
