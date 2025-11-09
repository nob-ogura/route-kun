import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RouteKun Optimizer',
  description: '住所リストから最短ルートを算出し、Mapbox で可視化します'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="routekun-body">{children}</body>
    </html>
  );
}
