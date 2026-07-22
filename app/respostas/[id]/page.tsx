import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Panel, StatusPill } from "../../components/AppShell";
import { requireUser } from "../../../lib/auth";
import { getManagedResponse } from "../../../lib/response-management";
import type { SurveyQuestionType } from "../../../lib/survey-types";
import styles from "../responses.module.css";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAnswer(value: unknown, type: SurveyQuestionType) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (type === "YES_NO") return String(value).toLowerCase() === "true" || String(value).toLowerCase() === "sim" ? "Sim" : "Não";
  if (type === "STARS") return `${String(value)} ★`;
  if (type === "NPS") return `${String(value)} / 10`;
  if (value === null || value === undefined || value === "") return "Não respondida";
  return String(value);
}

export default async function ResponseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const revealIdentity = queryValue(query.identificacao) === "mostrar";
  const response = await getManagedResponse(user, id, revealIdentity);
  if (!response) notFound();

  return <AppShell
    active="respostas"
    eyebrow="Resposta individual"
    title={response.surveyName}
    subtitle="Visualize as respostas e, quando autorizado, revele a identificação com registro de auditoria."
    actions={<Link className="button button-secondary" href="/respostas">Voltar à lista</Link>}
  >
    <section className={styles.summary} aria-label="Resumo da resposta">
      <article><span>Recebida em</span><strong>{dateFormatter.format(response.submittedAt)}</strong></article>
      <article><span>Setor</span><strong>{response.sectorName}</strong><small>{response.unitName}</small></article>
      <article><span>Nota geral</span><strong>{response.score === null ? "—" : `${response.score} ★`}</strong></article>
      <article><span>Modalidade</span><strong>{response.identified ? "Identificada" : "Anônima"}</strong><small>{response.identificationMode === "REQUIRED" ? "Identificação obrigatória" : response.identificationMode === "OPTIONAL" ? "Identificação opcional" : "Pesquisa anônima"}</small></article>
    </section>

    <section className={styles.detailGrid}>
      <Panel title="Respostas da pesquisa" description={`${response.answers.length} pergunta${response.answers.length === 1 ? "" : "s"} respondida${response.answers.length === 1 ? "" : "s"}`}>
        {response.answers.length === 0 ? <div className="empty-state">Nenhuma resposta registrada.</div> : <div className={styles.answerList}>{response.answers.map((answer) => <article key={answer.id}>
          <span>Pergunta {answer.position}</span>
          <h3>{answer.question}</h3>
          <p>{formatAnswer(answer.value, answer.type)}</p>
        </article>)}</div>}
      </Panel>

      <Panel title="Identificação" description="Dados pessoais protegidos">
        <div className={styles.identity}>
          {!response.identified ? <><p className={styles.identityNotice}>O paciente respondeu anonimamente. Nenhum dado pessoal foi armazenado.</p><StatusPill tone="neutral">Resposta anônima</StatusPill></> : !response.identityAvailable ? <p className={`${styles.identityNotice} ${styles.identityError}`}>A resposta está marcada como identificada, mas não possui dados pessoais associados.</p> : !response.canRevealIdentity ? <><p className={styles.identityNotice}>Seu perfil pode analisar as respostas, mas não possui permissão para revelar dados pessoais.</p><StatusPill tone="neutral">Acesso restrito</StatusPill></> : response.identityError ? <p className={`${styles.identityNotice} ${styles.identityError}`}>{response.identityError}</p> : response.identity ? <>
            <p className={`${styles.identityNotice} ${styles.identityWarning}`}>A identificação foi revelada. Este acesso ficou registrado na auditoria.</p>
            <dl>
              <div><dt>Nome</dt><dd>{response.identity.name ?? "Não informado"}</dd></div>
              <div><dt>Contato</dt><dd>{response.identity.contact ?? "Não informado"}</dd></div>
              <div><dt>Idade</dt><dd>{response.identity.age ?? "Não informada"}</dd></div>
              <div><dt>Sexo</dt><dd>{response.identity.sex ?? "Não informado"}</dd></div>
              <div><dt>Consentimento</dt><dd>{dateFormatter.format(response.identity.consentAt)}</dd></div>
            </dl>
            <div className={styles.identityActions}><Link className="button button-secondary" href={`/respostas/${response.id}`}>Ocultar identificação</Link></div>
          </> : <>
            <p className={styles.identityNotice}>A identificação está oculta. Revele somente quando houver necessidade operacional legítima.</p>
            <div className={styles.identityActions}><form method="get"><input name="identificacao" type="hidden" value="mostrar" /><button className="button button-secondary" type="submit">Revelar identificação</button></form></div>
          </>}
        </div>
      </Panel>
    </section>
  </AppShell>;
}
