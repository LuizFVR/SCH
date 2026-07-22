"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationUnit } from "../../../../lib/organization";
import type { QuestionLibraryItem } from "../../../../lib/surveys";
import type { SurveyIdentificationMode, SurveyQuestionInput, SurveyQuestionType } from "../../../../lib/survey-types";

const typeLabels: Record<SurveyQuestionType, string> = {
  STARS: "Avaliação por estrelas",
  NPS: "Escala de 0 a 10",
  YES_NO: "Sim ou não",
  SINGLE_CHOICE: "Escolha única",
  MULTIPLE_CHOICE: "Múltipla escolha",
  SHORT_TEXT: "Texto curto",
  LONG_TEXT: "Texto longo",
};

function newClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `question-${Date.now()}-${Math.random()}`;
}

export function SurveyEditor({ survey, organizationUnits, library }: {
  survey: {
    id: string;
    name: string;
    description: string | null;
    version: number;
    questions: Array<{ id: string; sourceQuestionId: string | null; title: string; type: SurveyQuestionType; required: boolean; options: string[] }>;
    identificationMode: SurveyIdentificationMode;
    identificationFields: string[];
    sectorIds: string[];
    alertThreshold: number;
    duplicateWindowHours: number;
    replacesActiveVersion: boolean;
  };
  organizationUnits: OrganizationUnit[];
  library: QuestionLibraryItem[];
}) {
  const router = useRouter();
  const [name, setName] = useState(survey.name);
  const [description, setDescription] = useState(survey.description ?? "");
  const [questions, setQuestions] = useState<SurveyQuestionInput[]>(survey.questions.map((question) => ({ ...question, clientId: question.id, sourceQuestionId: question.sourceQuestionId ?? undefined })));
  const [newType, setNewType] = useState<SurveyQuestionType>("STARS");
  const [selectedSectorIds, setSelectedSectorIds] = useState(survey.sectorIds);
  const [identificationMode, setIdentificationMode] = useState(survey.identificationMode);
  const [identificationFields, setIdentificationFields] = useState(survey.identificationFields);
  const [alertThreshold, setAlertThreshold] = useState(survey.alertThreshold);
  const [duplicateWindowHours, setDuplicateWindowHours] = useState(survey.duplicateWindowHours);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateQuestion(clientId: string, changes: Partial<SurveyQuestionInput>) {
    setQuestions((current) => current.map((question) => question.clientId === clientId ? { ...question, ...changes } : question));
  }

  function addQuestion(type: SurveyQuestionType, source?: QuestionLibraryItem) {
    const choice = type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";
    setQuestions((current) => [...current, { clientId: newClientId(), sourceQuestionId: source?.id, title: source?.title ?? "Nova pergunta", type, required: false, options: source?.options.length ? source.options : choice ? ["Opção 1", "Opção 2"] : [] }]);
    setNotice(source ? "Pergunta clonada para esta nova versão." : "Pergunta adicionada.");
  }

  async function submit(intent: "save" | "publish") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, questions, sectorIds: selectedSectorIds, identificationMode, identificationFields, alertThreshold, duplicateWindowHours, intent }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a pesquisa.");
      if (intent === "publish") {
        router.push(`/pesquisas/${survey.id}`);
        router.refresh();
      } else {
        setNotice("Rascunho salvo. A versão ativa anterior continua recebendo respostas.");
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Não foi possível atualizar a pesquisa.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSector(id: string, checked: boolean) {
    setSelectedSectorIds((current) => checked ? [...new Set([...current, id])] : current.filter((sectorId) => sectorId !== id));
  }

  function toggleIdentityField(id: string, checked: boolean) {
    setIdentificationFields((current) => checked ? [...new Set([...current, id])] : current.filter((field) => field !== id));
  }

  return <div className="builder-layout">
    <section className="builder-main">
      {survey.replacesActiveVersion ? <div className="inline-notice">Você está editando a versão {survey.version}. A versão publicada continua ativa até esta ser publicada.</div> : null}
      {notice ? <div className="inline-notice" role="status">{notice}</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <div className="survey-basics">
        <label><span>Nome da pesquisa</span><input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Texto de apresentação</span><textarea rows={3} maxLength={1500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
      <div className="builder-section-header"><div><span>VERSÃO {survey.version}</span><h2>Perguntas da pesquisa</h2><p>Ao publicar, esta versão substituirá a anterior sem apagar respostas.</p></div><span className="question-count">{questions.length} perguntas</span></div>
      <div className="question-stack">{questions.map((question, index) => <article className="question-card" key={question.clientId}>
        <div className="drag-handle" aria-hidden="true">••</div><div className="question-number">{index + 1}</div>
        <div className="question-content">
          <label><span>Pergunta</span><input maxLength={500} value={question.title} onChange={(event) => updateQuestion(question.clientId, { title: event.target.value })} /></label>
          <div className="question-options"><label className="type-select"><span>Tipo</span><select value={question.type} onChange={(event) => { const type = event.target.value as SurveyQuestionType; updateQuestion(question.clientId, { type, options: type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" ? question.options?.length ? question.options : ["Opção 1", "Opção 2"] : [] }); }}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="switch-label"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.clientId, { required: event.target.checked })} /> Obrigatória</label></div>
          {(question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") ? <label className="choice-editor"><span>Opções (uma por linha)</span><textarea rows={3} value={(question.options ?? []).join("\n")} onChange={(event) => updateQuestion(question.clientId, { options: event.target.value.split("\n") })} /></label> : null}
        </div>
        <button type="button" className="remove-button" aria-label={`Excluir pergunta ${index + 1}`} onClick={() => setQuestions((current) => current.filter((item) => item.clientId !== question.clientId))}>×</button>
      </article>)}</div>
      <div className="add-question-row"><select value={newType} onChange={(event) => setNewType(event.target.value as SurveyQuestionType)}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button type="button" onClick={() => addQuestion(newType)}>+ Adicionar pergunta</button></div>
    </section>

    <aside className="builder-aside">
      <section className="side-card"><span className="side-card-kicker">PUBLICAÇÃO</span><h3>Setores da nova versão</h3><div className="sector-picker">{organizationUnits.map((unit) => <div key={unit.id}><strong>{unit.name}</strong>{unit.sectors.map((sector) => <label className="check-row" key={sector.id}><input type="checkbox" checked={selectedSectorIds.includes(sector.id)} onChange={(event) => toggleSector(sector.id, event.target.checked)} /><span><strong>{sector.name}</strong><small>{sector.serviceType ?? "Setor assistencial"}</small></span></label>)}</div>)}</div><p>Ao substituir uma versão, novos QR Codes serão gerados e os anteriores deixarão de aceitar respostas.</p></section>
      <section className="side-card"><span className="side-card-kicker">IDENTIFICAÇÃO</span><h3>Configuração do paciente</h3><select value={identificationMode} onChange={(event) => setIdentificationMode(event.target.value as SurveyIdentificationMode)}><option value="ANONYMOUS">Sempre anônima</option><option value="OPTIONAL">Identificação opcional</option><option value="REQUIRED">Identificação obrigatória</option></select>{identificationMode !== "ANONYMOUS" ? <div className="identity-config">{[{ id: "name", label: "Nome" }, { id: "contact", label: "Contato" }, { id: "age", label: "Faixa etária" }, { id: "sex", label: "Sexo" }].map((field) => <label key={field.id}><input type="checkbox" checked={identificationFields.includes(field.id)} onChange={(event) => toggleIdentityField(field.id, event.target.checked)} /> {field.label}</label>)}</div> : null}</section>
      <section className="side-card"><span className="side-card-kicker">REGRAS</span><h3>Alertas e duplicidade</h3><label className="side-input"><span>Alertar com nota igual ou menor que</span><select value={alertThreshold} onChange={(event) => setAlertThreshold(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} estrela{value === 1 ? "" : "s"}</option>)}</select></label><label className="side-input"><span>Impedir nova resposta por</span><select value={duplicateWindowHours} onChange={(event) => setDuplicateWindowHours(Number(event.target.value))}><option value={1}>1 hora</option><option value={6}>6 horas</option><option value={12}>12 horas</option><option value={24}>24 horas</option><option value={72}>3 dias</option></select></label></section>
      <section className="side-card library-card"><span className="side-card-kicker">BIBLIOTECA</span><h3>Clonar pergunta</h3><div className="library-list">{library.map((question) => <article key={question.id}><span>{question.category}</span><p>{question.title}</p><button type="button" onClick={() => addQuestion(question.type, question)}>Clonar</button></article>)}</div></section>
      <div className="builder-actions"><button disabled={busy} type="button" className="button button-secondary" onClick={() => submit("save")}>{busy ? "Salvando..." : "Salvar rascunho"}</button><button disabled={busy} type="button" className="button button-primary" onClick={() => submit("publish")}>{busy ? "Publicando..." : "Publicar versão"}</button></div>
    </aside>
  </div>;
}
