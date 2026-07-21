"use client";

import { useState } from "react";

export function PatientSurvey() {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [identified, setIdentified] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <main className="survey-page survey-success"><div className="survey-success-mark">✓</div><span>RESPOSTA REGISTRADA NA PRÉVIA</span><h1>Obrigado por compartilhar sua experiência.</h1><p>Sua opinião ajuda o hospital a melhorar o atendimento para todos.</p><button onClick={() => setSubmitted(false)}>Voltar para a pesquisa</button></main>;
  }

  return (
    <main className="survey-page">
      <header className="survey-header"><span className="brand-mark">VP</span><div><strong>Pesquisa de satisfação</strong><small>Hospital principal</small></div></header>
      <div className="survey-progress"><span style={{ width: "35%" }} /><small>Pesquisa rápida · cerca de 2 minutos</small></div>
      <section className="survey-intro"><span>FISIOTERAPIA · UNIDADE CENDOR</span><h1>Como foi sua experiência conosco?</h1><p>As respostas serão utilizadas para melhorar a qualidade do atendimento.</p><div className="preview-warning">Esta é uma prévia: as respostas ainda não serão armazenadas.</div></section>
      <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <RatingQuestion number="1" title="Como você avalia o atendimento recebido?" value={ratings.attendance} onChange={(value) => setRatings({ ...ratings, attendance: value })} />
        <RatingQuestion number="2" title="As informações foram explicadas com clareza?" value={ratings.clarity} onChange={(value) => setRatings({ ...ratings, clarity: value })} />
        <RatingQuestion number="3" title="Como você avalia o tempo de espera?" value={ratings.wait} onChange={(value) => setRatings({ ...ratings, wait: value })} />
        <section className="survey-question"><div className="survey-question-title"><span>4</span><div><h2>O que poderíamos melhorar?</h2><p>Opcional</p></div></div><textarea rows={4} placeholder="Escreva seu comentário aqui..." /></section>
        <section className="identification-card"><div><span>IDENTIFICAÇÃO OPCIONAL</span><h2>Deseja se identificar?</h2><p>Seus dados serão usados somente para retorno sobre esta avaliação.</p></div><label className="toggle"><input type="checkbox" checked={identified} onChange={(event) => setIdentified(event.target.checked)} /><span /></label></section>
        {identified ? <section className="identity-fields"><label>Nome<input required placeholder="Seu nome" /></label><label>Faixa etária<select required defaultValue=""><option value="" disabled>Selecione</option><option>Até 17 anos</option><option>18 a 29 anos</option><option>30 a 44 anos</option><option>45 a 59 anos</option><option>60 anos ou mais</option></select></label><label className="consent-field"><input required type="checkbox" /> Autorizo o uso destes dados para contato relacionado a esta avaliação.</label></section> : null}
        <button className="survey-submit" disabled={!ratings.attendance || !ratings.clarity || !ratings.wait} type="submit">Enviar avaliação</button>
        <p className="privacy-note">Suas respostas são protegidas e tratadas conforme a política de privacidade do hospital.</p>
      </form>
    </main>
  );
}

function RatingQuestion({ number, title, value, onChange }: { number: string; title: string; value?: number; onChange: (value: number) => void }) {
  return <section className="survey-question"><div className="survey-question-title"><span>{number}</span><div><h2>{title}</h2><p>Obrigatória</p></div></div><div className="rating-scale">{[1, 2, 3, 4, 5].map((rating) => <button className={value === rating ? "rating-selected" : ""} type="button" aria-label={`${rating} estrela${rating > 1 ? "s" : ""}`} aria-pressed={value === rating} onClick={() => onChange(rating)} key={rating}><span>★</span><small>{rating}</small></button>)}</div><div className="rating-labels"><span>Muito insatisfeito</span><span>Muito satisfeito</span></div></section>;
}
