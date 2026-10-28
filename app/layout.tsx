import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import type { Metadata } from 'next';
import { IBM_Plex_Serif, Mona_Sans } from 'next/font/google';

import '@/app/globals.css';
import Navbar from '@/components/Navbar';
import { Toaster } from '@/components/ui/sonner';

const ibmPlexSerif = IBM_Plex_Serif({
  variable: '--font-ibm-plex-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const monaSans = Mona_Sans({
  variable: '--font-mona-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bookified',
  description:
    'Transform your books into interactive AI conversation. Upload PDFs, and chat with your books using voice.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <ClerkProvider ui={ui}>
      <html
        lang='en'
        className={`${ibmPlexSerif.variable} ${monaSans.variable} antialiased`}
      >
        <body className='relative'>
          <Navbar />
          {children}
          <Toaster theme='light' />
        </body>
      </html>
    </ClerkProvider>
  );
}
