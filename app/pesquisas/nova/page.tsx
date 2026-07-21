import { AppShell } from "../../components/AppShell";
import { SurveyBuilder } from "./survey-builder";

export default function NewSurveyPage() {
  return (
    <AppShell active="pesquisas" eyebrow="Nova pesquisa" title="Experiência pós-atendimento" subtitle="Monte o questionário e escolha onde ele será publicado.">
      <SurveyBuilder />
    </AppShell>
  );
}
