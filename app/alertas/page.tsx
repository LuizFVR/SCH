import { AppShell, Panel, StatusPill } from "../components/AppShell";

export default function AlertsPage() {
  return (
    <AppShell active="alertas" eyebrow="Acompanhamento" title="Alertas" subtitle="Avaliações abaixo do limite configurado, organizadas por prioridade.">
      <div className="alert-summary"><div><strong>3</strong><span>abertos</span></div><div><strong>2</strong><span>novos hoje</span></div><div><strong>7h</strong><span>tempo médio de resolução</span></div></div>
      <Panel title="Pendentes" description="Notas iguais ou inferiores a duas estrelas">
        <div className="alert-table-list">
          <article><span className="alert-priority critical-dot" /><div><div className="alert-meta"><StatusPill tone="critical">1 estrela</StatusPill><time>Hoje, 10:42</time></div><h3>Recepção · Unidade Urgência</h3><p>“O tempo de espera foi muito longo e não recebi informações.”</p></div><button className="button button-secondary">Marcar como resolvido</button></article>
          <article><span className="alert-priority warning-dot" /><div><div className="alert-meta"><StatusPill tone="warning">2 estrelas</StatusPill><time>Ontem, 16:18</time></div><h3>Laboratório · Unidade Central</h3><p>Paciente sinalizou dificuldade para localizar a sala de coleta.</p></div><button className="button button-secondary">Marcar como resolvido</button></article>
          <article><span className="alert-priority warning-dot" /><div><div className="alert-meta"><StatusPill tone="warning">2 estrelas</StatusPill><time>Ontem, 11:05</time></div><h3>Fisioterapia · Unidade Urgência</h3><p>Comentário sobre indisponibilidade de cadeiras na área de espera.</p></div><button className="button button-secondary">Marcar como resolvido</button></article>
        </div>
      </Panel>
    </AppShell>
  );
}
