import { Client } from '@microsoft/microsoft-graph-client';
import { prisma } from './db';

export async function getFreshOneDriveClient() {
  const config = await prisma.oneDriveConfig.findUnique({
    where: { id: 'singleton_config' },
  });

  if (!config) {
    throw new Error('OneDrive API configuration is missing. Link Azure account first.');
  }

  // Token refresh threshold (refresh 5 minutes before expiration to prevent intermediate failures)
  const isExpired = new Date(Date.now() + 5 * 60 * 1000) >= config.expiresAt;

  if (isExpired) {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      scope: 'files.readwrite.all offline_access',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Refresh token failed:', errText);
      throw new Error('Unable to refresh Microsoft Graph authentication tokens.');
    }

    const data = await response.json();

    const updatedConfig = await prisma.oneDriveConfig.update({
      where: { id: 'singleton_config' },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || config.refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });

    return Client.init({
      authProvider: (done) => done(null, updatedConfig.accessToken),
    });
  }

  return Client.init({
    authProvider: (done) => done(null, config.accessToken),
  });
}
