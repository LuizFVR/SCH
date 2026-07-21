import Link from "next/link";
import { AppShell, Panel, StatusPill } from "../components/AppShell";
import { requireRole } from "../../lib/auth";
import { isDemoMode } from "../../lib/database";
import { listManagedUsers } from "../../lib/organization";

export const dynamic = "force-dynamic";

const roleLabels = { ADMIN: "Administrador geral", UNIT_MANAGER: "Gerente de unidade", SECTOR_MANAGER: "Gerente de setor", ANALYST: "Analista" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const currentUser = await requireRole(["ADMIN"]);
  const managedUsers = await listManagedUsers(currentUser);
  const { created } = await searchParams;

  return (
    <AppShell active="usuarios" eyebrow="Acesso e permissões" title="Usuários" subtitle="Cada gestor visualiza somente as unidades e setores sob sua responsabilidade." actions={isDemoMode() ? <button className="button button-primary" disabled title="Conecte o PostgreSQL para cadastrar">Cadastrar usuário</button> : <Link className="button button-primary" href="/usuarios/novo">Cadastrar usuário</Link>}>
      {created === "1" ? <div className="inline-notice page-notice">Usuário cadastrado com sucesso.</div> : null}
      {isDemoMode() ? <div className="demo-banner"><span className="demo-dot" />Modo local: o cadastro será habilitado quando o PostgreSQL estiver conectado.</div> : null}
      <Panel title="Equipe de gestão" description={`${managedUsers.length} usuários cadastrados`}>
        <div className="user-list">{managedUsers.map((user) => {
          const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
          return <article key={user.id}><span className="avatar avatar-large">{initials}</span><div><strong>{user.name}</strong><small>{user.email}</small></div><div><strong>{roleLabels[user.role]}</strong><small>{user.lastLoginAt ? `Último acesso: ${user.lastLoginAt.toLocaleDateString("pt-BR")}` : "Ainda não acessou"}</small></div><StatusPill tone={user.active ? "success" : "neutral"}>{user.active ? "Ativo" : "Inativo"}</StatusPill><button className="row-menu" aria-label={`Opções de ${user.name}`}>•••</button></article>;
        })}</div>
      </Panel>
    </AppShell>
  );
}
