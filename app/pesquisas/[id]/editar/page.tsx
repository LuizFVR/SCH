import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { requireRole } from "../../../../lib/auth";
import { listOrganizationUnits } from "../../../../lib/organization";
import { getSurveyLifecycleDetail } from "../../../../lib/survey-lifecycle";
import { listQuestionLibrary } from "../../../../lib/surveys";
import { SurveyEditor } from "./survey-editor";

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["ADMIN", "UNIT_MANAGER", "SECTOR_MANAGER"]);
  const { id } = await params;
  const survey = await getSurveyLifecycleDetail(user, id);
  if (!survey) notFound();
  if (!survey.hasDraft) redirect(`/pesquisas/${id}`);
  const [organizationUnits, library] = await Promise.all([listOrganizationUnits(user), listQuestionLibrary(user)]);

  return <AppShell
    active="pesquisas"
    eyebrow={`Edição · versão ${survey.draftVersion}`}
    title={survey.name}
    subtitle="Revise o rascunho e publique quando estiver pronto. Respostas anteriores serão preservadas."
    actions={<Link className="button button-secondary" href={`/pesquisas/${id}`}>Cancelar</Link>}
  >
    <SurveyEditor
      organizationUnits={organizationUnits}
      library={library}
      survey={{
        id: survey.id,
        name: survey.name,
        description: survey.description,
        version: survey.draftVersion ?? survey.displayedVersion,
        questions: survey.questions,
        identificationMode: survey.identificationMode,
        identificationFields: survey.identificationFields,
        sectorIds: survey.targets.filter((target) => target.active).map((target) => target.sectorId),
        alertThreshold: survey.alertThreshold,
        duplicateWindowHours: survey.duplicateWindowHours,
        replacesActiveVersion: survey.status !== "Rascunho",
      }}
    />
  </AppShell>;
}
