"use client";

import { useState } from "react";
import type { PublicSurvey, PublicSurveyQuestion } from "../../../lib/survey-types";

type AnswerMap = Record<string, string | number | boolean | string[]>;
type IdentityState = { name: string; contact: string; age: string; sex: string; consent: boolean };

function hasAnswer(question: PublicSurveyQuestion, value: AnswerMap[string] | undefined) {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function PublicPatientSurvey({ survey }: { survey: PublicSurvey }) {
  const identificationRequired = survey.identificationMode === "REQUIRED";
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [identified, setIdentified] = useState(identificationRequired);
  const [identity, setIdentity] = useState<IdentityState>({ name: "", contact: "", age: "", sex: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function updateAnswer(questionId: string, value: AnswerMap[string]) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setError("");
  }

  function toggleMultiple(questionId: string, option: string, checked: boolean) {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as string[] : [];
    updateAnswer(questionId, checked ? [...new Set([...current, option])] : current.filter((value) => value !== option));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingQuestion = survey.questions.find((question) => question.required && !hasAnswer(question, answers[question.id]));
    if (missingQuestion) {
      setError(`Responda a pergunta obrigatória: “${missingQuestion.title}”.`);
      document.getElementById(`question-${missingQuestion.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (identified) {
      const missingField = survey.identificationFields.find((field) => !identity[field as keyof IdentityState]);
      if (missingField || !identity.consent) {
        setError("Preencha os campos de identificação e confirme o consentimento.");
        return;
      }
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/public/responses/${survey.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: survey.questions.map((question) => ({ questionId: question.id, value: answers[question.id] })),
          identity: identified ? identity : null,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar sua avaliação.");
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Não foi possível enviar sua avaliação.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <main className="survey-page survey-success"><div className="survey-success-mark">✓</div><span>RESPOSTA REGISTRADA</span><h1>Obrigado por compartilhar sua experiência.</h1><p>Sua opinião ajuda o hospital a melhorar o atendimento para todos.</p></main>;
  }

  return (
    <main className="survey-page">
      <header className="survey-header"><span className="brand-mark">VP</span><div><strong>Pesquisa de satisfação</strong><small>{survey.hospitalName}</small></div></header>
      <div className="survey-progress"><span style={{ width: "100%" }} /><small>Pesquisa rápida · cerca de 2 minutos</small></div>
      <section className="survey-intro"><span>{survey.sectorName.toUpperCase()} · {survey.unitName.toUpperCase()}</span><h1>{survey.surveyName}</h1><p>{survey.description ?? "As respostas serão utilizadas para melhorar a qualidade do atendimento."}</p></section>

      <form onSubmit={submit}>
        {survey.questions.map((question, index) => <QuestionField question={question} number={index + 1} value={answers[question.id]} updateAnswer={updateAnswer} toggleMultiple={toggleMultiple} key={question.id} />)}

        {survey.identificationMode === "OPTIONAL" ? <section className="identification-card"><div><span>IDENTIFICAÇÃO OPCIONAL</span><h2>Deseja se identificar?</h2><p>Seus dados serão usados somente para retorno sobre esta avaliação.</p></div><label className="toggle"><input type="checkbox" checked={identified} onChange={(event) => setIdentified(event.target.checked)} /><span /></label></section> : null}
        {survey.identificationMode === "REQUIRED" ? <section className="identification-card"><div><span>IDENTIFICAÇÃO SOLICITADA</span><h2>Dados do paciente</h2><p>O setor solicitou identificação nesta pesquisa. Os dados serão armazenados de forma criptografada.</p></div></section> : null}

        {identified ? <section className="identity-fields">
          {survey.identificationFields.includes("name") ? <label>Nome<input required value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} placeholder="Seu nome" /></label> : null}
          {survey.identificationFields.includes("contact") ? <label>Telefone ou e-mail<input required value={identity.contact} onChange={(event) => setIdentity({ ...identity, contact: event.target.value })} placeholder="Como podemos entrar em contato?" /></label> : null}
          {survey.identificationFields.includes("age") ? <label>Faixa etária<select required value={identity.age} onChange={(event) => setIdentity({ ...identity, age: event.target.value })}><option value="" disabled>Selecione</option><option>Até 17 anos</option><option>18 a 29 anos</option><option>30 a 44 anos</option><option>45 a 59 anos</option><option>60 anos ou mais</option></select></label> : null}
          {survey.identificationFields.includes("sex") ? <label>Sexo<select required value={identity.sex} onChange={(event) => setIdentity({ ...identity, sex: event.target.value })}><option value="" disabled>Selecione</option><option value="Feminino">Feminino</option><option value="Masculino">Masculino</option><option value="Outro">Outro</option><option value="Prefiro não informar">Prefiro não informar</option></select></label> : null}
          <label className="consent-field"><input required type="checkbox" checked={identity.consent} onChange={(event) => setIdentity({ ...identity, consent: event.target.checked })} /> {survey.consentText ?? "Autorizo o uso dos dados informados para contato relacionado a esta avaliação."}</label>
        </section> : null}

        {error ? <div className="survey-error" role="alert">{error}</div> : null}
        <button className="survey-submit" disabled={busy} type="submit">{busy ? "Enviando..." : "Enviar avaliação"}</button>
        <p className="privacy-note">Suas respostas são protegidas e tratadas conforme a política de privacidade do hospital.</p>
      </form>
    </main>
  );
}

function QuestionField({
  question,
  number,
  value,
  updateAnswer,
  toggleMultiple,
}: {
  question: PublicSurveyQuestion;
  number: number;
  value: AnswerMap[string] | undefined;
  updateAnswer: (questionId: string, value: AnswerMap[string]) => void;
  toggleMultiple: (questionId: string, option: string, checked: boolean) => void;
}) {
  return <section className="survey-question" id={`question-${question.id}`}>
    <div className="survey-question-title"><span>{number}</span><div><h2>{question.title}</h2><p>{question.required ? "Obrigatória" : "Opcional"}</p></div></div>
    {question.type === "STARS" ? <><div className="rating-scale">{[1, 2, 3, 4, 5].map((rating) => <button className={value === rating ? "rating-selected" : ""} type="button" aria-label={`${rating} estrela${rating > 1 ? "s" : ""}`} aria-pressed={value === rating} onClick={() => updateAnswer(question.id, rating)} key={rating}><span>★</span><small>{rating}</small></button>)}</div><div className="rating-labels"><span>Muito insatisfeito</span><span>Muito satisfeito</span></div></> : null}
    {question.type === "NPS" ? <div className="nps-scale">{Array.from({ length: 11 }, (_, score) => <button className={value === score ? "choice-selected" : ""} type="button" onClick={() => updateAnswer(question.id, score)} aria-pressed={value === score} key={score}>{score}</button>)}</div> : null}
    {question.type === "YES_NO" ? <div className="binary-scale"><button className={value === true ? "choice-selected" : ""} type="button" onClick={() => updateAnswer(question.id, true)}>Sim</button><button className={value === false ? "choice-selected" : ""} type="button" onClick={() => updateAnswer(question.id, false)}>Não</button></div> : null}
    {question.type === "SINGLE_CHOICE" ? <div className="survey-choice-list">{question.options.map((option) => <label key={option}><input type="radio" name={question.id} checked={value === option} onChange={() => updateAnswer(question.id, option)} /> {option}</label>)}</div> : null}
    {question.type === "MULTIPLE_CHOICE" ? <div className="survey-choice-list">{question.options.map((option) => <label key={option}><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={(event) => toggleMultiple(question.id, option, event.target.checked)} /> {option}</label>)}</div> : null}
    {question.type === "SHORT_TEXT" ? <input className="survey-text-input" maxLength={500} value={typeof value === "string" ? value : ""} onChange={(event) => updateAnswer(question.id, event.target.value)} placeholder="Escreva sua resposta" /> : null}
    {question.type === "LONG_TEXT" ? <textarea rows={4} maxLength={3000} value={typeof value === "string" ? value : ""} onChange={(event) => updateAnswer(question.id, event.target.value)} placeholder="Escreva seu comentário aqui..." /> : null}
  </section>;
}
