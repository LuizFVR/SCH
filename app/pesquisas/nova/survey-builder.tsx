"use client";

import { useState } from "react";

type Question = { id: number; title: string; type: "Estrelas" | "Texto livre" | "Múltipla escolha"; required: boolean };

const starterQuestions: Question[] = [
  { id: 1, title: "Como você avalia o atendimento recebido?", type: "Estrelas", required: true },
  { id: 2, title: "As informações foram explicadas com clareza?", type: "Estrelas", required: true },
  { id: 3, title: "O que poderíamos melhorar?", type: "Texto livre", required: false },
];

export function SurveyBuilder() {
  const [questions, setQuestions] = useState(starterQuestions);
  const [notice, setNotice] = useState("");

  function addQuestion(type: Question["type"], title?: string) {
    setQuestions((current) => [...current, { id: Date.now(), title: title ?? "Nova pergunta sem título", type, required: false }]);
    setNotice(title ? "Pergunta clonada da biblioteca." : "Nova pergunta adicionada.");
  }

  return (
    <div className="builder-layout">
      <section className="builder-main">
        {notice ? <div className="inline-notice" role="status">{notice}</div> : null}
        <div className="builder-section-header">
          <div><span>ETAPA 1 DE 3</span><h2>Perguntas da pesquisa</h2><p>As alterações futuras criarão uma nova versão após a primeira resposta.</p></div>
          <span className="question-count">{questions.length} perguntas</span>
        </div>
        <div className="question-stack">
          {questions.map((question, index) => (
            <article className="question-card" key={question.id}>
              <div className="drag-handle" aria-hidden="true">••</div>
              <div className="question-number">{index + 1}</div>
              <div className="question-content">
                <label><span>Pergunta</span><input value={question.title} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, title: event.target.value } : item))} /></label>
                <div className="question-options">
                  <span className="type-chip">{question.type}</span>
                  <label className="switch-label"><input type="checkbox" checked={question.required} onChange={(event) => setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, required: event.target.checked } : item))} /> Obrigatória</label>
                </div>
              </div>
              <button className="remove-button" aria-label={`Excluir pergunta ${index + 1}`} onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}>×</button>
            </article>
          ))}
        </div>
        <div className="add-question-row">
          <button onClick={() => addQuestion("Estrelas")}>+ Avaliação por estrelas</button>
          <button onClick={() => addQuestion("Texto livre")}>+ Resposta escrita</button>
          <button onClick={() => addQuestion("Múltipla escolha")}>+ Múltipla escolha</button>
        </div>
      </section>

      <aside className="builder-aside">
        <section className="side-card">
          <span className="side-card-kicker">PUBLICAÇÃO</span>
          <h3>Onde será aplicada?</h3>
          <label className="check-row"><input defaultChecked type="checkbox" /> <span><strong>Fisioterapia</strong><small>Unidade Cendor</small></span></label>
          <label className="check-row"><input defaultChecked type="checkbox" /> <span><strong>Fisioterapia</strong><small>Unidade Urgência</small></span></label>
          <button className="text-button">+ Adicionar setor</button>
        </section>
        <section className="side-card">
          <span className="side-card-kicker">IDENTIFICAÇÃO</span>
          <h3>Configuração do paciente</h3>
          <select defaultValue="optional"><option value="anonymous">Anônima</option><option value="optional">Identificação opcional</option><option value="required">Identificação obrigatória</option></select>
          <p>O consentimento será exibido antes dos campos pessoais.</p>
        </section>
        <section className="side-card library-card">
          <span className="side-card-kicker">BIBLIOTECA</span>
          <h3>Pergunta usada por outro setor</h3>
          <p>“Como você avalia o tempo de espera?”</p>
          <button onClick={() => addQuestion("Estrelas", "Como você avalia o tempo de espera?")}>Clonar pergunta</button>
        </section>
        <div className="builder-actions">
          <button className="button button-secondary" onClick={() => setNotice("Rascunho preparado nesta prévia. A persistência será conectada ao PostgreSQL.")}>Salvar rascunho</button>
          <button className="button button-primary" onClick={() => setNotice("A publicação será habilitada após conectarmos o banco e o controle de acesso.")}>Continuar</button>
        </div>
      </aside>
    </div>
  );
}
