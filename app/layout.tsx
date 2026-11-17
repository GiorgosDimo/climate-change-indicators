import type { Metadata } from 'next';
import Script from 'next/script';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';

export const metadata: Metadata = { title: 'Climate Change Indicators' };

const CESIUM_VERSION = '1.122';
const CESIUM_CDN = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={`${CESIUM_CDN}/Widgets/widgets.css`} />
      </head>
      <body style={{ margin: 0, padding: 0, overflow: 'hidden', background: '#000' }}>
        <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
        {/* Cesium loaded from CDN to avoid webpack asset-copy complexity */}
        <Script src={`${CESIUM_CDN}/Cesium.js`} strategy="beforeInteractive" />
      </body>
    </html>
  );
}
