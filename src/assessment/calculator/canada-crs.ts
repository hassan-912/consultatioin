// Copied unchanged from hassan-912/Visa-File-Strength-Calculator (lib/canada-crs.ts, commit 94cb7f8). Edit there first.
// ─────────────────────────────────────────────────────────────────
// Canada Express Entry — Comprehensive Ranking System (CRS)
// Official IRCC grid. Max total: 1,200 points.
// ─────────────────────────────────────────────────────────────────

export type WithSpouse = boolean;

// ── Age ──────────────────────────────────────────────────────────
const AGE_POINTS: Record<string, [number, number]> = {
  "17_or_less": [0, 0],
  "18": [99, 90],
  "19": [105, 95],
  "20_29": [110, 100],
  "30": [105, 95],
  "31": [99, 90],
  "32": [94, 85],
  "33": [88, 80],
  "34": [83, 75],
  "35": [77, 70],
  "36": [72, 65],
  "37": [66, 60],
  "38": [61, 55],
  "39": [55, 50],
  "40": [50, 45],
  "41": [39, 35],
  "42": [28, 25],
  "43": [17, 15],
  "44": [6, 5],
  "45_plus": [0, 0],
};

// ── Education ────────────────────────────────────────────────────
const EDUCATION_POINTS: Record<string, [number, number]> = {
  "less_than_secondary": [0, 0],
  "secondary": [30, 28],
  "one_year": [90, 84],
  "two_year": [98, 91],
  "bachelors": [120, 112],
  "two_or_more_creds": [128, 119],
  "masters": [135, 126],
  "phd": [150, 140],
};

// ── Language per ability (CLB level → [single, spouse]) ──────────
const LANG1_PER_ABILITY: Record<string, [number, number]> = {
  "less_than_clb4": [0, 0],
  "clb4_5": [6, 6],
  "clb4": [6, 6],
  "clb5": [6, 6],
  "clb6": [9, 8],
  "clb7": [17, 16],
  "clb8": [23, 22],
  "clb9": [31, 29],
  "clb10_plus": [34, 32],
};

const LANG2_PER_ABILITY: Record<string, [number, number]> = {
  "clb4_or_less": [0, 0],
  "clb5_6": [1, 1],
  "clb7_8": [3, 3],
  "clb9_plus": [6, 6],
};

// ── Canadian Work Experience ─────────────────────────────────────
const CAN_WORK_EXP_POINTS: Record<string, [number, number]> = {
  "none": [0, 0],
  "1_year": [40, 35],
  "2_years": [53, 46],
  "3_years": [64, 56],
  "4_years": [72, 63],
  "5_plus": [80, 70],
};

// ── Spouse Factors ───────────────────────────────────────────────
export const SPOUSE_EDUCATION_POINTS: Record<string, number> = {
  "less_than_secondary": 0,
  "secondary": 2,               // Secondary school (high school) diploma
  "one_year": 6,                // One-year post-secondary program
  "two_year": 7,                // Two-year post-secondary program
  "bachelors": 8,               // Bachelor's degree or 3+ year program
  "two_or_more_creds": 9,       // Two or more post-secondary credentials (one 3+ years)
  "masters": 10,                // Master's degree or professional degree
  "phd": 10,                    // Doctoral level (Ph.D.)
};

export const SPOUSE_LANG_PER_ABILITY: Record<string, number> = {
  "clb4_or_less": 0,            // CLB 4 or lower
  "clb5_6": 1,                  // CLB 5 or CLB 6
  "clb7_8": 3,                  // CLB 7 or CLB 8
  "clb9_plus": 5,               // CLB 9 or higher
};

export const SPOUSE_CAN_WORK_EXP_POINTS: Record<string, number> = {
  "none": 0,
  "1_year": 5,                  // 1 year
  "2_years": 7,                 // 2 years
  "3_years": 8,                 // 3 years
  "4_years": 9,                 // 4 years
  "5_plus": 10,                 // 5 years or more
};

// ── Helper: CLB level rank for comparisons ───────────────────────
function clbRank(key: string): number {
  const order: Record<string, number> = {
    "less_than_clb4": 0, "clb4_or_less": 0,
    "clb4_5": 1, "clb4": 1, "clb5": 2,
    "clb5_6": 2,
    "clb6": 3,
    "clb7": 4, "clb7_8": 4,
    "clb8": 5,
    "clb9": 6, "clb9_plus": 6, "clb9_plus_lang2": 6,
    "clb10_plus": 7,
  };
  return order[key] ?? 0;
}

/**
 * Lowest CLB rank across all 4 abilities.
 * IRCC skill transferability requires ALL 4 abilities to meet the threshold —
 * a single weak skill disqualifies that tier.
 */
function lowestClb(abilities: string[]): number {
  return Math.min(...abilities.map(clbRank));
}

