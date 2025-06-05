// electron/devUtils.ts
import net from 'node:net';
import { VITE_DEV_SERVER_URL } from './config';

export async function waitForVite() {
  if (!VITE_DEV_SERVER_URL) {
    console.warn('waitForVite called but VITE_DEV_SERVER_URL is not set.');
    return true;
  }
  const viteUrl = new URL(VITE_DEV_SERVER_URL);
  const vitePort = parseInt(viteUrl.port, 10);
  const viteHostname = viteUrl.hostname;

  console.log(`waitForVite: Attempting to connect to Vite on ${viteHostname}:${vitePort}...`);
  await new Promise((resolve) => setTimeout(resolve, 500)); // Initial delay

  return new Promise<boolean>((resolve) => {
    let attempts = 0;
    const maxAttempts = 30;

    const tryConnect = () => {
      attempts++;
      const client = new net.Socket();
      client.connect(vitePort, viteHostname, () => {
        console.log(`waitForVite: Successfully connected to Vite on port ${vitePort} (attempt ${attempts}).`);
        client.end();
        resolve(true);
      });

      client.on('error', (err: Error) => {
        client.destroy();
        if (attempts >= maxAttempts) {
          console.error(`waitForVite: Max attempts reached. Could not connect to Vite. Error: ${err.message}`);
          resolve(false);
        } else {
          setTimeout(tryConnect, 1000); // Retry after 1 second
        }
      });
    };
    tryConnect();
  });
}
