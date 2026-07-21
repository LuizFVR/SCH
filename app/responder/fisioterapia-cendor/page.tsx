import type { Metadata } from "next";
import { PatientSurvey } from "./patient-survey";

export const metadata: Metadata = { title: "Pesquisa de satisfação" };

export default function PatientSurveyPage() {
  return <PatientSurvey />;
}
