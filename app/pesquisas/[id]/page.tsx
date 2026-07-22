import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Panel, StatusPill } from "../../components/AppShell";
import { requireUser } from "../../../lib/auth";
import { getSurveyLifecycleDetail } from "../../../lib/survey-lifecycle";

const identificationLabels = {
  ANONYMOUS: "Anônima",
  OPTIONAL: "Identificação opcional",
  REQUIRED: "Identificação obrigatória",
};

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const survey = await getSurveyLifecycleDetail(user, id);
  if (!survey) notFound();
  const canManage = user.role !== "ANALYST";
  const publicHost = (process.env.PUBLIC_SURVEY_HOST || "http://localhost:3000").replace(/\/$/, "");
  const visibleTargets = survey.status === "Encerrada" ? [] : survey.targets.filter((target) => target.active);
  const statusTone = survey.status === "Ativa" ? "success" : survey.status === "Encerrada" ? "neutral" : "warning";

  const lifecycleForm = (action: "NEW_VERSION" | "PAUSE" | "RESUME" | "END", label: string, primary = false) => <form action={`/api/surveys/${survey.id}/lifecycle`} method="post" style={{ margin: 0 }}><input type="hidden" name="action" value={action} /><button className={`button ${primary ? "button-primary" : "button-secondary"}`} type="submit">{label}</button></form>;

  return <AppShell
    active="pesquisas"
    eyebrow={`Pesquisa · versão ${survey.displayedVersion}`}
    title={survey.name}
    subtitle={survey.description ?? "Detalhes, perguntas e pontos de publicação da pesquisa."}
    actions={<>
      <Link className="button button-secondary" href={`/resultados?pesquisa=${survey.id}`}>Ver resultados</Link>
      {canManage && survey.hasDraft ? <Link className="button button-primary" href={`/pesquisas/${survey.id}/editar`}>Editar rascunho</Link> : null}
      {canManage && !survey.hasDraft && survey.status !== "Rascunho" ? lifecycleForm("NEW_VERSION", "Nova versão", true) : null}
      {canManage && survey.status === "Ativa" ? lifecycleForm("PAUSE", "Pausar") : null}
      {canManage && survey.status === "Pausada" ? lifecycleForm("RESUME", "Retomar", true) : null}
      {canManage && (survey.status === "Ativa" || survey.status === "Pausada") ? lifecycleForm("END", "Encerrar") : null}
      <Link className="button button-secondary" href="/pesquisas">Voltar</Link>
    </>}
  >
    <div className="survey-detail-summary">
      <div><span>Status da publicação</span><StatusPill tone={statusTone}>{survey.status}</StatusPill></div>
      <div><span>Identificação</span><strong>{identificationLabels[survey.identificationMode]}</strong></div>
      <div><span>Perguntas</span><strong>{survey.questions.length}</strong></div>
      <div><span>Versão exibida</span><strong>{survey.displayedVersion}{survey.hasDraft ? " · rascunho" : ""}</strong></div>
    </div>

    {survey.hasDraft ? <div className="page-notice inline-notice">A versão {survey.draftVersion} está em rascunho. {survey.status === "Ativa" ? "A versão publicada continua recebendo respostas até a substituição." : "Edite e publique quando estiver pronta."}</div> : null}
    {survey.status === "Pausada" ? <div className="page-notice inline-notice">A coleta está pausada. Os QR Codes foram preservados, mas o formulário não aceita respostas até a retomada.</div> : null}
    {survey.status === "Encerrada" ? <div className="page-notice inline-notice">Esta publicação foi encerrada e seus QR Codes não aceitam novas respostas. Os resultados anteriores foram preservados.</div> : null}

    {visibleTargets.length > 0 ? <Panel title="QR Codes por setor" description={survey.status === "Pausada" ? "Códigos preservados durante a pausa." : "Imprima o código correspondente em cada local para separar os resultados."}>
      <div className="qr-grid">{visibleTargets.map((target) => {
        const publicUrl = `${publicHost}/responder/${target.token}`;
        return <article className="qr-card" key={target.id}>
          <div className="qr-image"><Image alt={`QR Code de ${target.sectorName}, ${target.unitName}`} src={`/api/qr/${target.token}`} width={220} height={220} unoptimized /></div>
          <span>{target.unitName}</span><h3>{target.sectorName}</h3><p>{target.responses} resposta{target.responses === 1 ? "" : "s"}</p>
          <code title={publicUrl}>{publicUrl}</code>
          <div>{survey.status === "Ativa" ? <Link className="button button-secondary" href={`/responder/${target.token}`} target="_blank">Testar link</Link> : null}<a className="button button-primary" href={`/api/qr/${target.token}?download=1`}>Baixar PNG</a></div>
        </article>;
      })}</div>
    </Panel> : null}

    <Panel title="Perguntas" description={`Conteúdo da versão ${survey.displayedVersion}${survey.hasDraft ? " em rascunho" : " publicada"}`}>
      <ol className="detail-question-list">{survey.questions.map((question) => <li key={question.id}><span>{question.type.replaceAll("_", " ")}</span><strong>{question.title}</strong><small>{question.required ? "Obrigatória" : "Opcional"}</small></li>)}</ol>
    </Panel>
  </AppShell>;
}
