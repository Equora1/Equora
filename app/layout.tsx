import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Equora',
  description: 'Equora für Setups, Trades, Auswertung und Feedback.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