// ── Education tier helpers ────────────────────────────────────────
const EDU_1YR_PLUS = new Set(["one_year", "two_year", "bachelors", "two_or_more_creds", "masters", "phd"]);
const EDU_HIGH = new Set(["two_or_more_creds", "masters", "phd"]);

function isHighEdu(edu: string) { return EDU_HIGH.has(edu); }
function is1YrPlusEdu(edu: string) { return EDU_1YR_PLUS.has(edu); }

// ── Foreign Work Experience tiers ────────────────────────────────
const FOREIGN_EXP_1_2 = new Set(["1_2_years"]);
const FOREIGN_EXP_3_PLUS = new Set(["3_plus_years"]);

// ── Trades certificate ────────────────────────────────────────────
// represented as boolean in the form

// ─────────────────────────────────────────────────────────────────
// CRS Form shape
// ─────────────────────────────────────────────────────────────────
export interface CRSForm {
  // Profile
  withSpouse: boolean;

  // Core — Applicant
  age: string;
  education: string;
  lang1_reading: string;
  lang1_writing: string;
  lang1_speaking: string;
  lang1_listening: string;
  lang2_reading: string;
  lang2_writing: string;
  lang2_speaking: string;
  lang2_listening: string;
  canWorkExp: string;

  // Spouse
  spouse_education: string;
  spouse_lang1_reading: string;
  spouse_lang1_writing: string;
  spouse_lang1_speaking: string;
  spouse_lang1_listening: string;
  spouse_canWorkExp: string;

  // Skill Transferability inputs
  foreignWorkExp: string;            // "none" | "1_2_years" | "3_plus_years"
  tradesCertificate: boolean;

  // Additional Points
  siblingInCanada: boolean;
  /** @deprecated Ignored. The French bonus is calculated from the language abilities. */
  frenchClb?: string;
  postSecondaryCanada: string;       // "none" | "1_2_years" | "3_plus_years"
  arrangedEmployment: string;        // "none" | "noc00" | "other_noc"
  provincialNomination: boolean;
}

