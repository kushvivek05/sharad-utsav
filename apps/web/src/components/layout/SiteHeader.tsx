
export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <a
          className="site-header__brand"
          href="/"
          aria-label="Sharad Utsav home"
        >
          <span>Sharad</span> Utsav
        </a>

        <span className="site-header__location">Festival booking</span>
      </div>
    </header>
  );
}
