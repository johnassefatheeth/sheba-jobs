import './globals.css'
import type { Metadata } from 'next'
import { getSiteUrl } from '../lib/jobSeo'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Sheba Jobs Ethiopia',
    template: '%s | Sheba Jobs Ethiopia',
  },
  description: 'Fresh jobs in Ethiopia from Ethiojobs, HaHu Jobs, Afriwork, EffoySira, and Telegram — sorted by posting date.',
  keywords: [
    'Ethiopia jobs',
    'Addis Ababa jobs',
    'Ethiojobs',
    'HaHu Jobs',
    'Afriwork',
    'remote jobs Ethiopia',
    'internship Ethiopia',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Sheba Jobs Ethiopia',
    description: 'Fresh jobs in Ethiopia from leading boards and Telegram channels.',
    url: siteUrl,
    siteName: 'Sheba Jobs Ethiopia',
    locale: 'en_ET',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sheba Jobs Ethiopia',
    description: 'Fresh jobs in Ethiopia from leading boards and Telegram channels.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