export interface CRSBreakdown {
  ageScore: number;
  educationScore: number;
  lang1Score: number;
  lang2Score: number;
  canWorkExpScore: number;
  spouseScore: number;
  spouseEduScore: number;
  spouseLangScore: number;
  spouseExpScore: number;
  skillTransferScore: number;
  frenchBonusScore: number;
  additionalScore: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────────
// Main calculation function
// ─────────────────────────────────────────────────────────────────
export function calculateCRS(form: CRSForm): CRSBreakdown {
  const ws = form.withSpouse;

  // ── A. Core Human Capital ─────────────────────────────────────
  const ageScore = (AGE_POINTS[form.age] ?? [0, 0])[ws ? 1 : 0];

  const educationScore = (EDUCATION_POINTS[form.education] ?? [0, 0])[ws ? 1 : 0];

  const lang1Abilities = [form.lang1_reading, form.lang1_writing, form.lang1_speaking, form.lang1_listening];
  const lang1Score = lang1Abilities.reduce((sum, key) => {
    return sum + (LANG1_PER_ABILITY[key] ?? [0, 0])[ws ? 1 : 0];
  }, 0);

  const lang2Abilities = [form.lang2_reading, form.lang2_writing, form.lang2_speaking, form.lang2_listening];
  const rawLang2 = lang2Abilities.reduce((sum, key) => {
    return sum + (LANG2_PER_ABILITY[key] ?? [0, 0])[ws ? 1 : 0];
  }, 0);
  // Official IRCC cap: 22 pts with spouse, 24 pts without.
  const lang2Score = ws ? Math.min(22, rawLang2) : Math.min(24, rawLang2);

  const canWorkExpScore = (CAN_WORK_EXP_POINTS[form.canWorkExp] ?? [0, 0])[ws ? 1 : 0];

  // ── B. Spouse Factors ────────────────────────────────────────
  let spouseScore = 0;
  let spouseEduScore = 0;
  let spouseLangScore = 0;
  let spouseExpScore = 0;

  if (ws) {
    spouseEduScore = SPOUSE_EDUCATION_POINTS[form.spouse_education] ?? 0;

    const spouseLang1 = [
      form.spouse_lang1_reading,
      form.spouse_lang1_writing,
      form.spouse_lang1_speaking,
      form.spouse_lang1_listening,
    ];
    spouseLangScore = spouseLang1.reduce((sum, key) => sum + (SPOUSE_LANG_PER_ABILITY[key] ?? 0), 0);

    spouseExpScore = SPOUSE_CAN_WORK_EXP_POINTS[form.spouse_canWorkExp] ?? 0;

    spouseScore = spouseEduScore + spouseLangScore + spouseExpScore;
  }

  // ── C. Skill Transferability (overall cap 100) ───────────────
  //
  // IRCC rule: ALL 4 abilities must meet the CLB threshold.
  // Use lowestClb() so a single weak ability disqualifies the tier.
  const lowestLang1 = lowestClb(lang1Abilities);
  const isLang1_CLB7Plus = lowestLang1 >= clbRank("clb7");
  const isLang1_CLB9Plus = lowestLang1 >= clbRank("clb9");
  // CLB 5 or 6 in all abilities (at least one is below CLB 7)
  const isLang1_CLB5Plus = lowestLang1 >= clbRank("clb5_6");

  const hasCanExp1 = ["1_year", "2_years", "3_years", "4_years", "5_plus"].includes(form.canWorkExp);
  const hasCanExp2Plus = ["2_years", "3_years", "4_years", "5_plus"].includes(form.canWorkExp);
  const hasForeignExp1_2 = FOREIGN_EXP_1_2.has(form.foreignWorkExp);
  const hasForeignExp3Plus = FOREIGN_EXP_3_PLUS.has(form.foreignWorkExp);

  // ── Sub-factor A: Education Transferability (intermediate cap 50) ──
  let eduTransfer = 0;
  // Education + Language
  if (is1YrPlusEdu(form.education) && !isHighEdu(form.education)) {
    if (isLang1_CLB9Plus) eduTransfer += 25;
    else if (isLang1_CLB7Plus) eduTransfer += 13;
  }
  if (isHighEdu(form.education)) {
    if (isLang1_CLB9Plus) eduTransfer += 50;
    else if (isLang1_CLB7Plus) eduTransfer += 25;
  }
  // Education + Canadian Experience
  if (is1YrPlusEdu(form.education) && !isHighEdu(form.education)) {
    if (hasCanExp2Plus) eduTransfer += 25;
    else if (hasCanExp1) eduTransfer += 13;
  }
  if (isHighEdu(form.education)) {
    if (hasCanExp2Plus) eduTransfer += 50;
    else if (hasCanExp1) eduTransfer += 25;
  }
  eduTransfer = Math.min(50, eduTransfer);

  // ── Sub-factor B: Foreign Work Experience Transferability (intermediate cap 50) ──
  let foreignTransfer = 0;
  // Foreign Exp + Language
  if (hasForeignExp1_2) {
    if (isLang1_CLB9Plus) foreignTransfer += 25;
    else if (isLang1_CLB7Plus) foreignTransfer += 13;
  }
  if (hasForeignExp3Plus) {
    if (isLang1_CLB9Plus) foreignTransfer += 50;
    else if (isLang1_CLB7Plus) foreignTransfer += 25;
  }
  // Foreign Exp + Canadian Experience
  if (hasForeignExp1_2) {
    if (hasCanExp2Plus) foreignTransfer += 25;
    else if (hasCanExp1) foreignTransfer += 13;
  }
  if (hasForeignExp3Plus) {
    if (hasCanExp2Plus) foreignTransfer += 50;
    else if (hasCanExp1) foreignTransfer += 25;
  }
  foreignTransfer = Math.min(50, foreignTransfer);

  // ── Sub-factor C: Certificate of Qualification (Trades) + Language ──
  // 50 pts if all 4 abilities ≥ CLB 7; 25 pts if all 4 ≥ CLB 5 (at least one below CLB 7).
  let tradesTransfer = 0;
  if (form.tradesCertificate) {
    if (isLang1_CLB7Plus) tradesTransfer = 50;
    else if (isLang1_CLB5Plus) tradesTransfer = 25;
  }

  // ── Overall Section C cap: 100 ────────────────────────────────
  const skillTransferScore = Math.min(100, eduTransfer + foreignTransfer + tradesTransfer);

  // ── D. Additional Points (cap 600) ───────────────────────────
  let additional = 0;

  if (form.siblingInCanada) additional += 15;

  // lang1 contains English results; lang2 contains French results in this form.
  // All four French abilities must be NCLC 7+. All four English abilities
  // must be CLB 5+ for the 50-point tier; otherwise the bonus is 25 points.
  const frenchBonusScore = lowestClb(lang2Abilities) >= clbRank("clb7_8")
    ? lowestLang1 >= clbRank("clb5") ? 50 : 25
    : 0;
  additional += frenchBonusScore;

  if (form.postSecondaryCanada === "1_2_years") additional += 15;
  else if (form.postSecondaryCanada === "3_plus_years") additional += 30;

  if (form.arrangedEmployment === "noc00") additional += 200;
  else if (form.arrangedEmployment === "other_noc") additional += 50;

  if (form.provincialNomination) additional += 600;

  const additionalScore = Math.min(600, additional);

  // ── Total ────────────────────────────────────────────────────
  const total = Math.min(
    1200,
    ageScore + educationScore + lang1Score + lang2Score +
    canWorkExpScore + spouseScore + skillTransferScore + additionalScore
  );

  return {
    ageScore,
    educationScore,
    lang1Score,
    lang2Score,
    canWorkExpScore,
    spouseScore,
    spouseEduScore,
    spouseLangScore,
    spouseExpScore,
    skillTransferScore,
    frenchBonusScore,
    additionalScore,
    total,
  };
}

// ── Human-readable label helpers ─────────────────────────────────
export const AGE_OPTIONS = [
  { value: "17_or_less", label: "17 or younger" },
  { value: "18", label: "18" },
  { value: "19", label: "19" },
  { value: "20_29", label: "20–29" },
  { value: "30", label: "30" },
  { value: "31", label: "31" },
  { value: "32", label: "32" },
  { value: "33", label: "33" },
  { value: "34", label: "34" },
  { value: "35", label: "35" },
  { value: "36", label: "36" },
  { value: "37", label: "37" },
  { value: "38", label: "38" },
  { value: "39", label: "39" },
  { value: "40", label: "40" },
  { value: "41", label: "41" },
  { value: "42", label: "42" },
  { value: "43", label: "43" },
  { value: "44", label: "44" },
  { value: "45_plus", label: "45 or older" },
];

export const EDUCATION_OPTIONS = [
  { value: "less_than_secondary", label: "Less than secondary school" },
  { value: "secondary", label: "Secondary diploma (high school)" },
  { value: "one_year", label: "One-year post-secondary program" },
  { value: "two_year", label: "Two-year post-secondary program" },
  { value: "bachelors", label: "Bachelor's degree or 3+ year program" },
  { value: "two_or_more_creds", label: "Two or more credentials (one 3+ years)" },
  { value: "masters", label: "Master's or professional degree" },
  { value: "phd", label: "Doctoral degree (PhD)" },
];

export const LANG1_OPTIONS = [
  { value: "less_than_clb4", label: "Less than CLB 4" },
  { value: "clb4", label: "CLB 4" },
  { value: "clb5", label: "CLB 5" },
  { value: "clb6", label: "CLB 6" },
  { value: "clb7", label: "CLB 7" },
  { value: "clb8", label: "CLB 8" },
  { value: "clb9", label: "CLB 9" },
  { value: "clb10_plus", label: "CLB 10 or higher" },
];

export const LANG2_OPTIONS = [
  { value: "clb4_or_less", label: "CLB 4 or less" },
  { value: "clb5_6", label: "CLB 5 or 6" },
  { value: "clb7_8", label: "CLB 7 or 8" },
  { value: "clb9_plus", label: "CLB 9 or higher" },
];

export const CAN_WORK_EXP_OPTIONS = [
  { value: "none", label: "None / Less than 1 year" },
  { value: "1_year", label: "1 year" },
  { value: "2_years", label: "2 years" },
  { value: "3_years", label: "3 years" },
  { value: "4_years", label: "4 years" },
  { value: "5_plus", label: "5 years or more" },
];

export const SPOUSE_LANG1_OPTIONS = [
  { value: "clb4_or_less", label: "CLB 4 or less" },
  { value: "clb5_6", label: "CLB 5 or 6" },
  { value: "clb7_8", label: "CLB 7 or 8" },
  { value: "clb9_plus", label: "CLB 9 or higher" },
];

export const FOREIGN_WORK_EXP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "1_2_years", label: "1 to 2 years" },
  { value: "3_plus_years", label: "3 years or more" },
];

