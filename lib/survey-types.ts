export const QUESTION_TYPES = [
  "STARS",
  "NPS",
  "YES_NO",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
] as const;

export type SurveyQuestionType = (typeof QUESTION_TYPES)[number];
export type SurveyIdentificationMode = "ANONYMOUS" | "OPTIONAL" | "REQUIRED";

export type SurveyQuestionInput = {
  clientId: string;
  sourceQuestionId?: string;
  title: string;
  type: SurveyQuestionType;
  required: boolean;
  options?: string[];
};

export type CreateSurveyInput = {
  name: string;
  description?: string;
  questions: SurveyQuestionInput[];
  sectorIds: string[];
  identificationMode: SurveyIdentificationMode;
  identificationFields: string[];
  alertThreshold: number;
  duplicateWindowHours: number;
  intent: "draft" | "publish";
};

export type PublicSurveyQuestion = {
  id: string;
  title: string;
  type: SurveyQuestionType;
  required: boolean;
  options: string[];
};

export type PublicSurvey = {
  token: string;
  hospitalName: string;
  surveyName: string;
  description: string | null;
  unitName: string;
  sectorName: string;
  identificationMode: SurveyIdentificationMode;
  identificationFields: string[];
  consentText: string | null;
  questions: PublicSurveyQuestion[];
};
