"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OrganizationUnit } from "../../../lib/organization";
import type { QuestionLibraryItem } from "../../../lib/surveys";
import type { SurveyIdentificationMode, SurveyQuestionInput, SurveyQuestionType } from "../../../lib/survey-types";

const typeLabels: Record<SurveyQuestionType, string> = {
  STARS: "Avaliação por estrelas",
  NPS: "Escala de 0 a 10",
  YES_NO: "Sim ou não",
  SINGLE_CHOICE: "Escolha única",
  MULTIPLE_CHOICE: "Múltipla escolha",
  SHORT_TEXT: "Texto curto",
  LONG_TEXT: "Texto longo",
};

const starterQuestions: SurveyQuestionInput[] = [
  { clientId: "starter-attendance", title: "Como você avalia o atendimento recebido?", type: "STARS", required: true, options: [] },
  { clientId: "starter-clarity", title: "As informações foram explicadas com clareza?", type: "STARS", required: true, options: [] },
  { clientId: "starter-improvement", title: "O que poderíamos melhorar?", type: "LONG_TEXT", required: false, options: [] },
];

function newClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `question-${Date.now()}-${Math.random()}`;
}

export function SurveyBuilder({
  organizationUnits,
  library,
  demoMode,
}: {
  organizationUnits: OrganizationUnit[];
  library: QuestionLibraryItem[];
  demoMode: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("Experiência pós-atendimento");
  const [description, setDescription] = useState("Conte como foi sua experiência. Suas respostas ajudam a melhorar o atendimento.");
  const [questions, setQuestions] = useState(starterQuestions);
  const [newType, setNewType] = useState<SurveyQuestionType>("STARS");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [identificationMode, setIdentificationMode] = useState<SurveyIdentificationMode>("OPTIONAL");
  const [identificationFields, setIdentificationFields] = useState(["name", "contact", "age", "sex"]);
  const [alertThreshold, setAlertThreshold] = useState(2);
  const [duplicateWindowHours, setDuplicateWindowHours] = useState(12);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedCount = useMemo(() => selectedSectorIds.length, [selectedSectorIds]);

  function addQuestion(type: SurveyQuestionType, libraryQuestion?: QuestionLibraryItem) {
    const choiceType = type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";
    setQuestions((current) => [...current, {
      clientId: newClientId(),
      sourceQuestionId: libraryQuestion?.id,
      title: libraryQuestion?.title ?? "Nova pergunta",
      type,
      required: false,
      options: libraryQuestion?.options.length ? libraryQuestion.options : choiceType ? ["Opção 1", "Opção 2"] : [],
    }]);
    setNotice(libraryQuestion ? "Pergunta clonada. Você pode editar esta cópia sem alterar a original." : "Nova pergunta adicionada.");
    setError("");
  }

  function updateQuestion(clientId: string, changes: Partial<SurveyQuestionInput>) {
    setQuestions((current) => current.map((question) => question.clientId === clientId ? { ...question, ...changes } : question));
  }

  function toggleSector(sectorId: string, checked: boolean) {
    setSelectedSectorIds((current) => checked ? [...new Set([...current, sectorId])] : current.filter((id) => id !== sectorId));
  }

  function toggleIdentificationField(field: string, checked: boolean) {
    setIdentificationFields((current) => checked ? [...new Set([...current, field])] : current.filter((item) => item !== field));
  }

  async function submit(intent: "draft" | "publish") {
    setError("");
    setNotice("");
    if (demoMode) {
      setNotice("O formulário está funcional, mas a gravação exige o PostgreSQL. No servidor Debian, desative AUTH_DEMO_MODE para publicar.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          questions,
          sectorIds: selectedSectorIds,
          identificationMode,
          identificationFields,
          alertThreshold,
          duplicateWindowHours,
          intent,
        }),
      });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Não foi possível salvar a pesquisa.");
      router.push(`/pesquisas/${result.id}`);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Não foi possível salvar a pesquisa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="builder-layout">
      <section className="builder-main">
        {notice ? <div className="inline-notice" role="status">{notice}</div> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="survey-basics">
          <label><span>Nome da pesquisa</span><input maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Texto de apresentação</span><textarea rows={3} maxLength={1500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>

        <div className="builder-section-header">
          <div><span>ETAPA 1 DE 3</span><h2>Perguntas da pesquisa</h2><p>Após receber respostas, futuras alterações deverão gerar uma nova versão.</p></div>
          <span className="question-count">{questions.length} pergunta{questions.length === 1 ? "" : "s"}</span>
        </div>

        <div className="question-stack">
          {questions.map((question, index) => (
            <article className="question-card" key={question.clientId}>
              <div className="drag-handle" aria-hidden="true">••</div>
              <div className="question-number">{index + 1}</div>
              <div className="question-content">
                <label><span>Pergunta</span><input maxLength={500} value={question.title} onChange={(event) => updateQuestion(question.clientId, { title: event.target.value })} /></label>
                <div className="question-options">
                  <label className="type-select"><span>Tipo</span><select value={question.type} onChange={(event) => {
                    const type = event.target.value as SurveyQuestionType;
                    updateQuestion(question.clientId, { type, options: type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE" ? question.options?.length ? question.options : ["Opção 1", "Opção 2"] : [] });
                  }}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label className="switch-label"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.clientId, { required: event.target.checked })} /> Obrigatória</label>
                </div>
                {(question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") ? (
                  <label className="choice-editor"><span>Opções (uma por linha)</span><textarea rows={3} value={(question.options ?? []).join("\n")} onChange={(event) => updateQuestion(question.clientId, { options: event.target.value.split("\n") })} /></label>
                ) : null}
              </div>
              <button type="button" className="remove-button" aria-label={`Excluir pergunta ${index + 1}`} onClick={() => setQuestions((current) => current.filter((item) => item.clientId !== question.clientId))}>×</button>
            </article>
          ))}
        </div>

        <div className="add-question-row">
          <select aria-label="Tipo da nova pergunta" value={newType} onChange={(event) => setNewType(event.target.value as SurveyQuestionType)}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <button type="button" onClick={() => addQuestion(newType)}>+ Adicionar pergunta</button>
        </div>
      </section>

      <aside className="builder-aside">
        <section className="side-card">
          <span className="side-card-kicker">PUBLICAÇÃO · {selectedCount} SELECIONADO{selectedCount === 1 ? "" : "S"}</span>
          <h3>Onde será aplicada?</h3>
          <div className="sector-picker">
            {organizationUnits.map((unit) => (
              <div key={unit.id}><strong>{unit.name}</strong>{unit.sectors.map((sector) => (
                <label className="check-row" key={sector.id}><input type="checkbox" checked={selectedSectorIds.includes(sector.id)} onChange={(event) => toggleSector(sector.id, event.target.checked)} /><span><strong>{sector.name}</strong><small>{sector.serviceType ?? "Setor assistencial"}</small></span></label>
              ))}</div>
            ))}
          </div>
          <p>Cada setor selecionado receberá um QR Code próprio para separar os resultados.</p>
        </section>

        <section className="side-card">
          <span className="side-card-kicker">IDENTIFICAÇÃO</span>
          <h3>Configuração do paciente</h3>
          <select value={identificationMode} onChange={(event) => setIdentificationMode(event.target.value as SurveyIdentificationMode)}><option value="ANONYMOUS">Sempre anônima</option><option value="OPTIONAL">Identificação opcional</option><option value="REQUIRED">Identificação obrigatória</option></select>
          {identificationMode !== "ANONYMOUS" ? <div className="identity-config">
            {[{ id: "name", label: "Nome" }, { id: "contact", label: "Telefone ou e-mail" }, { id: "age", label: "Faixa etária" }, { id: "sex", label: "Sexo" }].map((field) => <label key={field.id}><input type="checkbox" checked={identificationFields.includes(field.id)} onChange={(event) => toggleIdentificationField(field.id, event.target.checked)} /> {field.label}</label>)}
          </div> : null}
          <p>Quando houver identificação, o consentimento será solicitado e os dados serão criptografados.</p>
        </section>

        <section className="side-card">
          <span className="side-card-kicker">REGRAS</span>
          <h3>Alertas e duplicidade</h3>
          <label className="side-input"><span>Alertar com nota igual ou menor que</span><select value={alertThreshold} onChange={(event) => setAlertThreshold(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} estrela{value === 1 ? "" : "s"}</option>)}</select></label>
          <label className="side-input"><span>Impedir nova resposta por</span><select value={duplicateWindowHours} onChange={(event) => setDuplicateWindowHours(Number(event.target.value))}><option value={1}>1 hora</option><option value={6}>6 horas</option><option value={12}>12 horas</option><option value={24}>24 horas</option><option value={72}>3 dias</option></select></label>
        </section>

        <section className="side-card library-card">
          <span className="side-card-kicker">BIBLIOTECA COMPARTILHADA</span>
          <h3>Clonar pergunta de outro setor</h3>
          <div className="library-list">{library.map((question) => <article key={question.id}><span>{question.category}</span><p>{question.title}</p><button type="button" onClick={() => addQuestion(question.type, question)}>Clonar</button></article>)}</div>
        </section>

        <div className="builder-actions">
          <button disabled={busy} type="button" className="button button-secondary" onClick={() => submit("draft")}>{busy ? "Salvando..." : "Salvar rascunho"}</button>
          <button disabled={busy} type="button" className="button button-primary" onClick={() => submit("publish")}>{busy ? "Publicando..." : "Publicar e gerar QR"}</button>
        </div>
      </aside>
    </div>
  );
}