export const POST_SECONDARY_CANADA_OPTIONS = [
  { value: "none", label: "None" },
  { value: "1_2_years", label: "1 or 2 years" },
  { value: "3_plus_years", label: "3 or more years" },
];

export const ARRANGED_EMPLOYMENT_OPTIONS = [
  { value: "none", label: "No arranged employment" },
  { value: "noc00", label: "Yes — NOC TEER 0 Major Group 00 (Senior Managers)" },
  { value: "other_noc", label: "Yes — Other NOC TEER 0, 1, 2, or 3" },
];

export const DEFAULT_CRS_FORM: CRSForm = {
  withSpouse: false,
  age: "",
  education: "",
  lang1_reading: "less_than_clb4",
  lang1_writing: "less_than_clb4",
  lang1_speaking: "less_than_clb4",
  lang1_listening: "less_than_clb4",
  lang2_reading: "clb4_or_less",
  lang2_writing: "clb4_or_less",
  lang2_speaking: "clb4_or_less",
  lang2_listening: "clb4_or_less",
  canWorkExp: "none",
  spouse_education: "less_than_secondary",
  spouse_lang1_reading: "clb4_or_less",
  spouse_lang1_writing: "clb4_or_less",
  spouse_lang1_speaking: "clb4_or_less",
  spouse_lang1_listening: "clb4_or_less",
  spouse_canWorkExp: "none",
  foreignWorkExp: "none",
  tradesCertificate: false,
  siblingInCanada: false,
  postSecondaryCanada: "none",
  arrangedEmployment: "none",
  provincialNomination: false,
};

