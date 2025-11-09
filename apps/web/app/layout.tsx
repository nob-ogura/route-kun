import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="routekun-body">{children}</body>
    </html>
  );
}
