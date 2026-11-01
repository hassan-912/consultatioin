// Copied unchanged from hassan-912/Visa-File-Strength-Calculator (lib/australia-gsm.ts, commit 94cb7f8). Edit there first.
// ─────────────────────────────────────────────────────────────────
// Australia General Skilled Migration (GSM) — Points Table
// Department of Home Affairs official criteria (Subclasses 189, 190, 491).
// Statutory cutoff: 65 points.
// ─────────────────────────────────────────────────────────────────

export type SubclassType = "189" | "190" | "491" | "";
export type AgeType = "18_24" | "25_32" | "33_39" | "40_44" | "45_plus" | "";
export type EnglishType = "competent" | "proficient" | "superior" | "";
export type OverseasExpType = "less_than_3" | "3_4_years" | "5_7_years" | "8_plus_years" | "";
export type AustralianExpType = "less_than_1" | "1_2_years" | "3_4_years" | "5_7_years" | "8_plus_years" | "";
export type QualificationType = "doctorate" | "bachelor_master" | "diploma_trade" | "recognized_award" | "none" | "";
export type PartnerSkillsType = "single_or_citizen" | "partner_skills_english" | "partner_english_only" | "none" | "";

export interface AustraliaGSMForm {
  /** Visa subclass: 189 (0 pts), 190 (5 pts), 491 (15 pts) */
  subclass: SubclassType;

  /** Age at time of invitation */
  age: AgeType;

  /** English language ability */
  english: EnglishType;

  /** Overseas skilled employment in nominated occupation (last 10 yrs) */
  overseasExp: OverseasExpType;

  /** Australian skilled employment in nominated occupation (last 10 yrs) */
  australianExp: AustralianExpType;

  /** Educational qualification (highest completed) */
  qualification: QualificationType;

  /** Specialist education qualification: Australian Master's by research or PhD in STEM/ICT */
  specialistEducation: boolean | null;

  /** Australian study requirement: 2+ academic years in Australia */
  australianStudy: boolean | null;

  /** Professional Year in Australia (Accounting, ICT, or Engineering) */
  professionalYear: boolean | null;

  /** Credentialled Community Language (CCL / NAATI accredited) */
  communityLanguage: boolean | null;

  /** Study in designated regional Australia */
  regionalStudy: boolean | null;

  /** Partner skills */
  partnerSkills: PartnerSkillsType;
}

export interface AustraliaGSMBreakdown {
  subclassScore: number;
  ageScore: number;
  englishScore: number;
  overseasExpScore: number;
  australianExpScore: number;
  /** Overseas + Australian employment combined, capped at 20 */
  combinedEmploymentScore: number;
  /** Any deduction applied due to the 20-point combined employment cap */
  employmentCappedDeduction: number;
  qualificationScore: number;
  specialistEducationScore: number;
  australianStudyScore: number;
  professionalYearScore: number;
  communityLanguageScore: number;
  regionalStudyScore: number;
  partnerSkillsScore: number;
  total: number;
  isEligible: boolean;
}

// ── Points lookup tables ──────────────────────────────────────────

export const SUBCLASS_POINTS: Record<string, number> = {
  "189": 0,
  "190": 5,
  "491": 15,
};

export const AGE_POINTS: Record<string, number> = {
  "18_24": 25,
  "25_32": 30,
  "33_39": 25,
  "40_44": 15,
  "45_plus": 0,
};

export const ENGLISH_POINTS: Record<string, number> = {
  "competent": 0,
  "proficient": 10,
  "superior": 20,
};

export const OVERSEAS_EXP_POINTS: Record<string, number> = {
  "less_than_3": 0,
  "3_4_years": 5,
  "5_7_years": 10,
  "8_plus_years": 15,
};

export const AUSTRALIAN_EXP_POINTS: Record<string, number> = {
  "less_than_1": 0,
  "1_2_years": 5,
  "3_4_years": 10,
  "5_7_years": 15,
  "8_plus_years": 20,
};

