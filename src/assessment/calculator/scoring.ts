// Copied unchanged from hassan-912/Visa-File-Strength-Calculator (lib/scoring.ts, commit 94cb7f8). Edit there first.
// --- Scoring Data Model ---
// IMPORTANT: Percentage scores are NEVER shown in the UI.
// These weights are internal calculation values only.
// Age is now a radio-button category (age_bracket) - no separate number input.

export interface Option {
  id: string;
  label: string;
  value: number;
}

export interface Category {
  id: string;
  title: string;
  icon: string;
  description: string;
  maxScore: number;
  inputType?: "radio" | "checkbox";
  options: Option[];
}

export interface Penalty {
  id: string;
  label: string;
  description: string;
  deduction: number;
}

export const CATEGORIES: Category[] = [
  {
    id: "age_bracket",
    title: "Age",
    icon: "🧑",
    description: "Select your current age bracket",
    maxScore: 4,
    inputType: "radio",
    options: [
      { id: "age_opt_1", label: "18-24 years", value: 3 },
      { id: "age_opt_2", label: "25-44 years", value: 4 },
      { id: "age_opt_3", label: "45+ years", value: 4 },
    ],
  },
  {
    id: "education",
    title: "Education Level",
    icon: "🎓",
    description: "Select your highest completed academic qualification",
    maxScore: 9,
    inputType: "radio",
    options: [
      { id: "edu_opt_1", label: "Higher Education", value: 9 },
      { id: "edu_opt_2", label: "Intermediate", value: 6 },
      { id: "edu_opt_3", label: "No qualification", value: 0 },
    ],
  },
  {
    id: "employment",
    title: "Employment Status",
    icon: "💼",
    description: "Select your current employment situation",
    maxScore: 5,
    inputType: "radio",
    options: [
      { id: "emp_opt_1", label: "Employed in a company for 1+ year", value: 5 },
      { id: "emp_opt_2", label: "Business owner for 6+ months", value: 5 },
      { id: "emp_opt_3", label: "Employed in a company for less than 1 year", value: 0 },
    ],
  },
  {
    id: "marital",
    title: "Marital Status & Social Ties",
    icon: "💍",
    description: "Select your marital status",
    maxScore: 5,
    inputType: "radio",
    options: [
      { id: "mar_opt_1", label: "Married with children", value: 5 },
      { id: "mar_opt_2", label: "Married without children", value: 3 },
      { id: "mar_opt_3", label: "Single", value: 0 },
    ],
  },
  {
    id: "travel",
    title: "Travel History",
    icon: "✈️",
    description: "Select all countries / regions you have previously visited",
    maxScore: 29,
    inputType: "checkbox",
    options: [
      { id: "trav_opt_1", label: "US / Canada / UK", value: 29 },
      { id: "trav_opt_2", label: "Europe", value: 25 },
      { id: "trav_opt_3", label: "Asian countries", value: 15 },
      { id: "trav_opt_4", label: "Gulf / Arab countries", value: 10 },
      { id: "trav_opt_5", label: "No travel history", value: 0 },
    ],
  },
  {
    id: "bank",
    title: "Financial Health & Banking",
    icon: "🏦",
    description: "Select your banking situation",
    maxScore: 29,
    inputType: "radio",
    options: [
      { id: "bank_opt_1", label: "Local & USD account (6+ months active)", value: 29 },
      { id: "bank_opt_2", label: "Local account (6+ months, 250k+ balance)", value: 25 },
      { id: "bank_opt_3", label: "USD account only (6+ months, $3,000+ balance)", value: 25 },
      { id: "bank_opt_5", label: "Local account (less than 250k balance)", value: 8 },
      { id: "bank_opt_4", label: "No bank account", value: 0 },
    ],
  },
  {
    id: "purpose",
    title: "Current Trip / Purpose of Travel",
    icon: "🧳",
    description: "Select your travel arrangement",
    maxScore: 10,
    inputType: "radio",
    options: [
      { id: "purp_opt_1", label: "Traveling alone (applicant is married)", value: 10 },
      { id: "purp_opt_2", label: "Traveling alone (single)", value: 0 },
      { id: "purp_opt_3", label: "Traveling with spouse", value: 0 },
      { id: "purp_opt_4", label: "Traveling with family / kids", value: 0 },
    ],
  },
  {
    id: "asset",
    title: "Property & Assets",
    icon: "🏠",
    description: "Select all assets you own",
    maxScore: 9,
    inputType: "checkbox",
    options: [
      { id: "asset_opt_1", label: "House", value: 3 },
      { id: "asset_opt_2", label: "Land", value: 2 },
      { id: "asset_opt_3", label: "Apartment", value: 2 },
      { id: "asset_opt_4", label: "Car", value: 2 },
      { id: "asset_opt_5", label: "No assets", value: 0 },
    ],
  },
];

