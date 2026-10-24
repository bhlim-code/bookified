import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { IBM_Plex_Serif, Mona_Sans } from 'next/font/google';

import '@/app/globals.css';
import Navbar from '@/components/Navbar';

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
    <ClerkProvider>
      <html
        lang='en'
        className={`${ibmPlexSerif.variable} ${monaSans.variable} font-sans antialiased`}
      >
        <body className='relative'>
          <Navbar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
