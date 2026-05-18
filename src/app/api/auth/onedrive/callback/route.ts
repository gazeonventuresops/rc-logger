import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Microsoft Graph Auth returned error: ', error);
      return NextResponse.json({ message: 'Auth failed: ' + error }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ message: 'Authorization code is missing.' }, { status: 400 });
    }

    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
    const tenantId = process.env.ONEDRIVE_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
      return NextResponse.json({ message: 'OneDrive OAuth variables are unconfigured.' }, { status: 500 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/auth/onedrive/callback`;

    // Exchange Auth Code for permanent OAuth Access & Refresh tokens
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      scope: 'files.readwrite.all offline_access',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Token exchange request failed:', errText);
      return NextResponse.json({ message: 'Failed exchanging Microsoft tokens.' }, { status: 500 });
    }

    const data = await response.json();

    // Commit/Upsert permanent tokens inside PG singleton configuration
    await prisma.oneDriveConfig.upsert({
      where: { id: 'singleton_config' },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        clientId,
        clientSecret,
        tenantId,
      },
      create: {
        id: 'singleton_config',
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        clientId,
        clientSecret,
        tenantId,
      },
    });

    // Success redirect back to Admin dashboard
    return NextResponse.redirect(`${protocol}://${host}/admin?status=onedrive_connected`);

  } catch (error: any) {
    console.error('Callback error: ', error);
    return NextResponse.json({ message: 'Internal server error.', details: error.message }, { status: 500 });
  }
}
