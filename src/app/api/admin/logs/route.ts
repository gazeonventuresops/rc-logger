import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFreshOneDriveClient } from '@/lib/onedrive';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // 1. Fetch Stores List for Dropdown filter
    if (type === 'stores') {
      const stores = await prisma.store.findMany({
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ stores });
    }

    // 2. Fetch secure proxy preview for the lightbox
    if (type === 'preview') {
      const path = searchParams.get('path');
      if (!path) return NextResponse.json({ message: 'Path required.' }, { status: 400 });

      try {
        const graphClient = await getFreshOneDriveClient();
        
        // Fetch raw stream directly from Microsoft Graph API
        const itemStream = await graphClient
          .api(`/me/drive/root:${path}:/content`)
          .get();

        const buffer = await streamToBuffer(itemStream);
        const base64 = buffer.toString('base64');

        return NextResponse.json({ url: `data:image/jpeg;base64,${base64}` });
      } catch (err: any) {
        console.error('Failed fetching OneDrive file: ', err);
        return NextResponse.json({ message: 'Could not fetch file preview: ' + err.message }, { status: 500 });
      }
    }

    // 3. Regular paginated/filtered list of logs
    const storeId = searchParams.get('storeId') || undefined;
    const dateRange = parseInt(searchParams.get('dateRange') || '7', 10);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dateRange);

    const logs = await prisma.crateLog.findMany({
      where: {
        storeId: storeId || undefined,
        capturedAt: { gte: cutoffDate },
      },
      include: {
        user: { select: { username: true } },
        store: { select: { name: true } },
      },
      orderBy: { capturedAt: 'desc' },
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Logs fetch route error: ', error);
    return NextResponse.json({ message: 'Internal server error.', details: error.message }, { status: 500 });
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
