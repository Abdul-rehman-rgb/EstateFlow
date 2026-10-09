"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { getMeta, type Meta } from "./meta";
import { Icon, Logo, type IconName } from "./icons";

type NavItem = { href: string; label: string; icon: IconName; show: (m: Meta) => boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", show: () => true },
      { href: "/leads", label: "Leads", icon: "leads", show: (m) => m.can.leads },
      { href: "/properties", label: "Properties", icon: "building", show: (m) => m.can.properties },
      { href: "/viewings", label: "Viewings", icon: "calendar", show: (m) => m.can.viewings },
      { href: "/tasks", label: "Tasks", icon: "check", show: (m) => m.can.tasks },
      { href: "/deals", label: "Deals & pipeline", icon: "deals", show: (m) => m.can.deals },
    ],
  },
  {
    group: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: "reports", show: (m) => m.can.reports },
      { href: "/imports", label: "Import CSV", icon: "upload", show: (m) => m.can.import },
      { href: "/audit", label: "Audit log", icon: "shield", show: (m) => m.can.audit },
    ],
  },
  {
    group: "Settings",
    items: [
      { href: "/admin", label: "Administration", icon: "settings", show: (m) => m.can.admin },
      { href: "/account", label: "My account", icon: "user", show: () => true },
    ],
  },
];

export function initials(name?: string) {
  return (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
  }, []);
  React.useEffect(() => setOpen(false), [pathname]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  };

  const visible = (n: NavItem) => (meta ? n.show(meta) : n.href === "/dashboard" || n.href === "/account");

  const sidebar = (
    <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Main navigation">
      <Link href="/dashboard" className="brand">
        <Logo size={34} />
        <div>
          <div className="brand-name">Estate<span>Flow</span></div>
          <div className="brand-sub">Real Estate CRM</div>
        </div>
      </Link>
      {NAV.map((g) => {
        const items = g.items.filter(visible);
        if (items.length === 0) return null;
        return (
          <React.Fragment key={g.group}>
            <div className="nav-group">{g.group}</div>
            <nav className="nav" aria-label={g.group}>
              {items.map((n) => {
                const active = pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                    <Icon name={n.icon} />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </React.Fragment>
        );
      })}
      <div className="sidebar-foot">
        <div className="user-chip">
          <div className="avatar" aria-hidden>{initials(meta?.me.name)}</div>
          <div className="who">
            <b>{meta?.me.name ?? "…"}</b>
            <span>{meta?.me.role_label ?? ""}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app">
      {sidebar}
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden />
      <div style={{ minWidth: 0 }}>
        <div className="topbar">
          <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Toggle menu"><Icon name="menu" size={20} /></button>
          <Link href="/dashboard" className="tb-brand"><Logo size={26} /> EstateFlow</Link>
          <Link href="/account" aria-label="My account"><div className="avatar">{initials(meta?.me.name)}</div></Link>
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
