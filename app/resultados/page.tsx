import Link from "next/link";
import { AppShell, MetricCard, Panel, StatusPill } from "../components/AppShell";
import { getAnalytics } from "../../lib/analytics";
import { requireUser } from "../../lib/auth";
import styles from "./results.module.css";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const query = await searchParams;
  const requestedDays = Number(queryValue(query.periodo));
  const analytics = await getAnalytics(user, {
    days: requestedDays,
    sectorId: queryValue(query.setor),
    surveyId: queryValue(query.pesquisa),
  });
  const maximumVolume = Math.max(...analytics.dailyVolume.map((item) => item.count), 1);
  const maximumSectorResponses = Math.max(...analytics.sectorScores.map((item) => item.responses), 1);
  const exportQuery = new URLSearchParams({ days: String(analytics.filters.days) });
  if (analytics.filters.sectorId) exportQuery.set("sectorId", analytics.filters.sectorId);
  if (analytics.filters.surveyId) exportQuery.set("surveyId", analytics.filters.surveyId);

  return <AppShell
    active="resultados"
    eyebrow="Análise consolidada"
    title="Resultados"
    subtitle="Compare unidades, acompanhe tendências e exporte somente os dados permitidos pelo seu perfil."
    actions={<a className="button button-primary" href={`/api/reports/responses.csv?${exportQuery}`}>Exportar CSV</a>}
  >
    <form className={styles.filters} method="get">
      <label><span>Período</span><select name="periodo" defaultValue={String(analytics.filters.days)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
      <label><span>Pesquisa</span><select name="pesquisa" defaultValue={analytics.filters.surveyId ?? ""}><option value="">Todas as pesquisas</option>{analytics.surveyOptions.map((survey) => <option value={survey.id} key={survey.id}>{survey.name}</option>)}</select></label>
      <label><span>Setor</span><select name="setor" defaultValue={analytics.filters.sectorId ?? ""}><option value="">Todos os setores permitidos</option>{analytics.organizationUnits.map((unit) => <optgroup label={unit.name} key={unit.id}>{unit.sectors.map((sector) => <option value={sector.id} key={sector.id}>{sector.name}</option>)}</optgroup>)}</select></label>
      <button className="button button-secondary" type="submit">Aplicar filtros</button>
      {(analytics.filters.sectorId || analytics.filters.surveyId || analytics.filters.days !== 30) ? <Link className={styles.clear} href="/resultados">Limpar</Link> : null}
    </form>

    <section className={`metrics-grid ${styles.metrics}`} aria-label="Resumo dos resultados">
      <MetricCard label="Satisfação geral" value={analytics.metrics.overallScore?.toFixed(1).replace(".", ",") ?? "—"} suffix="/ 5" trend={analytics.metrics.scoreChange === null ? "Sem comparação anterior" : `${analytics.metrics.scoreChange >= 0 ? "+" : ""}${analytics.metrics.scoreChange.toFixed(1).replace(".", ",")} ante o período anterior`} tone="teal" />
      <MetricCard label="Respostas" value={numberFormatter.format(analytics.metrics.totalResponses)} trend={analytics.metrics.responseTrendPercent === null ? "Sem comparação anterior" : `${analytics.metrics.responseTrendPercent >= 0 ? "+" : ""}${analytics.metrics.responseTrendPercent}% ante o período anterior`} tone="blue" />
      <MetricCard label="Setores no filtro" value={String(analytics.metrics.activeSectors)} trend={`${analytics.metrics.activeSurveys} pesquisa${analytics.metrics.activeSurveys === 1 ? "" : "s"} ativa${analytics.metrics.activeSurveys === 1 ? "" : "s"}`} tone="violet" />
      <MetricCard label="Alertas abertos" value={String(analytics.metrics.openAlerts)} trend={`${analytics.metrics.newAlertsToday} novo${analytics.metrics.newAlertsToday === 1 ? "" : "s"} hoje`} tone="coral" />
    </section>

    <section className={styles.grid}>
      <Panel title="Evolução das respostas" description={`Volume agrupado nos últimos ${analytics.filters.days} dias`}>
        {analytics.dailyVolume.every((item) => item.count === 0) ? <div className="empty-state">Nenhuma resposta no período selecionado.</div> : <div className={styles.volumeChart}>
          {analytics.dailyVolume.map((item) => <div className={styles.volumeColumn} title={`${item.label}: ${item.count} respostas`} key={item.label}><strong>{item.count || ""}</strong><span style={{ height: `${Math.max(item.count ? 6 : 0, (item.count / maximumVolume) * 100)}%` }} /><small>{item.label}</small></div>)}
        </div>}
      </Panel>

      <Panel title="Distribuição das notas" description="Participação de cada nota geral">
        <div className={styles.distribution}>{analytics.scoreDistribution.slice().reverse().map((item) => <div key={item.score}><span>{item.score} ★</span><div><i style={{ width: `${item.percentage}%` }} /></div><strong>{item.percentage}%</strong><small>{item.count}</small></div>)}</div>
      </Panel>
    </section>

    <section className={styles.grid}>
      <Panel title="Satisfação por setor" description="Nota média e volume no período">
        {analytics.sectorScores.length === 0 ? <div className="empty-state">Nenhuma nota disponível para os filtros selecionados.</div> : <div className={styles.ranking}>{analytics.sectorScores.map((sector, index) => <article key={sector.sectorId}><span>{index + 1}</span><div><strong>{sector.name}</strong><div><i style={{ width: `${(sector.responses / maximumSectorResponses) * 100}%` }} /></div><small>{sector.responses} resposta{sector.responses === 1 ? "" : "s"}</small></div><b>{sector.score.toFixed(1).replace(".", ",")}</b></article>)}</div>}
      </Panel>

      <Panel title="Pesquisas no período" description="Desempenho das publicações selecionadas">
        {analytics.surveyResults.length === 0 ? <div className="empty-state">Nenhuma pesquisa recebeu respostas neste período.</div> : <div className={styles.surveyList}>{analytics.surveyResults.map((survey) => <article key={survey.id}><div><strong>{survey.name}</strong><span>{survey.responses} resposta{survey.responses === 1 ? "" : "s"}</span></div><StatusPill tone={survey.score !== null && survey.score <= 2 ? "critical" : survey.score !== null && survey.score < 4 ? "warning" : "success"}>{survey.score?.toFixed(1).replace(".", ",") ?? "—"}</StatusPill><Link href={`/pesquisas/${survey.id}`}>Abrir</Link></article>)}</div>}
      </Panel>
    </section>

    <Panel title="Comentários recentes" description="Respostas escritas, sem exibir dados de identificação">
      {analytics.recentComments.length === 0 ? <div className="empty-state">Nenhum comentário no período selecionado.</div> : <div className={styles.comments}>{analytics.recentComments.map((comment) => <article key={comment.id}><header><div><strong>{comment.sectorName} · {comment.unitName}</strong><span>{comment.surveyName}</span></div><time>{dateFormatter.format(comment.submittedAt)}</time></header><p>“{comment.comment}”</p><small>{comment.question}</small></article>)}</div>}
    </Panel>
  </AppShell>;
}
