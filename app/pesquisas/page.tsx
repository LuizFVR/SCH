import Link from "next/link";
import { AppShell, Panel, StatusPill } from "../components/AppShell";

const surveys = [
  { title: "Experiência pós-atendimento", scope: "Fisioterapia · 2 setores", status: "Ativa", responses: 340, updated: "Hoje, 09:30" },
  { title: "Atendimento da recepção", scope: "Urgência · Recepção", status: "Ativa", responses: 302, updated: "Ontem, 17:12" },
  { title: "Pesquisa geral de internação", scope: "Unidade Central · Internação", status: "Rascunho", responses: 0, updated: "18 jul. 2026" },
  { title: "Experiência no laboratório", scope: "Unidade Central · Laboratório", status: "Encerrada", responses: 518, updated: "12 jul. 2026" },
];

export default function SurveysPage() {
  return (
    <AppShell
      active="pesquisas"
      eyebrow="Gestão de pesquisas"
      title="Pesquisas"
      subtitle="Crie questionários, publique em um ou vários setores e acompanhe cada versão."
      actions={<Link className="button button-primary" href="/pesquisas/nova">Criar pesquisa</Link>}
    >
      <div className="toolbar">
        <label className="search-field">
          <span>Buscar</span>
          <input placeholder="Nome da pesquisa ou setor" />
        </label>
        <label className="compact-field">
          <span>Status</span>
          <select defaultValue="todos"><option value="todos">Todos</option><option>Ativa</option><option>Rascunho</option><option>Encerrada</option></select>
        </label>
      </div>
      <Panel title="Todas as pesquisas" description="4 pesquisas encontradas">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pesquisa</th><th>Status</th><th>Respostas</th><th>Atualização</th><th /></tr></thead>
            <tbody>
              {surveys.map((survey) => (
                <tr key={survey.title}>
                  <td><strong>{survey.title}</strong><span>{survey.scope}</span></td>
                  <td><StatusPill tone={survey.status === "Ativa" ? "success" : survey.status === "Rascunho" ? "warning" : "neutral"}>{survey.status}</StatusPill></td>
                  <td><strong>{survey.responses}</strong></td>
                  <td>{survey.updated}</td>
                  <td><button className="row-menu" aria-label={`Opções de ${survey.title}`}>•••</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