export const QUALIFICATION_POINTS: Record<string, number> = {
  "doctorate": 20,
  "bachelor_master": 15,
  "diploma_trade": 10,
  "recognized_award": 10,
  "none": 0,
};

export const PARTNER_POINTS: Record<string, number> = {
  "single_or_citizen": 10,
  "partner_skills_english": 10,
  "partner_english_only": 5,
  "none": 0,
};

// ── Default Initial Form (All fields unselected) ─────────────────

export const DEFAULT_AUSTRALIA_GSM_FORM: AustraliaGSMForm = {
  subclass: "",
  age: "",
  english: "",
  overseasExp: "",
  australianExp: "",
  qualification: "",
  specialistEducation: null,
  australianStudy: null,
  professionalYear: null,
  communityLanguage: null,
  regionalStudy: null,
  partnerSkills: "",
};

// ── Calculation Engine ────────────────────────────────────────────

export function calculateAustraliaGSM(form: AustraliaGSMForm): AustraliaGSMBreakdown {
  const subclassScore = form.subclass ? (SUBCLASS_POINTS[form.subclass] ?? 0) : 0;
  const ageScore = form.age ? (AGE_POINTS[form.age] ?? 0) : 0;
  const englishScore = form.english ? (ENGLISH_POINTS[form.english] ?? 0) : 0;

  const overseasExpScore = form.overseasExp ? (OVERSEAS_EXP_POINTS[form.overseasExp] ?? 0) : 0;
  const australianExpScore = form.australianExp ? (AUSTRALIAN_EXP_POINTS[form.australianExp] ?? 0) : 0;

  // CRITICAL LOGIC: Combined Overseas + Australian skilled employment strictly capped at 20 points
  const rawEmployment = overseasExpScore + australianExpScore;
  const combinedEmploymentScore = Math.min(20, rawEmployment);
  const employmentCappedDeduction = rawEmployment - combinedEmploymentScore;

  const qualificationScore = form.qualification ? (QUALIFICATION_POINTS[form.qualification] ?? 0) : 0;
  const specialistEducationScore = form.specialistEducation === true ? 10 : 0;
  const australianStudyScore = form.australianStudy === true ? 5 : 0;
  const professionalYearScore = form.professionalYear === true ? 5 : 0;
  const communityLanguageScore = form.communityLanguage === true ? 5 : 0;
  const regionalStudyScore = form.regionalStudy === true ? 5 : 0;
  const partnerSkillsScore = form.partnerSkills ? (PARTNER_POINTS[form.partnerSkills] ?? 0) : 0;

  const total =
    subclassScore +
    ageScore +
    englishScore +
    combinedEmploymentScore +
    qualificationScore +
    specialistEducationScore +
    australianStudyScore +
    professionalYearScore +
    communityLanguageScore +
    regionalStudyScore +
    partnerSkillsScore;

  const isEligible = total >= 65;

  return {
    subclassScore,
    ageScore,
    englishScore,
    overseasExpScore,
    australianExpScore,
    combinedEmploymentScore,
    employmentCappedDeduction,
    qualificationScore,
    specialistEducationScore,
    australianStudyScore,
    professionalYearScore,
    communityLanguageScore,
    regionalStudyScore,
    partnerSkillsScore,
    total,
    isEligible,
  };
}

// ── Status assessment helper ──────────────────────────────────────

export function getAustraliaGSMStatus(total: number) {
  if (total >= 85) {
    return {
      label: "Highly Competitive",
      color: "#16A34A",
      emoji: "🟢",
      description: "Outstanding profile with strong likelihood of receiving an Invitation to Apply (ITA) across Subclasses 189, 190, and 491.",
    };
  }
  if (total >= 75) {
    return {
      label: "Competitive",
      color: "#2563EB",
      emoji: "🔵",
      description: "Strong points total. Highly competitive for Subclass 190 State Nomination and regional 491 visa pathways.",
    };
  }
  if (total >= 65) {
    return {
      label: "Eligible (Meets Cutoff)",
      color: "#EA580C",
      emoji: "🟡",
      description: "You meet the Department of Home Affairs statutory minimum of 65 points. State sponsorship or strategic language boosts recommended.",
    };
  }
  return {
    label: "Below 65 Points",
    color: "#DC2626",
    emoji: "🔴",
    description: "You need at least 65 points to lodge an Expression of Interest (EOI) on SkillSelect. Review language or nomination pathways to reach 65.",
  };
}

