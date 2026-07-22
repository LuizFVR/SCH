import Link from "next/link";
import { AppShell, Panel, StatusPill } from "../components/AppShell";
import { requireUser } from "../../lib/auth";
import { isDemoMode } from "../../lib/database";
import { listOperationalAlerts } from "../../lib/response-management";
import { listAlerts } from "../../lib/surveys";
import { resolveAlert } from "./actions";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AlertsPage() {
  const user = await requireUser();
  const demoMode = isDemoMode();
  const alertItems = demoMode
    ? (await listAlerts(user)).map((alert) => ({ ...alert, responseId: null }))
    : await listOperationalAlerts(user);
  const today = new Date();
  const newToday = alertItems.filter((alert) => alert.createdAt.toDateString() === today.toDateString()).length;

  return (
    <AppShell active="alertas" eyebrow="Acompanhamento" title="Alertas" subtitle="Avaliações abaixo do limite configurado, organizadas por prioridade.">
      <div className="alert-summary"><div><strong>{alertItems.length}</strong><span>abertos</span></div><div><strong>{newToday}</strong><span>novos hoje</span></div><div><strong>Automático</strong><span>criação por nota geral</span></div></div>
      <Panel title="Pendentes" description="Cada pesquisa define a nota máxima que dispara um alerta">
        {alertItems.length === 0 ? <div className="empty-state">Nenhum alerta pendente no seu escopo.</div> : <div className="alert-table-list">
          {alertItems.map((alert) => <article key={alert.id}>
            <span className={`alert-priority ${alert.score === 1 ? "critical-dot" : "warning-dot"}`} />
            <div><div className="alert-meta"><StatusPill tone={alert.score === 1 ? "critical" : "warning"}>{alert.score ?? "—"} estrela{alert.score === 1 ? "" : "s"}</StatusPill><time>{timeFormatter.format(alert.createdAt)}</time></div><h3>{alert.sectorName} · {alert.unitName}</h3><p>{alert.reason}</p></div>
            <div style={{ display: "grid", gap: 7 }}>
              {alert.responseId ? <Link className="button button-secondary" href={`/respostas/${alert.responseId}`}>Ver resposta</Link> : null}
              <form action={resolveAlert}><input type="hidden" name="alertId" value={alert.id} /><button disabled={demoMode} className="button button-secondary" type="submit">{demoMode ? "Exemplo" : "Marcar como resolvido"}</button></form>
            </div>
          </article>)}
        </div>}
      </Panel>
    </AppShell>
  );
}
