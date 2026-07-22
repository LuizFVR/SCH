import Link from "next/link";
import { AppShell, Panel, StatusPill } from "../components/AppShell";
import { requireUser } from "../../lib/auth";
import { listManagedResponses } from "../../lib/response-management";
import styles from "./responses.module.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const query = await searchParams;
  const result = await listManagedResponses(user, {
    days: Number(queryValue(query.periodo)),
    sectorId: queryValue(query.setor),
    surveyId: queryValue(query.pesquisa),
  });
  const hasFilters = Boolean(result.filters.sectorId || result.filters.surveyId || result.filters.days !== 30);

  return <AppShell
    active="respostas"
    eyebrow="Acompanhamento individual"
    title="Respostas"
    subtitle="Consulte avaliações no seu escopo. Dados pessoais permanecem ocultos até uma ação autorizada."
  >
    <form className={styles.filters} method="get">
      <label><span>Período</span><select name="periodo" defaultValue={String(result.filters.days)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
      <label><span>Pesquisa</span><select name="pesquisa" defaultValue={result.filters.surveyId ?? ""}><option value="">Todas as pesquisas</option>{result.surveyOptions.map((survey) => <option value={survey.id} key={survey.id}>{survey.name}</option>)}</select></label>
      <label><span>Setor</span><select name="setor" defaultValue={result.filters.sectorId ?? ""}><option value="">Todos os setores permitidos</option>{result.organizationUnits.map((unit) => <optgroup label={unit.name} key={unit.id}>{unit.sectors.map((sector) => <option value={sector.id} key={sector.id}>{sector.name}</option>)}</optgroup>)}</select></label>
      <button className="button button-secondary" type="submit">Aplicar filtros</button>
      {hasFilters ? <Link className={styles.clear} href="/respostas">Limpar</Link> : null}
    </form>

    <Panel title="Respostas recebidas" description={`${result.items.length} registro${result.items.length === 1 ? "" : "s"} encontrado${result.items.length === 1 ? "" : "s"}`}>
      {result.items.length === 0 ? <div className="empty-state">Nenhuma resposta encontrada para os filtros selecionados.</div> : <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Data</th><th>Pesquisa</th><th>Local</th><th>Nota</th><th>Tipo</th><th><span className={styles.visuallyHidden}>Ação</span></th></tr></thead>
          <tbody>{result.items.map((response) => <tr key={response.id}>
            <td data-label="Data"><time>{dateFormatter.format(response.submittedAt)}</time></td>
            <td data-label="Pesquisa"><strong>{response.surveyName}</strong></td>
            <td data-label="Local"><strong>{response.sectorName}</strong><small>{response.unitName}</small></td>
            <td data-label="Nota">{response.score === null ? <StatusPill tone="neutral">Sem nota</StatusPill> : <StatusPill tone={response.score <= 2 ? "critical" : response.score < 4 ? "warning" : "success"}>{response.score} ★</StatusPill>}</td>
            <td data-label="Tipo"><StatusPill tone={response.identified ? "warning" : "neutral"}>{response.identified ? "Identificada" : "Anônima"}</StatusPill></td>
            <td><Link className={styles.open} href={`/respostas/${response.id}`}>Ver resposta</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Panel>
  </AppShell>;
}
