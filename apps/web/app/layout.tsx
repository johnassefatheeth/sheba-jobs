import './globals.css'

export const metadata = {
  title: 'Sheba Job',
  description: 'Jobs aggregator for Ethiopia'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <h1>Sheba Job</h1>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  )
}
