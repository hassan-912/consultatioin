// Copied unchanged from hassan-912/Visa-File-Strength-Calculator (lib/job-seeker.ts, commit 94cb7f8). Edit there first.
import type { EgpRates } from "./exchange-rates";

export type JobSeekerRoute = "germany" | "austria" | "sweden" | "training";
export type BankCurrency = "EGP" | "EUR" | "SEK";
export type JobSeekerAnswers = Record<string, string>;

export const JOB_SEEKER_SOURCES = {
  germany: "https://www.make-it-in-germany.com/en/visa-recognition/opportunity-card/job-search",
  austria: "https://www.migration.gv.at/en/types-of-immigration/permanent-immigration/very-highly-qualified-workers/",
  sweden: "https://www.migrationsverket.se/en/you-want-to-apply/work/look-for-work/look-for-work-or-start-a-business.html",
  training: "https://www.make-it-in-germany.com/en/visa-recognition/visa-types/training",
  anabin: "https://anabin.kmk.org/db/institutionen",
  anabinDegrees: "https://anabin.kmk.org/db/hochschulabschluesse",
};

export const JOB_SEEKER_PROGRAMS = {
  germany: { country: "Germany", code: "DE", title: "Opportunity Card", duration: "12 months", monthly: 1091, months: 12, currency: "EUR" },
  austria: { country: "Austria", code: "AT", title: "Job Seeker Visa", duration: "6 months", monthly: null, months: 6, currency: "EUR" },
  sweden: { country: "Sweden", code: "SE", title: "Look for Work", duration: "6 or 9 months", monthly: 13000, months: 9, currency: "SEK" },
  training: { country: "Germany", code: "DE", title: "Vocational Training Search", duration: "6 or 9 months", monthly: 1091, months: 9, currency: "EUR" },
} as const;

export function fundingFor(route: JobSeekerRoute, months: number) {
  const program = JOB_SEEKER_PROGRAMS[route];
  const duration = (route === "sweden" || route === "training") && months === 6 ? 6 : program.months;
  // Austria's client-provided figure is a planning estimate, not a verified threshold.
  return { months: duration, amount: program.monthly === null ? 7850.34 : program.monthly * duration, estimated: program.monthly === null };
}

export function formatFunding(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

export function parseBankBalance(value: string): number | null {
  const input = value?.trim() ?? "";
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) return null;
  const amount = Number(input.replaceAll(",", ""));
  return Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER / 100 ? amount : null;
}

export interface BankFundsCheck {
  status: "empty" | "invalid" | "rates-unavailable" | "covered" | "shortfall";
  currency: BankCurrency;
  balance: number | null;
  required: number | null;
  shortfall: number | null;
}

export function checkBankFunds(route: JobSeekerRoute, form: JobSeekerAnswers, fx: EgpRates | null = null): BankFundsCheck {
  const currency = form.bankCurrency === "EUR" || form.bankCurrency === "SEK" ? form.bankCurrency : "EGP";
  const balance = parseBankBalance(form.bankBalance);
  const result: BankFundsCheck = { status: form.bankBalance?.trim() ? "invalid" : "empty", currency, balance, required: null, shortfall: null };
  if (balance === null) return result;
  const program = JOB_SEEKER_PROGRAMS[route];
  const funding = fundingFor(route, Number(form.months));
  let required = funding.amount;
  if (currency !== program.currency) {
    const updated = fx ? Date.parse(fx.updatedAt) : NaN;
    if (!fx || !Number.isFinite(updated) || Date.now() - updated > 48 * 60 * 60 * 1000 || updated > Date.now() + 300000 ||
      !Number.isFinite(fx.rates.EUR) || fx.rates.EUR <= 0 || !Number.isFinite(fx.rates.SEK) || fx.rates.SEK <= 0) {
      return { ...result, status: "rates-unavailable" };
    }
    required = funding.amount * fx.rates[program.currency] / (currency === "EGP" ? 1 : fx.rates[currency]);
  }
  // Compare cents against a rounded-up requirement; never approve a rounded-down estimate.
  const requiredCents = Math.ceil(required * 100 - 1e-7);
  const shortfallCents = Math.max(0, requiredCents - Math.round(balance * 100));
  return { ...result, status: shortfallCents === 0 ? "covered" : "shortfall", required: requiredCents / 100, shortfall: shortfallCents / 100 };
}

export interface JobSeekerAssessment {
  total: number | null;
  threshold: number | null;
  breakdown: { label: string; points: number }[];
  issues: string[];
  meetsCriteria: boolean;
  direct: boolean;
  funds: BankFundsCheck;
}

const level = (value: string) => ["none", "a1", "a2", "b1", "b2", "c1", "c2"].indexOf(value);
const number = (value: string) => value?.trim() && Number.isFinite(Number(value)) ? Number(value) : -1;

