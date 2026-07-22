import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "../../lib/auth";

const navigation: Array<{ id: string; label: string; href: string; glyph: string; adminOnly?: boolean }> = [
  { id: "inicio", label: "Visão geral", href: "/", glyph: "VI" },
  { id: "pesquisas", label: "Pesquisas", href: "/pesquisas", glyph: "PE" },
  { id: "resultados", label: "Resultados", href: "/resultados", glyph: "RE" },
  { id: "respostas", label: "Respostas", href: "/respostas", glyph: "RS" },
  { id: "alertas", label: "Alertas", href: "/alertas", glyph: "AL" },
  { id: "estrutura", label: "Unidades e setores", href: "/estrutura", glyph: "US" },
  { id: "usuarios", label: "Usuários", href: "/usuarios", glyph: "GE", adminOnly: true },
  { id: "auditoria", label: "Auditoria", href: "/auditoria", glyph: "AU", adminOnly: true },
];

const roleLabels = {
  ADMIN: "Administrador geral",
  UNIT_MANAGER: "Gerente de unidade",
  SECTOR_MANAGER: "Gerente de setor",
  ANALYST: "Analista",
};

export async function AppShell({
  active,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  active: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const user = await requireUser();
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">VP</span>
          <span>
            <strong>Voz do Paciente</strong>
            <small>Complexo hospitalar</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Navegação principal">
          <p>GESTÃO</p>
          {navigation.filter((item) => !item.adminOnly || user.role === "ADMIN").map((item) => (
            <Link className={active === item.id ? "nav-link nav-link-active" : "nav-link"} href={item.href} key={item.id}>
              <span className="nav-glyph">{item.glyph}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-context">
          <span>AMBIENTE</span>
          <strong>{user.hospitalName}</strong>
          <small>Acesso conforme o perfil</small>
        </div>

        <div className="profile-card">
          <span className="avatar">{initials}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </span>
          <form action="/api/auth/logout" method="post">
            <button aria-label="Sair da conta" title="Sair da conta">Sair</button>
          </form>
        </div>
      </aside>

      <div className="main-column">
        <header className="mobile-header">
          <Link className="brand" href="/">
            <span className="brand-mark">VP</span>
            <strong>Voz do Paciente</strong>
          </Link>
          <form action="/api/auth/logout" method="post"><button className="mobile-status" type="submit">Sair</button></form>
        </header>
        <main className="content">
          <header className="page-header">
            <div>
              <span className="eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, suffix, trend, tone }: { label: string; value: string; suffix?: string; trend: string; tone: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-accent" />
      <span>{label}</span>
      <div className="metric-value">
        <strong>{value}</strong>
        {suffix ? <small>{suffix}</small> : null}
      </div>
      <p>{trend}</p>
    </article>
  );
}

export function StatusPill({ tone, children }: { tone: "success" | "warning" | "critical" | "neutral"; children: ReactNode }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