// ─────────────────────────────────────────────────────────────────
// Language Test Conversion Utilities
// ─────────────────────────────────────────────────────────────────

export type LangTestType =
  | "IELTS"
  | "PTE_Core"
  | "TCF_Canada"
  | "TEF_Canada"
  | "CELPIP_G";

export type LangAbility = "reading" | "writing" | "speaking" | "listening";

export interface TestScoreOption {
  rawValue: string;
  label: string;
  clb: number;
}

/** Maps numeric CLB (3–10) to the CRS lang1 form key */
export function clbNumberToLang1Key(clb: number): string {
  if (clb >= 10) return "clb10_plus";
  if (clb === 9) return "clb9";
  if (clb === 8) return "clb8";
  if (clb === 7) return "clb7";
  if (clb === 6) return "clb6";
  if (clb === 5) return "clb5";
  if (clb === 4) return "clb4";
  return "less_than_clb4";
}

/** Maps numeric CLB (3–10) to the CRS lang2 form key */
export function clbNumberToLang2Key(clb: number): string {
  if (clb >= 9) return "clb9_plus";
  if (clb >= 7) return "clb7_8";
  if (clb >= 5) return "clb5_6";
  return "clb4_or_less";
}

// ── IELTS General Training ────────────────────────────────────────
const IELTS_SCORES: Record<LangAbility, TestScoreOption[]> = {
  reading: [
    { rawValue: "ielts_r_sub4", label: "< 3.5  (Below CLB 4)", clb: 3 },
    { rawValue: "ielts_r_35", label: "3.5  (CLB 4)", clb: 4 },
    { rawValue: "ielts_r_40", label: "4.0  (CLB 5)", clb: 5 },
    { rawValue: "ielts_r_50", label: "5.0  (CLB 6)", clb: 6 },
    { rawValue: "ielts_r_60", label: "6.0  (CLB 7)", clb: 7 },
    { rawValue: "ielts_r_65", label: "6.5  (CLB 8)", clb: 8 },
    { rawValue: "ielts_r_70", label: "7.0  (CLB 9)", clb: 9 },
    { rawValue: "ielts_r_80", label: "8.0–9.0  (CLB 10+)", clb: 10 },
  ],
  writing: [
    { rawValue: "ielts_w_sub4", label: "< 4.0  (Below CLB 4)", clb: 3 },
    { rawValue: "ielts_w_40", label: "4.0  (CLB 4)", clb: 4 },
    { rawValue: "ielts_w_50", label: "5.0  (CLB 5)", clb: 5 },
    { rawValue: "ielts_w_55", label: "5.5  (CLB 6)", clb: 6 },
    { rawValue: "ielts_w_60", label: "6.0  (CLB 7)", clb: 7 },
    { rawValue: "ielts_w_65", label: "6.5  (CLB 8)", clb: 8 },
    { rawValue: "ielts_w_70", label: "7.0  (CLB 9)", clb: 9 },
    { rawValue: "ielts_w_75", label: "7.5–9.0  (CLB 10+)", clb: 10 },
  ],
  speaking: [
    { rawValue: "ielts_s_sub4", label: "< 4.0  (Below CLB 4)", clb: 3 },
    { rawValue: "ielts_s_40", label: "4.0  (CLB 4)", clb: 4 },
    { rawValue: "ielts_s_50", label: "5.0  (CLB 5)", clb: 5 },
    { rawValue: "ielts_s_55", label: "5.5  (CLB 6)", clb: 6 },
    { rawValue: "ielts_s_60", label: "6.0  (CLB 7)", clb: 7 },
    { rawValue: "ielts_s_65", label: "6.5  (CLB 8)", clb: 8 },
    { rawValue: "ielts_s_70", label: "7.0  (CLB 9)", clb: 9 },
    { rawValue: "ielts_s_75", label: "7.5–9.0  (CLB 10+)", clb: 10 },
  ],
  listening: [
    { rawValue: "ielts_l_sub4", label: "< 4.5  (Below CLB 4)", clb: 3 },
    { rawValue: "ielts_l_45", label: "4.5  (CLB 4)", clb: 4 },
    { rawValue: "ielts_l_50", label: "5.0  (CLB 5)", clb: 5 },
    { rawValue: "ielts_l_55", label: "5.5  (CLB 6)", clb: 6 },
    { rawValue: "ielts_l_60", label: "6.0  (CLB 7)", clb: 7 },
    { rawValue: "ielts_l_75", label: "7.5  (CLB 8)", clb: 8 },
    { rawValue: "ielts_l_80", label: "8.0  (CLB 9)", clb: 9 },
    { rawValue: "ielts_l_85", label: "8.5–9.0  (CLB 10+)", clb: 10 },
  ],
};