// MG's simplified screening: only visible inputs contribute. This is not the full official assessment.
export function assessJobSeeker(route: JobSeekerRoute, form: JobSeekerAnswers, fx: EgpRates | null = null): JobSeekerAssessment {
  const issues: string[] = [];
  const breakdown: JobSeekerAssessment["breakdown"] = [];
  const requireYes = (key: string, message: string) => { if (form[key] !== "yes") issues.push(message); };
  const add = (label: string, points: number) => breakdown.push({ label, points });
  const age = number(form.age);
  let threshold: number | null = null;
  let direct = false;
  if (route === "germany") {
    const selectedRecords = form.recognitionSource === "anabin" && /^[a-f\d]{24}$/i.test(form.anabinInstitutionId ?? "") && /^[a-f\d]{24}$/i.test(form.anabinDegreeId ?? "");
    direct = selectedRecords && form.institutionStatus === "hplus" && form.degreeStatus === "equivalent" && form.anabinDegreeAssociation === "institution";
    if (!direct) threshold = 6;
    if (!selectedRecords) issues.push("Select a university and a degree from the Anabin search suggestions.");
    if (selectedRecords && form.anabinDegreeAssociation !== "institution") issues.push("This is a country-level degree record; its link to the selected university requires verification.");
    if (!["hplus", "conditional"].includes(form.institutionStatus)) issues.push("Verify the university's recognition in Anabin; the institution check is incomplete or negative.");
    if (!["equivalent", "partial"].includes(form.degreeStatus)) issues.push("Verify the exact degree and specialisation in Anabin or obtain a ZAB assessment.");
    if (form.institutionStatus === "conditional" || form.degreeStatus === "partial") issues.push("Conditional or partial recognition needs an individual document review.");
    if (!Number.isInteger(age) || age < 18 || age > 100) issues.push("Enter a valid adult age.");
    const selectedLevel = level(form.languageLevel);
    if (!["german", "english"].includes(form.language)) issues.push("Choose German or English.");
    if (!direct && ((form.language === "german" && selectedLevel < 1) || (form.language === "english" && selectedLevel < 4))) issues.push("For the points route, document German A1 or English B2 or higher in your selected language.");
    if (!form.languageLevel) issues.push("Select your language level.");
    if (!["none", "two", "five"].includes(form.experience)) issues.push("Select your relevant experience.");
    add("Age", age >= 18 && age <= 35 ? 2 : age > 35 && age < 40 ? 1 : 0);
    add("Relevant experience", form.experience === "five" ? 3 : form.experience === "two" ? 2 : 0);
    const languagePoints = form.language === "german" ? (selectedLevel >= 4 ? 3 : selectedLevel === 3 ? 2 : selectedLevel === 2 ? 1 : 0) : form.language === "english" && selectedLevel >= 5 ? 1 : 0;
    add(form.language === "english" ? "English" : "German", languagePoints);
  } else if (route === "austria") {
    threshold = 70;
    if (!Number.isInteger(age) || age < 18 || age > 100) issues.push("Enter a valid adult age.");
    const education = { none: 0, degree: 20, mint: 30, phd: 40 }[form.education] ?? 0;
    add("Qualifications & skills", Math.min(40, education + (form.research === "yes" ? 20 : 0) + (form.awards === "yes" ? 20 : 0)));
    const years = number(form.years);
    if (years < 0 || years > 60) issues.push("Enter relevant experience between 0 and 60 years.");
    add("Relevant experience", Math.min(20, Math.floor(Math.max(0, Math.min(years, 60)) * 2) + (form.austrianExperience === "yes" ? 10 : 0)));
    const selectedLevel = level(form.languageLevel);
    const basicLanguage = ["german", "english"].includes(form.language);
    const otherLanguage = ["french", "spanish", "bosnian", "croatian", "serbian"].includes(form.language);
    if (!basicLanguage && !otherLanguage) issues.push("Choose one language.");
    if (!form.languageLevel) issues.push("Select your language level.");
    add("Selected language", basicLanguage ? (selectedLevel >= 2 ? 10 : selectedLevel === 1 ? 5 : 0) : otherLanguage && selectedLevel >= 3 ? 5 : 0);
    add("Age", age >= 18 && age < 35 ? 20 : age >= 35 && age < 40 ? 15 : age >= 40 && age < 45 ? 10 : 0);
  } else if (route === "sweden") {
    requireYes("secondCycle", "Document a qualification equivalent to Swedish second-cycle studies (such as a qualifying master's or PhD).");
    requireYes("outsideSweden", "Apply while you are outside Sweden.");
    const years = number(form.years);
    if (years < 0 || years > 60) issues.push("Enter experience in your field of study between 0 and 60 years.");
  } else {
    if (!Number.isInteger(age) || age < 18 || age >= 35) issues.push("This screening covers adults under 35.");
    if (level(form.german) < 4) issues.push("German B2 or higher is required for this MG screening.");
    if (!["diploma", "secondary"].includes(form.school)) issues.push("A secondary-school certificate or diploma is required for this screening; university-access equivalence still needs verification.");
  }

  const total = breakdown.length ? breakdown.reduce((sum, item) => sum + item.points, 0) : null;
  if (threshold !== null && (total ?? 0) < threshold) issues.push(`You need at least ${threshold} points; your current score is ${total ?? 0}.`);
  const funds = checkBankFunds(route, form, fx);
  if (funds.status === "empty" || funds.status === "invalid") issues.push("Enter a valid available bank balance.");
  if (funds.status === "rates-unavailable") issues.push("The currency rate is unavailable. Retry it or enter a balance in the required currency.");
  if (funds.status === "shortfall") issues.push(`Your bank balance is short by ${formatFunding(funds.shortfall!, funds.currency)}.`);
  return { total, threshold, breakdown, issues, meetsCriteria: issues.length === 0, direct, funds };
}