export const PENALTIES: Penalty[] = [
  {
    id: "previous_rejection",
    label: "Previous Visa Refusal",
    description: "I have previously received a visa refusal from any embassy",
    deduction: 5,
  },
  {
    id: "relative_overstay",
    label: "1st-Degree Relative Has Overstayed a Visa",
    description: "A parent, sibling, or child has a prior overstay or illegal stay on record",
    deduction: 50,
  },
  {
    id: "personal_overstay",
    label: "Applicant Has Previously Overstayed a Visa",
    description: "I have previously overstayed a visa or resided illegally in any country",
    deduction: 70,
  },
  {
    id: "no_hr_letter",
    label: "Cannot Provide an Official HR Letter",
    description: "I cannot provide an official HR letter, employment contract, or proof of employment",
    deduction: 50,
  },
  {
    id: "inactive_business",
    label: "Business Is Not Actively Operating",
    description: "My registered business is currently inactive, dissolved, or not actively operating (for business owners)",
    deduction: 30,
  },
];

export type SelectionsMap = Record<string, string[]>;
export type PenaltiesMap = Record<string, boolean>;

/** @deprecated Age is now a radio category (age_bracket). Kept for API compat. */
export const AGE_MAX_SCORE = 4;

/** @deprecated No-op. Age now comes from selections["age_bracket"]. */
export function getAgeScore(_age: number | null): number {
  return 0;
}

export function calculateScore(
  selections: SelectionsMap,
  activePenalties: PenaltiesMap,
  _age: number | null
): {
  baseScore: number;
  totalDeductions: number;
  finalScore: number;
  ageScore: number;
  categoryScores: Record<string, { earned: number; max: number }>;
} {
  const categoryScores: Record<string, { earned: number; max: number }> = {};
  let baseScore = 0;

  for (const cat of CATEGORIES) {
    const selectedIds = selections[cat.id] ?? [];
    const rawSum = cat.options
      .filter((opt) => selectedIds.includes(opt.id))
      .reduce((sum, opt) => sum + opt.value, 0);
    const earned = Math.min(rawSum, cat.maxScore);
    categoryScores[cat.id] = { earned, max: cat.maxScore };
    baseScore += earned;
  }

  categoryScores["age_input"] = { earned: 0, max: 0 };

  const totalDeductions = PENALTIES.filter((p) => activePenalties[p.id]).reduce(
    (sum, p) => sum + p.deduction,
    0
  );

  const finalScore = Math.min(100, Math.max(0, baseScore - totalDeductions));

  return { baseScore, totalDeductions, finalScore, ageScore: 0, categoryScores };
}

export function getScoreStatus(score: number): {
  label: string;
  sublabel: string;
  colorVar: string;
  bgColorVar: string;
  borderColorVar: string;
  emoji: string;
} {
  if (score >= 80) {
    return {
      label: "Strong File",
      sublabel: "Your application profile is well-positioned for a positive outcome.",
      colorVar: "var(--color-strong)",
      bgColorVar: "var(--color-strong-bg)",
      borderColorVar: "var(--color-strong-border)",
      emoji: "✅",
    };
  } else if (score >= 60) {
    return {
      label: "Moderate File",
      sublabel: "Your file has good elements but some areas may benefit from strengthening.",
      colorVar: "var(--color-moderate)",
      bgColorVar: "var(--color-moderate-bg)",
      borderColorVar: "var(--color-moderate-border)",
      emoji: "⚠️",
    };
  } else {
    return {
      label: "Weak File / High Risk",
      sublabel: "Your current profile carries significant risk factors. Professional consultation is strongly advised.",
      colorVar: "var(--color-weak)",
      bgColorVar: "var(--color-weak-bg)",
      borderColorVar: "var(--color-weak-border)",
      emoji: "🔴",
    };
  }
}
