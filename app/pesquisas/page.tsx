import Link from "next/link";
import { AppShell, Panel, StatusPill } from "../components/AppShell";
import { requireUser } from "../../lib/auth";
import { isDemoMode } from "../../lib/database";
import { listLifecycleSurveys } from "../../lib/survey-list";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export default async function SurveysPage() {
  const user = await requireUser();
  const surveyItems = await listLifecycleSurveys(user);
  const demoMode = isDemoMode();

  return <AppShell
    active="pesquisas"
    eyebrow="Gestão de pesquisas"
    title="Pesquisas"
    subtitle="Crie questionários, publique em vários setores e gerencie cada versão sem perder respostas."
    actions={user.role !== "ANALYST" ? <Link className="button button-primary" href="/pesquisas/nova">Criar pesquisa</Link> : undefined}
  >
    <div className="toolbar">
      <label className="search-field"><span>Buscar</span><input placeholder="Nome da pesquisa ou setor" /></label>
      <label className="compact-field"><span>Status</span><select defaultValue="todos"><option value="todos">Todos</option><option>Ativa</option><option>Pausada</option><option>Rascunho</option><option>Encerrada</option></select></label>
    </div>
    <Panel title="Todas as pesquisas" description={`${surveyItems.length} pesquisa${surveyItems.length === 1 ? "" : "s"} encontrada${surveyItems.length === 1 ? "" : "s"}`}>
      {surveyItems.length === 0 ? <div className="empty-state">Nenhuma pesquisa criada para o seu escopo.</div> : <div className="table-wrap">
        <table>
          <thead><tr><th>Pesquisa</th><th>Status</th><th>Respostas</th><th>Atualização</th><th /></tr></thead>
          <tbody>{surveyItems.map((survey) => <tr key={survey.id}>
            <td><strong>{survey.title}</strong><span>{survey.scope}{survey.hasDraft && survey.status !== "Rascunho" ? " · nova versão em rascunho" : ""}</span></td>
            <td><StatusPill tone={survey.status === "Ativa" ? "success" : survey.status === "Encerrada" ? "neutral" : "warning"}>{survey.status}</StatusPill></td>
            <td><strong>{survey.responses}</strong></td>
            <td>{dateFormatter.format(survey.updatedAt)}</td>
            <td>{demoMode ? <Link className="table-action" href="/responder/fisioterapia-cendor">Prévia</Link> : <Link className="table-action" href={`/pesquisas/${survey.id}`}>Abrir</Link>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Panel>
  </AppShell>;
}
