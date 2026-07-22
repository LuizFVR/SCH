import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicSurvey } from "../../../lib/surveys";
import { PublicPatientSurvey } from "./public-patient-survey";

export const metadata: Metadata = { title: "Pesquisa de satisfação" };
export const dynamic = "force-dynamic";

export default async function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const survey = await getPublicSurvey(token);
  if (!survey) notFound();
  return <PublicPatientSurvey survey={survey} />;
}
