"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions/curator";
import type { Curator } from "@/lib/db/schema";

const links = [
  { href: "/", label: "Overview" },
  { href: "/playlists", label: "Playlists" },
  { href: "/videos", label: "Videos" },
  { href: "/lessons", label: "Lessons" },
  { href: "/review", label: "Review" },
  { href: "/export", label: "Export" },
];

export function Shell({ curator, children }: { curator: Curator; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <aside className="rail">
        <div>
          <p className="mark">Good Dog</p>
          <h1>Video Curator</h1>
        </div>
        <nav>
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="rail-foot">
          <p>{curator.displayName}</p>
          <form action={signOutAction}>
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <form className="search" action="/search">
            <input name="q" placeholder="Search videos, lessons, techniques" aria-label="Search" />
            <button type="submit">Search</button>
          </form>
          <Link className="button secondary" href="/videos/new">
            Add video
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
