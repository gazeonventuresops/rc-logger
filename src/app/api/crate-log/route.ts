import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFreshOneDriveClient } from '@/lib/onedrive';

export async function POST(request: Request) {
  try {
    const { cratePrefix, crateType, crateSuffix, capturedAt, imageBuffer, username } = await request.json();

    // 1. Resolve User and Store context from PostgreSQL
    const resolvedUsername = username || 'operator';
    const user = await prisma.user.findUnique({
      where: { username: resolvedUsername },
      include: { store: true },
    });

    if (!user || !user.store) {
      return NextResponse.json({ message: 'Store worker context resolved as invalid.' }, { status: 400 });
    }

    const storeName = user.store.name;
    const cleanStoreName = storeName.replace(/[^a-zA-Z0-9-_ ]/g, ''); // Sanitize store path
    const formattedCrate = `${cratePrefix})_${crateType}_(${crateSuffix}`;

    const dateObj = new Date(capturedAt || Date.now());
    const YYYY_MM_DD = dateObj.toISOString().split('T')[0];
    const timestampStr = dateObj.toISOString().replace(/[:.]/g, '-');
    const filename = `${cratePrefix}_${crateType}_${crateSuffix}-${timestampStr}.jpg`;

    const targetOneDrivePath = `/RC_Logger/${cleanStoreName}/${YYYY_MM_DD}/${filename}`;

    // 2. Parse Base64 to byte buffer
    const base64Data = imageBuffer.replace(/^data:image\/\w+;base64,/, '');
    const fileBuffer = Buffer.from(base64Data, 'base64');

    // 3. Initiate Database Log prior to remote API uploads to ensure local state tracking
    const newLog = await prisma.crateLog.create({
      data: {
        userId: user.id,
        storeId: user.store.id,
        crateType: crateType as 'PERM' | 'COLD',
        cratePrefix,
        crateSuffix,
        fullCrateCode: formattedCrate,
        oneDrivePath: targetOneDrivePath,
        syncStatus: 'PENDING',
        capturedAt: dateObj,
      },
    });

    // 4. Graph API execution
    try {
      const graphClient = await getFreshOneDriveClient();

      // Put request uploads buffer directly to target path
      await graphClient
        .api(`/me/drive/root:${targetOneDrivePath}:/content`)
        .put(fileBuffer);

      // Successful sync update
      const updatedLog = await prisma.crateLog.update({
        where: { id: newLog.id },
        data: {
          syncStatus: 'SYNCED',
          syncedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        logId: updatedLog.id,
        syncStatus: 'SYNCED',
        oneDrivePath: targetOneDrivePath,
      }, { status: 201 });

    } catch (graphError: any) {
      console.error('OneDrive API Sync skipped/failed: ', graphError.message);
      
      // Update local state with FAILED and error details
      const failedLog = await prisma.crateLog.update({
        where: { id: newLog.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: graphError.message || 'Graph upload failed.',
        },
      });

      return NextResponse.json({
        success: false,
        logId: failedLog.id,
        syncStatus: 'FAILED',
        message: 'Saved to DB. OneDrive synchronization postponed: ' + (graphError.message || ''),
      }, { status: 202 }); // 202 accepted locally but sync deferred
    }

  } catch (error: any) {
    console.error('Core sync route error: ', error);
    return NextResponse.json({ message: 'Internal server error.', details: error.message }, { status: 500 });
  }
}
