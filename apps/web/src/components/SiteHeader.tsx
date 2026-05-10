import { Link } from '@tanstack/react-router';

export type SiteNavItem =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'anchor'; label: string; href: string };

export function SiteHeader({ tag, nav }: { tag?: string; nav: SiteNavItem[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[color-mix(in_oklab,var(--color-ink)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src="/pushr-icon.png"
            alt="pushr"
            width={26}
            height={26}
            className="h-6 w-6 rounded-md shadow-[0_4px_18px_-4px_var(--color-wire)] transition-transform group-hover:rotate-[-6deg]"
          />
          <span className="font-mono text-[13px] tracking-tight text-bone">pushr.sh</span>
          {tag && (
            <>
              <span className="ml-3 hidden h-4 w-px bg-white/15 md:inline-block" />
              <span className="ml-1 hidden font-mono text-[10.5px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)] md:inline">
                {tag}
              </span>
            </>
          )}
        </Link>
        <nav className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-[0.22em] text-bone/65">
          {nav.map((item) =>
            item.kind === 'route' ? (
              <Link
                key={item.label}
                to={item.to}
                className="hidden transition-colors hover:text-bone sm:inline"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className="hidden transition-colors hover:text-bone sm:inline"
              >
                {item.label}
              </a>
            )
          )}
          <a
            href="https://github.com/cpreston/pushr"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 transition hover:border-[var(--color-wire)] hover:text-bone"
          >
            <span className="h-1 w-1 rounded-full bg-[var(--color-signal)]" />
            github
          </a>
        </nav>
      </div>
    </header>
  );
}
