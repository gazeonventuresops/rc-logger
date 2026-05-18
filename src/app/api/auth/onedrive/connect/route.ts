import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const tenantId = process.env.ONEDRIVE_TENANT_ID || 'common';
  
  if (!clientId) {
    return NextResponse.json({ message: 'ONEDRIVE_CLIENT_ID env variable is not set.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  
  const redirectUri = `${protocol}://${host}/api/auth/onedrive/callback`;

  // Standard Microsoft Graph OAuth connection link
  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
    `?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_mode=query` +
    `&scope=${encodeURIComponent('files.readwrite.all offline_access')}` +
    `&state=rc_logger_auth`;

  return NextResponse.redirect(authUrl);
}
