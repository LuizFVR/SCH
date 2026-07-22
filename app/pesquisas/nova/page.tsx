import { AppShell } from "../../components/AppShell";
import { requireRole } from "../../../lib/auth";
import { isDemoMode } from "../../../lib/database";
import { listOrganizationUnits } from "../../../lib/organization";
import { listQuestionLibrary } from "../../../lib/surveys";
import { SurveyBuilder } from "./survey-builder";

export default async function NewSurveyPage() {
  const user = await requireRole(["ADMIN", "UNIT_MANAGER", "SECTOR_MANAGER"]);
  const [organizationUnits, library] = await Promise.all([listOrganizationUnits(user), listQuestionLibrary(user)]);

  return (
    <AppShell active="pesquisas" eyebrow="Nova pesquisa" title="Criar pesquisa" subtitle="Monte o questionário, defina a identificação e gere um QR Code diferente para cada setor.">
      <SurveyBuilder organizationUnits={organizationUnits} library={library} demoMode={isDemoMode()} />
    </AppShell>
  );
}