// ── PTE Core ──────────────────────────────────────────────────────
const PTE_SCORES: Record<LangAbility, TestScoreOption[]> = {
  reading: [
    { rawValue: "pte_r_sub4", label: "24–32 or lower  (Below CLB 4)", clb: 3 },
    { rawValue: "pte_r_33", label: "33–41  (CLB 4)", clb: 4 },
    { rawValue: "pte_r_42", label: "42–50  (CLB 5)", clb: 5 },
    { rawValue: "pte_r_51", label: "51–59  (CLB 6)", clb: 6 },
    { rawValue: "pte_r_60", label: "60–68  (CLB 7)", clb: 7 },
    { rawValue: "pte_r_69", label: "69–77  (CLB 8)", clb: 8 },
    { rawValue: "pte_r_78", label: "78–87  (CLB 9)", clb: 9 },
    { rawValue: "pte_r_88", label: "88–90  (CLB 10)", clb: 10 },
  ],
  writing: [
    { rawValue: "pte_w_sub4", label: "32–40 or lower  (Below CLB 4)", clb: 3 },
    { rawValue: "pte_w_41", label: "41–50  (CLB 4)", clb: 4 },
    { rawValue: "pte_w_51", label: "51–59  (CLB 5)", clb: 5 },
    { rawValue: "pte_w_60", label: "60–68  (CLB 6)", clb: 6 },
    { rawValue: "pte_w_69", label: "69–78  (CLB 7)", clb: 7 },
    { rawValue: "pte_w_79", label: "79–87  (CLB 8)", clb: 8 },
    { rawValue: "pte_w_88", label: "88–89  (CLB 9)", clb: 9 },
    { rawValue: "pte_w_90", label: "90  (CLB 10)", clb: 10 },
  ],
  speaking: [
    { rawValue: "pte_s_sub4", label: "34–41 or lower  (Below CLB 4)", clb: 3 },
    { rawValue: "pte_s_42", label: "42–50  (CLB 4)", clb: 4 },
    { rawValue: "pte_s_51", label: "51–58  (CLB 5)", clb: 5 },
    { rawValue: "pte_s_59", label: "59–67  (CLB 6)", clb: 6 },
    { rawValue: "pte_s_68", label: "68–75  (CLB 7)", clb: 7 },
    { rawValue: "pte_s_76", label: "76–83  (CLB 8)", clb: 8 },
    { rawValue: "pte_s_84", label: "84–88  (CLB 9)", clb: 9 },
    { rawValue: "pte_s_89", label: "89–90  (CLB 10)", clb: 10 },
  ],
  listening: [
    { rawValue: "pte_l_sub4", label: "18–27 or lower  (Below CLB 4)", clb: 3 },
    { rawValue: "pte_l_28", label: "28–38  (CLB 4)", clb: 4 },
    { rawValue: "pte_l_39", label: "39–49  (CLB 5)", clb: 5 },
    { rawValue: "pte_l_50", label: "50–59  (CLB 6)", clb: 6 },
    { rawValue: "pte_l_60", label: "60–70  (CLB 7)", clb: 7 },
    { rawValue: "pte_l_71", label: "71–81  (CLB 8)", clb: 8 },
    { rawValue: "pte_l_82", label: "82–88  (CLB 9)", clb: 9 },
    { rawValue: "pte_l_89", label: "89–90  (CLB 10)", clb: 10 },
  ],
};