// ── Option metadata for UI rendering ──────────────────────────────

export interface GSMOptionMeta<T> {
  value: T;
  label: string;
  points: number;
  badge: string;
  description: string;
}

export const GSM_SUBCLASS_OPTIONS: GSMOptionMeta<"189" | "190" | "491">[] = [
  {
    value: "189",
    label: "Skilled Independent (Subclass 189)",
    points: 0,
    badge: "0 pts",
    description: "Permanent residency without state or family sponsorship. Live and work anywhere in Australia.",
  },
  {
    value: "190",
    label: "Skilled Nominated (Subclass 190)",
    points: 5,
    badge: "+5 pts",
    description: "Permanent residency nominated by an Australian State or Territory government.",
  },
  {
    value: "491",
    label: "Skilled Work Regional (Subclass 491)",
    points: 15,
    badge: "+15 pts",
    description: "Provisional 5-year visa nominated by a state government or sponsored by an eligible regional family member.",
  },
];

export const GSM_AGE_OPTIONS: GSMOptionMeta<"18_24" | "25_32" | "33_39" | "40_44" | "45_plus">[] = [
  {
    value: "18_24",
    label: "18–24 years",
    points: 25,
    badge: "25 pts",
    description: "At least 18 but under 25 years of age at time of invitation.",
  },
  {
    value: "25_32",
    label: "25–32 years",
    points: 30,
    badge: "30 pts",
    description: "At least 25 but under 33 years of age (highest points bracket).",
  },
  {
    value: "33_39",
    label: "33–39 years",
    points: 25,
    badge: "25 pts",
    description: "At least 33 but under 40 years of age at time of invitation.",
  },
  {
    value: "40_44",
    label: "40–44 years",
    points: 15,
    badge: "15 pts",
    description: "At least 40 but under 45 years of age at time of invitation.",
  },
  {
    value: "45_plus",
    label: "45 years or older",
    points: 0,
    badge: "0 pts",
    description: "Candidates 45 or older are ineligible to receive an invitation under GSM regulations.",
  },
];

export const GSM_ENGLISH_OPTIONS: GSMOptionMeta<"competent" | "proficient" | "superior">[] = [
  {
    value: "competent",
    label: "Competent English",
    points: 0,
    badge: "0 pts",
    description: "IELTS 6.0 in each band, PTE Academic 50 in each band, or passport holder of UK, USA, Canada, NZ, Ireland.",
  },
  {
    value: "proficient",
    label: "Proficient English",
    points: 10,
    badge: "+10 pts",
    description: "IELTS 7.0 in each band, PTE Academic 65 in each band, or Cambridge CAE 185.",
  },
  {
    value: "superior",
    label: "Superior English",
    points: 20,
    badge: "+20 pts",
    description: "IELTS 8.0 in each band, PTE Academic 79 in each band, or Cambridge CAE 200.",
  },
];

export const GSM_OVERSEAS_EXP_OPTIONS: GSMOptionMeta<"less_than_3" | "3_4_years" | "5_7_years" | "8_plus_years">[] = [
  {
    value: "less_than_3",
    label: "Less than 3 years",
    points: 0,
    badge: "0 pts",
    description: "Less than 36 months of skilled employment outside Australia in the past 10 years.",
  },
  {
    value: "3_4_years",
    label: "3 to 4 years",
    points: 5,
    badge: "+5 pts",
    description: "At least 3 but less than 5 years of skilled employment outside Australia in the past 10 years.",
  },
  {
    value: "5_7_years",
    label: "5 to 7 years",
    points: 10,
    badge: "+10 pts",
    description: "At least 5 but less than 8 years of skilled employment outside Australia in the past 10 years.",
  },
  {
    value: "8_plus_years",
    label: "8 or more years",
    points: 15,
    badge: "+15 pts",
    description: "At least 8 years of skilled employment outside Australia in the past 10 years.",
  },
];

