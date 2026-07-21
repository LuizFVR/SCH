import Link from "next/link";
import { AppShell, MetricCard, Panel, StatusPill } from "./components/AppShell";

const sectorScores = [
  { name: "Fisioterapia · Cendor", score: 4.8, responses: 186, width: "96%" },
  { name: "Laboratório · Unidade Central", score: 4.6, responses: 241, width: "92%" },
  { name: "Fisioterapia · Urgência", score: 4.3, responses: 154, width: "86%" },
  { name: "Recepção · Urgência", score: 3.9, responses: 302, width: "78%" },
];

export default function DashboardPage() {
  return (
    <AppShell
      active="inicio"
      eyebrow="Visão geral"
      title="Experiência do paciente"
      subtitle="Acompanhe a satisfação em todas as unidades e identifique o que precisa de atenção."
      actions={
        <Link className="button button-primary" href="/pesquisas/nova">
          Nova pesquisa
        </Link>
      }
    >
      <div className="demo-banner">
        <span className="demo-dot" />
        Dados demonstrativos para validar a primeira versão do produto
      </div>

      <section className="metrics-grid" aria-label="Indicadores principais">
        <MetricCard label="Satisfação geral" value="4,6" suffix="/ 5" trend="+0,2 neste mês" tone="teal" />
        <MetricCard label="Respostas" value="1.284" trend="+18% neste mês" tone="blue" />
        <MetricCard label="Pesquisas ativas" value="6" trend="Em 12 setores" tone="violet" />
        <MetricCard label="Alertas abertos" value="3" trend="2 novos hoje" tone="coral" />
      </section>

      <section className="dashboard-grid">
        <Panel
          title="Satisfação por setor"
          description="Comparativo das avaliações nos últimos 30 dias"
          action={<button className="text-button">Ver relatório completo</button>}
        >
          <div className="score-list">
            {sectorScores.map((sector) => (
              <div className="score-row" key={sector.name}>
                <div className="score-copy">
                  <strong>{sector.name}</strong>
                  <span>{sector.responses} respostas</span>
                </div>
                <div className="score-track" aria-hidden="true">
                  <span style={{ width: sector.width }} />
                </div>
                <strong className="score-value">{sector.score.toFixed(1).replace(".", ",")}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Alertas recentes" description="Avaliações que precisam de acompanhamento">
          <div className="alert-list">
            <article className="alert-card alert-card-critical">
              <div className="alert-card-head">
                <StatusPill tone="critical">1 estrela</StatusPill>
                <time>Hoje, 10:42</time>
              </div>
              <strong>Recepção · Urgência</strong>
              <p>“O tempo de espera foi muito longo e não recebi informações.”</p>
              <Link href="/alertas">Analisar alerta</Link>
            </article>
            <article className="alert-card">
              <div className="alert-card-head">
                <StatusPill tone="warning">2 estrelas</StatusPill>
                <time>Ontem, 16:18</time>
              </div>
              <strong>Laboratório · Unidade Central</strong>
              <p>Paciente sinalizou dificuldade para localizar a sala de coleta.</p>
              <Link href="/alertas">Analisar alerta</Link>
            </article>
          </div>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-lower">
        <Panel title="Volume de respostas" description="Distribuição dos últimos sete dias">
          <div className="mini-chart" aria-label="Gráfico demonstrativo de respostas por dia">
            {[54, 72, 61, 88, 76, 96, 82].map((height, index) => (
              <div className="mini-chart-column" key={index}>
                <span style={{ height: `${height}%` }} />
                <small>{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][index]}</small>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Pesquisa em destaque" description="Fisioterapia — experiência pós-atendimento">
          <div className="featured-survey">
            <div>
              <StatusPill tone="success">Ativa</StatusPill>
              <h3>340 respostas</h3>
              <p>Publicada na Fisioterapia da Urgência e do Cendor.</p>
            </div>
            <Link className="button button-secondary" href="/responder/fisioterapia-cendor">
              Abrir formulário
            </Link>
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
