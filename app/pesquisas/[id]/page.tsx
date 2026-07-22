import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Panel, StatusPill } from "../../components/AppShell";
import { requireUser } from "../../../lib/auth";
import { getSurveyDetail } from "../../../lib/surveys";

const identificationLabels = {
  ANONYMOUS: "Anônima",
  OPTIONAL: "Identificação opcional",
  REQUIRED: "Identificação obrigatória",
};

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const survey = await getSurveyDetail(user, id);
  if (!survey) notFound();

  const publicHost = (process.env.PUBLIC_SURVEY_HOST || "http://localhost:3000").replace(/\/$/, "");

  return (
    <AppShell
      active="pesquisas"
      eyebrow="Pesquisa publicada"
      title={survey.name}
      subtitle={survey.description ?? "Detalhes, perguntas e pontos de publicação da pesquisa."}
      actions={<Link className="button button-secondary" href="/pesquisas">Voltar</Link>}
    >
      <div className="survey-detail-summary">
        <div><span>Status</span><StatusPill tone={survey.status === "Ativa" ? "success" : survey.status === "Rascunho" ? "warning" : "neutral"}>{survey.status}</StatusPill></div>
        <div><span>Identificação</span><strong>{identificationLabels[survey.identificationMode]}</strong></div>
        <div><span>Perguntas</span><strong>{survey.questions.length}</strong></div>
        <div><span>Setores publicados</span><strong>{survey.targets.length}</strong></div>
      </div>

      {survey.status === "Rascunho" ? <div className="page-notice inline-notice">Este rascunho ainda não possui QR Codes. A edição e publicação de uma versão salva será o próximo incremento.</div> : null}

      {survey.targets.length > 0 ? <Panel title="QR Codes por setor" description="Imprima o código correspondente em cada local. Assim, os resultados permanecem separados por unidade e setor.">
        <div className="qr-grid">
          {survey.targets.map((target) => {
            const publicUrl = `${publicHost}/responder/${target.token}`;
            return <article className="qr-card" key={target.id}>
              <div className="qr-image"><Image alt={`QR Code de ${target.sectorName}, ${target.unitName}`} src={`/api/qr/${target.token}`} width={220} height={220} unoptimized /></div>
              <span>{target.unitName}</span>
              <h3>{target.sectorName}</h3>
              <p>{target.responses} resposta{target.responses === 1 ? "" : "s"}</p>
              <code title={publicUrl}>{publicUrl}</code>
              <div><Link className="button button-secondary" href={`/responder/${target.token}`} target="_blank">Testar link</Link><a className="button button-primary" href={`/api/qr/${target.token}?download=1`}>Baixar PNG</a></div>
            </article>;
          })}
        </div>
      </Panel> : null}

      <Panel title="Perguntas" description="Conteúdo da versão atual">
        <ol className="detail-question-list">{survey.questions.map((question) => <li key={question.id}><span>{question.type.replaceAll("_", " ")}</span><strong>{question.title}</strong><small>{question.required ? "Obrigatória" : "Opcional"}</small></li>)}</ol>
      </Panel>
    </AppShell>
  );
}
