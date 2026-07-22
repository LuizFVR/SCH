import Link from "next/link";
import { AppShell, MetricCard, Panel, StatusPill } from "./components/AppShell";
import { getAnalytics } from "../lib/analytics";
import { requireUser } from "../lib/auth";
import { isDemoMode } from "../lib/database";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function DashboardPage() {
  const user = await requireUser();
  const analytics = await getAnalytics(user, { days: 30 });
  const chartVolume = analytics.dailyVolume.slice(-14);
  const maximumVolume = Math.max(...chartVolume.map((item) => item.count), 1);
  const scoreTrend = analytics.metrics.scoreChange === null
    ? "Sem período anterior para comparar"
    : `${analytics.metrics.scoreChange >= 0 ? "+" : ""}${analytics.metrics.scoreChange.toFixed(1).replace(".", ",")} no período`;
  const responseTrend = analytics.metrics.responseTrendPercent === null
    ? "Sem período anterior para comparar"
    : `${analytics.metrics.responseTrendPercent >= 0 ? "+" : ""}${analytics.metrics.responseTrendPercent}% no período`;

  return (
    <AppShell
      active="inicio"
      eyebrow="Visão geral"
      title="Experiência do paciente"
      subtitle="Acompanhe a satisfação em todas as unidades e identifique o que precisa de atenção."
      actions={user.role !== "ANALYST" ? <Link className="button button-primary" href="/pesquisas/nova">Nova pesquisa</Link> : undefined}
    >
      {isDemoMode() ? <div className="demo-banner"><span className="demo-dot" />Dados demonstrativos para validar a primeira versão do produto</div> : null}

      <div style={{ marginTop: isDemoMode() ? 0 : 30 }}>
        <section className="metrics-grid" aria-label="Indicadores principais">
          <MetricCard label="Satisfação geral" value={analytics.metrics.overallScore?.toFixed(1).replace(".", ",") ?? "—"} suffix="/ 5" trend={scoreTrend} tone="teal" />
          <MetricCard label="Respostas em 30 dias" value={numberFormatter.format(analytics.metrics.totalResponses)} trend={responseTrend} tone="blue" />
          <MetricCard label="Pesquisas ativas" value={String(analytics.metrics.activeSurveys)} trend={`Em ${analytics.metrics.activeSectors} setor${analytics.metrics.activeSectors === 1 ? "" : "es"}`} tone="violet" />
          <MetricCard label="Alertas abertos" value={String(analytics.metrics.openAlerts)} trend={`${analytics.metrics.newAlertsToday} novo${analytics.metrics.newAlertsToday === 1 ? "" : "s"} hoje`} tone="coral" />
        </section>
      </div>

      <section className="dashboard-grid">
        <Panel title="Satisfação por setor" description="Comparativo das avaliações nos últimos 30 dias" action={<Link className="text-button" href="/resultados">Ver relatório completo</Link>}>
          {analytics.sectorScores.length === 0 ? <div className="empty-state">As notas aparecerão após as primeiras respostas.</div> : <div className="score-list">
            {analytics.sectorScores.slice(0, 5).map((sector) => <div className="score-row" key={sector.sectorId}>
              <div className="score-copy"><strong>{sector.name}</strong><span>{numberFormatter.format(sector.responses)} resposta{sector.responses === 1 ? "" : "s"}</span></div>
              <div className="score-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, sector.score * 20))}%` }} /></div>
              <strong className="score-value">{sector.score.toFixed(1).replace(".", ",")}</strong>
            </div>)}
          </div>}
        </Panel>

        <Panel title="Alertas recentes" description="Avaliações que precisam de acompanhamento">
          {analytics.recentAlerts.length === 0 ? <div className="empty-state">Nenhum alerta aberto.</div> : <div className="alert-list">
            {analytics.recentAlerts.slice(0, 3).map((alert) => <article className={`alert-card ${alert.score === 1 ? "alert-card-critical" : ""}`} key={alert.id}>
              <div className="alert-card-head"><StatusPill tone={alert.score === 1 ? "critical" : "warning"}>{alert.score ?? "—"} estrela{alert.score === 1 ? "" : "s"}</StatusPill><time>{shortDateFormatter.format(alert.createdAt)}</time></div>
              <strong>{alert.sectorName} · {alert.unitName}</strong><p>{alert.reason}</p><Link href="/alertas">Analisar alerta</Link>
            </article>)}
          </div>}
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-lower">
        <Panel title="Volume de respostas" description="Distribuição dos últimos 14 dias">
          {chartVolume.every((item) => item.count === 0) ? <div className="empty-state">O volume será exibido após as primeiras respostas.</div> : <div className="mini-chart" aria-label="Gráfico de respostas por dia">
            {chartVolume.map((item) => <div className="mini-chart-column" title={`${item.label}: ${item.count} respostas`} key={item.label}><span style={{ height: `${Math.max(4, (item.count / maximumVolume) * 100)}%` }} /><small>{item.label}</small></div>)}
          </div>}
        </Panel>

        <Panel title="Pesquisa em destaque" description={analytics.featuredSurvey?.name ?? "Nenhuma pesquisa ativa"}>
          {analytics.featuredSurvey ? <div className="featured-survey"><div><StatusPill tone="success">Ativa</StatusPill><h3>{numberFormatter.format(analytics.featuredSurvey.responses)} respostas</h3><p>Publicada em {analytics.featuredSurvey.sectors} setor{analytics.featuredSurvey.sectors === 1 ? "" : "es"}.</p></div><Link className="button button-secondary" href={`/pesquisas/${analytics.featuredSurvey.id}`}>Abrir pesquisa</Link></div> : <div className="empty-state">Publique uma pesquisa para iniciar a coleta.</div>}
        </Panel>
      </section>
    </AppShell>
  );
}
