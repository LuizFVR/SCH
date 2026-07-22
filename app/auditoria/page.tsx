import Link from "next/link";
import { AppShell, MetricCard, Panel, StatusPill } from "../components/AppShell";
import { requireRole } from "../../lib/auth";
import { getAuditEvents } from "../../lib/audit";
import styles from "./audit.module.css";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const roleLabels = { ADMIN: "Administrador", UNIT_MANAGER: "Gerente de unidade", SECTOR_MANAGER: "Gerente de setor", ANALYST: "Analista" };

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(filters: { days: number; action: string | null; actorId: string | null }, page: number) {
  const query = new URLSearchParams({ periodo: String(filters.days), pagina: String(page) });
  if (filters.action) query.set("acao", filters.action);
  if (filters.actorId) query.set("usuario", filters.actorId);
  return `/auditoria?${query}`;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["ADMIN"]);
  const query = await searchParams;
  const result = await getAuditEvents(user, {
    days: Number(queryValue(query.periodo)),
    action: queryValue(query.acao),
    actorId: queryValue(query.usuario),
    page: Number(queryValue(query.pagina)),
  });
  const hasFilters = Boolean(result.filters.action || result.filters.actorId || result.filters.days !== 30);

  return <AppShell
    active="auditoria"
    eyebrow="Governança e segurança"
    title="Auditoria"
    subtitle="Acompanhe acessos e operações sensíveis realizadas pelos usuários do hospital."
  >
    <section className={`metrics-grid ${styles.metrics}`} aria-label="Resumo da auditoria">
      <MetricCard label="Eventos no período" value={String(result.metrics.total)} trend={`Últimos ${result.filters.days} dias`} tone="blue" />
      <MetricCard label="Identificações abertas" value={String(result.metrics.identityViews)} trend="Acessos a dados pessoais" tone="coral" />
      <MetricCard label="Exportações" value={String(result.metrics.exports)} trend="Arquivos de respostas gerados" tone="violet" />
      <MetricCard label="Acessos ao sistema" value={String(result.metrics.logins)} trend="Autenticações concluídas" tone="teal" />
    </section>

    <form className={styles.filters} method="get">
      <label><span>Período</span><select name="periodo" defaultValue={String(result.filters.days)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Último ano</option></select></label>
      <label><span>Ação</span><select name="acao" defaultValue={result.filters.action ?? ""}><option value="">Todas as ações</option>{Object.entries(Object.groupBy(result.actionOptions, (option) => option.group)).map(([group, options]) => <optgroup label={group} key={group}>{options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>)}</select></label>
      <label><span>Usuário</span><select name="usuario" defaultValue={result.filters.actorId ?? ""}><option value="">Todos os usuários</option>{result.userOptions.map((option) => <option value={option.id} key={option.id}>{option.name} · {roleLabels[option.role]}</option>)}</select></label>
      <button className="button button-secondary" type="submit">Aplicar filtros</button>
      {hasFilters ? <Link className={styles.clear} href="/auditoria">Limpar</Link> : null}
    </form>

    <div className={styles.privacyNotice}><strong>Registro protegido</strong><span>A auditoria informa quem realizou cada operação, mas nunca copia nomes, contatos ou respostas de pacientes para este histórico.</span></div>

    <Panel title="Histórico de atividades" description={`${result.pagination.total} evento${result.pagination.total === 1 ? "" : "s"} encontrado${result.pagination.total === 1 ? "" : "s"}`}>
      {result.items.length === 0 ? <div className="empty-state">Nenhum evento encontrado para os filtros selecionados.</div> : <div className={styles.timeline}>
        {result.items.map((event) => <article key={event.id}>
          <span className={`${styles.marker} ${styles[event.tone]}`} aria-hidden="true" />
          <div className={styles.eventBody}>
            <header><div><StatusPill tone={event.tone}>{event.actionLabel}</StatusPill><span className={styles.group}>{event.group}</span></div><time>{dateFormatter.format(event.createdAt)}</time></header>
            <h3>{event.actorName}</h3>
            {event.actorEmail ? <small>{event.actorEmail}</small> : null}
            <p>{event.detail}</p>
          </div>
          <div className={styles.eventAction}>{event.entityHref ? <Link href={event.entityHref}>Abrir registro</Link> : <span>{event.entityType}</span>}</div>
        </article>)}
      </div>}
      {result.pagination.pageCount > 1 ? <nav className={styles.pagination} aria-label="Paginação da auditoria">
        {result.pagination.page > 1 ? <Link className="button button-secondary" href={pageHref(result.filters, result.pagination.page - 1)}>Anterior</Link> : <span />}
        <strong>Página {result.pagination.page} de {result.pagination.pageCount}</strong>
        {result.pagination.page < result.pagination.pageCount ? <Link className="button button-secondary" href={pageHref(result.filters, result.pagination.page + 1)}>Próxima</Link> : <span />}
      </nav> : null}
    </Panel>
  </AppShell>;
}
