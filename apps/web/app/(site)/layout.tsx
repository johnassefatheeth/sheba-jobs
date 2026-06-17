export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <h1>Sheba Jobs Ethiopia</h1>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