// ── TCF Canada ────────────────────────────────────────────────────
const TCF_SCORES: Record<LangAbility, TestScoreOption[]> = {
  reading: [
    { rawValue: "tcf_r_sub4", label: "< 342  (Below CLB 4)", clb: 3 },
    { rawValue: "tcf_r_342", label: "342–374  (CLB 4)", clb: 4 },
    { rawValue: "tcf_r_375", label: "375–405  (CLB 5)", clb: 5 },
    { rawValue: "tcf_r_406", label: "406–452  (CLB 6)", clb: 6 },
    { rawValue: "tcf_r_453", label: "453–498  (CLB 7)", clb: 7 },
    { rawValue: "tcf_r_499", label: "499–523  (CLB 8)", clb: 8 },
    { rawValue: "tcf_r_524", label: "524–548  (CLB 9)", clb: 9 },
    { rawValue: "tcf_r_549", label: "549+  (CLB 10)", clb: 10 },
  ],
  writing: [
    { rawValue: "tcf_w_sub4", label: "< 4  (Below CLB 4)", clb: 3 },
    { rawValue: "tcf_w_4", label: "4–5  (CLB 4)", clb: 4 },
    { rawValue: "tcf_w_6", label: "6  (CLB 5)", clb: 5 },
    { rawValue: "tcf_w_7", label: "7–9  (CLB 6)", clb: 6 },
    { rawValue: "tcf_w_10", label: "10–11  (CLB 7)", clb: 7 },
    { rawValue: "tcf_w_12", label: "12–13  (CLB 8)", clb: 8 },
    { rawValue: "tcf_w_14", label: "14–15  (CLB 9)", clb: 9 },
    { rawValue: "tcf_w_16", label: "16+  (CLB 10)", clb: 10 },
  ],
  speaking: [
    { rawValue: "tcf_s_sub4", label: "< 4  (Below CLB 4)", clb: 3 },
    { rawValue: "tcf_s_4", label: "4–5  (CLB 4)", clb: 4 },
    { rawValue: "tcf_s_6", label: "6  (CLB 5)", clb: 5 },
    { rawValue: "tcf_s_7", label: "7–9  (CLB 6)", clb: 6 },
    { rawValue: "tcf_s_10", label: "10–11  (CLB 7)", clb: 7 },
    { rawValue: "tcf_s_12", label: "12–13  (CLB 8)", clb: 8 },
    { rawValue: "tcf_s_14", label: "14–15  (CLB 9)", clb: 9 },
    { rawValue: "tcf_s_16", label: "16+  (CLB 10)", clb: 10 },
  ],
  listening: [
    { rawValue: "tcf_l_sub4", label: "< 331  (Below CLB 4)", clb: 3 },
    { rawValue: "tcf_l_331", label: "331–368  (CLB 4)", clb: 4 },
    { rawValue: "tcf_l_369", label: "369–397  (CLB 5)", clb: 5 },
    { rawValue: "tcf_l_398", label: "398–457  (CLB 6)", clb: 6 },
    { rawValue: "tcf_l_458", label: "458–502  (CLB 7)", clb: 7 },
    { rawValue: "tcf_l_503", label: "503–522  (CLB 8)", clb: 8 },
    { rawValue: "tcf_l_523", label: "523–548  (CLB 9)", clb: 9 },
    { rawValue: "tcf_l_549", label: "549+  (CLB 10)", clb: 10 },
  ],
};

// ── TEF Canada ────────────────────────────────────────────────────
const TEF_SCORES: Record<LangAbility, TestScoreOption[]> = {
  reading: [
    { rawValue: "tef_r_sub4", label: "< 121  (Below CLB 4)", clb: 3 },
    { rawValue: "tef_r_121", label: "121–150  (CLB 4)", clb: 4 },
    { rawValue: "tef_r_151", label: "151–180  (CLB 5)", clb: 5 },
    { rawValue: "tef_r_181", label: "181–206  (CLB 6)", clb: 6 },
    { rawValue: "tef_r_207", label: "207–232  (CLB 7)", clb: 7 },
    { rawValue: "tef_r_233", label: "233–247  (CLB 8)", clb: 8 },
    { rawValue: "tef_r_248", label: "248–262  (CLB 9)", clb: 9 },
    { rawValue: "tef_r_263", label: "263–277  (CLB 10)", clb: 10 },
  ],
  writing: [
    { rawValue: "tef_w_sub4", label: "< 181  (Below CLB 4)", clb: 3 },
    { rawValue: "tef_w_181", label: "181–225  (CLB 4)", clb: 4 },
    { rawValue: "tef_w_226", label: "226–270  (CLB 5)", clb: 5 },
    { rawValue: "tef_w_271", label: "271–309  (CLB 6)", clb: 6 },
    { rawValue: "tef_w_310", label: "310–348  (CLB 7)", clb: 7 },
    { rawValue: "tef_w_349", label: "349–370  (CLB 8)", clb: 8 },
    { rawValue: "tef_w_371", label: "371–392  (CLB 9)", clb: 9 },
    { rawValue: "tef_w_393", label: "393–415  (CLB 10)", clb: 10 },
  ],
  speaking: [
    { rawValue: "tef_s_sub4", label: "< 181  (Below CLB 4)", clb: 3 },
    { rawValue: "tef_s_181", label: "181–225  (CLB 4)", clb: 4 },
    { rawValue: "tef_s_226", label: "226–270  (CLB 5)", clb: 5 },
    { rawValue: "tef_s_271", label: "271–309  (CLB 6)", clb: 6 },
    { rawValue: "tef_s_310", label: "310–348  (CLB 7)", clb: 7 },
    { rawValue: "tef_s_349", label: "349–370  (CLB 8)", clb: 8 },
    { rawValue: "tef_s_371", label: "371–392  (CLB 9)", clb: 9 },
    { rawValue: "tef_s_393", label: "393–415  (CLB 10)", clb: 10 },
  ],
  listening: [
    { rawValue: "tef_l_sub4", label: "< 145  (Below CLB 4)", clb: 3 },
    { rawValue: "tef_l_145", label: "145–180  (CLB 4)", clb: 4 },
    { rawValue: "tef_l_181", label: "181–216  (CLB 5)", clb: 5 },
    { rawValue: "tef_l_217", label: "217–248  (CLB 6)", clb: 6 },
    { rawValue: "tef_l_249", label: "249–279  (CLB 7)", clb: 7 },
    { rawValue: "tef_l_280", label: "280–297  (CLB 8)", clb: 8 },
    { rawValue: "tef_l_298", label: "298–315  (CLB 9)", clb: 9 },
    { rawValue: "tef_l_316", label: "316–333  (CLB 10)", clb: 10 },
  ],
};