export const GSM_AUSTRALIAN_EXP_OPTIONS: GSMOptionMeta<"less_than_1" | "1_2_years" | "3_4_years" | "5_7_years" | "8_plus_years">[] = [
  {
    value: "less_than_1",
    label: "Less than 1 year",
    points: 0,
    badge: "0 pts",
    description: "Less than 12 months of skilled employment in Australia in the past 10 years.",
  },
  {
    value: "1_2_years",
    label: "1 to 2 years",
    points: 5,
    badge: "+5 pts",
    description: "At least 1 but less than 3 years of skilled employment in Australia in the past 10 years.",
  },
  {
    value: "3_4_years",
    label: "3 to 4 years",
    points: 10,
    badge: "+10 pts",
    description: "At least 3 but less than 5 years of skilled employment in Australia in the past 10 years.",
  },
  {
    value: "5_7_years",
    label: "5 to 7 years",
    points: 15,
    badge: "+15 pts",
    description: "At least 5 but less than 8 years of skilled employment in Australia in the past 10 years.",
  },
  {
    value: "8_plus_years",
    label: "8 or more years",
    points: 20,
    badge: "+20 pts",
    description: "At least 8 years of skilled employment in Australia in the past 10 years.",
  },
];

export const GSM_QUALIFICATION_OPTIONS: GSMOptionMeta<"doctorate" | "bachelor_master" | "diploma_trade" | "recognized_award" | "none">[] = [
  {
    value: "doctorate",
    label: "Doctorate / PhD Degree",
    points: 20,
    badge: "20 pts",
    description: "Doctorate from an Australian educational institution or other doctorate of a recognized standard.",
  },
  {
    value: "bachelor_master",
    label: "Bachelor or Master's Degree",
    points: 15,
    badge: "15 pts",
    description: "Bachelor or Master's degree from an Australian institution or recognized overseas standard.",
  },
  {
    value: "diploma_trade",
    label: "Australian Diploma or Trade Qualification",
    points: 10,
    badge: "10 pts",
    description: "Diploma or trade qualification completed at an Australian institution.",
  },
  {
    value: "recognized_award",
    label: "Recognized Award / Assessment Qualification",
    points: 10,
    badge: "10 pts",
    description: "Qualification recognized by the relevant assessing authority for your nominated occupation.",
  },
  {
    value: "none",
    label: "No Recognized Qualification",
    points: 0,
    badge: "0 pts",
    description: "No completed qualification meeting the Department of Home Affairs recognition criteria.",
  },
];

export const GSM_PARTNER_OPTIONS: GSMOptionMeta<"single_or_citizen" | "partner_skills_english" | "partner_english_only" | "none">[] = [
  {
    value: "single_or_citizen",
    label: "Single OR Partner is Aus Citizen / PR",
    points: 10,
    badge: "+10 pts",
    description: "You do not have a spouse/partner, OR your partner is an Australian Citizen or Permanent Resident.",
  },
  {
    value: "partner_skills_english",
    label: "Partner with Competent English + Positive Skills Assessment",
    points: 10,
    badge: "+10 pts",
    description: "Partner is an applicant, under 45, has competent English, and holds a positive skills assessment in an eligible list.",
  },
  {
    value: "partner_english_only",
    label: "Partner with Competent English Only",
    points: 5,
    badge: "+5 pts",
    description: "Partner is an applicant and holds at least competent English (no skills assessment required).",
  },
  {
    value: "none",
    label: "Partner without Competent English / None of the above",
    points: 0,
    badge: "0 pts",
    description: "Partner does not have competent English or does not meet skills assessment criteria.",
  },
];
