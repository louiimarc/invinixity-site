import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Invinixity — Digital experiences for curious humans',
  description: 'An independent experimental studio creating playful systems, interactive installations, and digital worlds in Jakarta.',
  openGraph: {
    title: 'Invinixity — Digital experiences for curious humans',
    description: 'Playful systems, interactive installations, and digital worlds from Jakarta.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Invinixity — Digital experiences for curious humans',
    description: 'Playful systems, interactive installations, and digital worlds from Jakarta.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