// ── CELPIP-G (1:1 with CLB) ───────────────────────────────────────
const CELPIP_ROW: TestScoreOption[] = [
  { rawValue: "celpip_sub4", label: "Below 4  (Below CLB 4)", clb: 3 },
  { rawValue: "celpip_4", label: "4  (CLB 4)", clb: 4 },
  { rawValue: "celpip_5", label: "5  (CLB 5)", clb: 5 },
  { rawValue: "celpip_6", label: "6  (CLB 6)", clb: 6 },
  { rawValue: "celpip_7", label: "7  (CLB 7)", clb: 7 },
  { rawValue: "celpip_8", label: "8  (CLB 8)", clb: 8 },
  { rawValue: "celpip_9", label: "9  (CLB 9)", clb: 9 },
  { rawValue: "celpip_10", label: "10+  (CLB 10+)", clb: 10 },
];

const CELPIP_SCORES: Record<LangAbility, TestScoreOption[]> = {
  reading: CELPIP_ROW,
  writing: CELPIP_ROW,
  speaking: CELPIP_ROW,
  listening: CELPIP_ROW,
};

// ── Direct CLB ────────────────────────────────────────────────────
const CLB_DIRECT_SCORES: TestScoreOption[] = [
  { rawValue: "clb_sub4", label: "Below CLB 4", clb: 3 },
  { rawValue: "clb_4", label: "CLB 4", clb: 4 },
  { rawValue: "clb_5", label: "CLB 5", clb: 5 },
  { rawValue: "clb_6", label: "CLB 6", clb: 6 },
  { rawValue: "clb_7", label: "CLB 7", clb: 7 },
  { rawValue: "clb_8", label: "CLB 8", clb: 8 },
  { rawValue: "clb_9", label: "CLB 9", clb: 9 },
  { rawValue: "clb_10", label: "CLB 10+", clb: 10 },
];

/**
 * Returns the score option list (for rendering a dropdown) for a given test and ability.
 */
export function getTestScoreOptions(
  testType: LangTestType,
  ability: LangAbility
): TestScoreOption[] {
  switch (testType) {
    case "IELTS": return IELTS_SCORES[ability];
    case "PTE_Core": return PTE_SCORES[ability];
    case "TCF_Canada": return TCF_SCORES[ability];
    case "TEF_Canada": return TEF_SCORES[ability];
    case "CELPIP_G": return CELPIP_SCORES[ability];
    default: return IELTS_SCORES[ability];
  }
}

/**
 * Converts a raw test score band string to a numeric CLB level (3–10).
 * Returns 3 (below CLB 4) when rawValue is unrecognised.
 */
export function convertTestScoreToCLB(
  testType: LangTestType,
  ability: LangAbility,
  rawValue: string
): number {
  const options = getTestScoreOptions(testType, ability);
  const match = options.find((o) => o.rawValue === rawValue);
  return match ? match.clb : 3;
}

/** Converts a raw test score band → CRS lang1 form key */
export function rawScoreToLang1Key(
  testType: LangTestType,
  ability: LangAbility,
  rawValue: string
): string {
  return clbNumberToLang1Key(convertTestScoreToCLB(testType, ability, rawValue));
}

/** Converts a raw test score band → CRS lang2 form key */
export function rawScoreToLang2Key(
  testType: LangTestType,
  ability: LangAbility,
  rawValue: string
): string {
  return clbNumberToLang2Key(convertTestScoreToCLB(testType, ability, rawValue));
}

/** Human-readable display name for a LangTestType */
export function testTypeName(t: LangTestType): string {
  const names: Record<LangTestType, string> = {
    IELTS: "IELTS",
    PTE_Core: "PTE Core",
    TCF_Canada: "TCF Canada",
    TEF_Canada: "TEF Canada",
    CELPIP_G: "CELPIP-G",
  };
  return names[t] ?? t;
}

// Local addition: upstream declares this table without using it; this keeps strict noUnusedLocals happy.
void CLB_DIRECT_SCORES
