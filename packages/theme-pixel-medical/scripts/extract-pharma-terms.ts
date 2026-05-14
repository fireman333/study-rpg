/**
 * extract-pharma-terms.ts
 *
 * Read 藥理 questions from the bound content pack, extract candidate medical
 * proper nouns, classify into 5 categories matching the slot mapping defined
 * in design.md, and emit `src/items.terms.json` for downstream item-rename work.
 *
 * Categories (mirror slot mapping):
 *   - receptor       -> head slot
 *   - drug_class     -> body slot
 *   - specific_drug  -> weapon slot
 *   - mechanism      -> charm slot
 *   - adverse_effect -> consumable slot
 *
 * Run:
 *   pnpm --filter @study-rpg/theme-pixel-medical extract-terms
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Path resolution (script lives at packages/theme-pixel-medical/scripts/) ──
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const QUESTIONS_PATH = resolve(
  REPO_ROOT,
  'apps/medexam-tw/public/content/medexam-tw/questions.json',
)
const OUT_PATH = resolve(__dirname, '..', 'src', 'items.terms.json')

// ── Types ───────────────────────────────────────────────────────────────────
type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR'
type Category =
  | 'receptor'
  | 'drug_class'
  | 'specific_drug'
  | 'mechanism'
  | 'adverse_effect'

interface RawQuestion {
  id: string
  subject: string
  stem: string
  options: Record<string, string>
  answer: string
  explanation: string
  meta: { year: number; session: number; book: string; qNumber: number }
}

interface Candidate {
  term: string
  count: number
  questions: number // distinct question ids
  sourceQuestionIds: string[] // first 5
  inAnswerContext: number // appearance in the correct answer or explanation
  suggestedRarity: Rarity
  flavorDraft: string
}

// ── Term dictionaries (curated; not auto-mined to keep output deterministic) ─

const RECEPTORS: string[] = [
  // adrenergic
  'α1-adrenergic', 'α2-adrenergic', 'β1-adrenergic', 'β2-adrenergic',
  // cholinergic
  'muscarinic receptor', 'nicotinic receptor', 'M1 receptor', 'M2 receptor', 'M3 receptor',
  // monoamine / neuro
  '5-HT receptor', '5-HT3 receptor', 'dopamine receptor', 'D2 receptor',
  'GABA-A receptor', 'NMDA receptor', 'opioid receptor', 'μ-opioid receptor',
  // others
  'PPAR-γ', 'estrogen receptor', 'androgen receptor', 'histamine receptor',
  'H1 receptor', 'H2 receptor', 'angiotensin II receptor',
  // channels / pumps / transporters
  'sodium channel', 'calcium channel', 'potassium channel', 'L-type calcium channel',
  'Na-K ATPase', 'proton pump', 'SGLT2', 'GLUT', 'serotonin transporter',
  'dopamine transporter', 'NET',
]

const DRUG_CLASSES: string[] = [
  'β-blocker', 'α-blocker', 'ACE inhibitor', 'ARB', 'thiazide', 'loop diuretic',
  'calcium channel blocker', 'statin', 'NSAID', 'SSRI', 'SNRI', 'TCA',
  'MAO inhibitor', 'benzodiazepine', 'barbiturate', 'opioid',
  'corticosteroid', 'glucocorticoid', 'PPI', 'H2 blocker',
  'aminoglycoside', 'cephalosporin', 'penicillin', 'macrolide', 'fluoroquinolone',
  'tetracycline', 'sulfonamide', 'antifungal', 'antiviral',
  'thiazolidinedione', 'sulfonylurea', 'biguanide', 'DPP-4 inhibitor',
  'SGLT2 inhibitor', 'GLP-1 agonist', 'insulin',
  'antipsychotic', 'antiepileptic', 'anticoagulant', 'antiplatelet',
  'bisphosphonate', 'antihistamine',
]

const SPECIFIC_DRUGS: string[] = [
  // analgesic / antipyretic
  'aspirin', 'acetaminophen', 'ibuprofen', 'naproxen', 'celecoxib', 'morphine',
  'fentanyl', 'codeine', 'tramadol', 'methadone', 'naloxone',
  // cardiovascular
  'propranolol', 'metoprolol', 'atenolol', 'carvedilol', 'labetalol',
  'enalapril', 'lisinopril', 'captopril', 'losartan', 'valsartan',
  'amlodipine', 'nifedipine', 'verapamil', 'diltiazem',
  'hydrochlorothiazide', 'furosemide', 'spironolactone', 'eplerenone',
  'digoxin', 'amiodarone', 'lidocaine',
  'atorvastatin', 'simvastatin', 'rosuvastatin',
  'warfarin', 'heparin', 'clopidogrel', 'aspirin', 'rivaroxaban',
  // diabetes
  'metformin', 'pioglitazone', 'rosiglitazone', 'glyburide', 'glipizide',
  'sitagliptin', 'empagliflozin', 'liraglutide',
  // psych
  'fluoxetine', 'sertraline', 'paroxetine', 'citalopram', 'venlafaxine',
  'amitriptyline', 'imipramine', 'lithium', 'haloperidol', 'risperidone',
  'olanzapine', 'clozapine', 'diazepam', 'lorazepam', 'alprazolam',
  'phenobarbital', 'phenytoin', 'carbamazepine', 'valproate', 'lamotrigine',
  // GI
  'omeprazole', 'lansoprazole', 'ranitidine', 'cimetidine',
  // antimicrobial
  'penicillin', 'amoxicillin', 'ampicillin', 'cefazolin', 'ceftriaxone',
  'vancomycin', 'gentamicin', 'tobramycin', 'azithromycin', 'erythromycin',
  'ciprofloxacin', 'levofloxacin', 'doxycycline', 'rifampin', 'isoniazid',
  'fluconazole', 'amphotericin B', 'acyclovir',
  // chemotherapy / immunosuppressant
  'cisplatin', 'methotrexate', 'cyclophosphamide', '5-fluorouracil',
  'tamoxifen', 'imatinib', 'rituximab', 'trastuzumab', 'doxorubicin',
  'cyclosporine', 'tacrolimus',
  // endocrine
  'levothyroxine', 'prednisone', 'dexamethasone', 'hydrocortisone',
  // misc
  'atropine', 'epinephrine', 'norepinephrine', 'dopamine', 'dobutamine',
  'sildenafil', 'theophylline', 'albuterol', 'salbutamol',
]

const MECHANISMS: string[] = [
  'cyclooxygenase', 'COX-1', 'COX-2', 'cytochrome P450', 'CYP3A4', 'CYP2D6',
  'CYP2C9', 'MAO', 'acetylcholinesterase',
  'first-pass metabolism', 'phase I metabolism', 'phase II metabolism',
  'glucuronidation', 'enzyme induction', 'enzyme inhibition',
  'GABA potentiation', 'channel block', 'receptor agonism', 'receptor antagonism',
  'competitive antagonism', 'noncompetitive antagonism', 'partial agonist',
  'reuptake inhibition', 'efflux pump', 'P-glycoprotein',
  'protein binding', 'zero-order kinetics', 'first-order kinetics',
  'half-life', 'bioavailability', 'volume of distribution', 'clearance',
  'aldosterone antagonism', 'angiotensin conversion', 'renin inhibition',
  'HMG-CoA reductase', 'vitamin K cycle',
]

const ADVERSE_EFFECTS: string[] = [
  'QT prolongation', 'torsades de pointes', 'Stevens-Johnson syndrome',
  'serotonin syndrome', 'neuroleptic malignant syndrome',
  'hepatotoxicity', 'nephrotoxicity', 'ototoxicity', 'cardiotoxicity',
  'agranulocytosis', 'thrombocytopenia', 'rhabdomyolysis',
  'hyperkalemia', 'hypokalemia', 'hyponatremia', 'hyperglycemia',
  'gynecomastia', 'priapism', 'tardive dyskinesia',
  'extrapyramidal symptom', 'cytochrome induction', 'cytochrome inhibition',
  'first-pass effect', 'drug-drug interaction',
  'tolerance', 'dependence', 'withdrawal',
  'anaphylaxis', 'angioedema', 'photosensitivity',
  'lactic acidosis', 'metabolic acidosis',
  'pulmonary fibrosis', 'pancreatitis',
]

const CATEGORY_TERMS: Record<Category, string[]> = {
  receptor: RECEPTORS,
  drug_class: DRUG_CLASSES,
  specific_drug: SPECIFIC_DRUGS,
  mechanism: MECHANISMS,
  adverse_effect: ADVERSE_EFFECTS,
}

// ── Matching helpers ────────────────────────────────────────────────────────

/** Build a case-insensitive matcher for a multi-word term.
 *  Greek letters (α / β / γ) and hyphens are treated as literal.
 *  We also accept underscore or hyphen variants and ASCII alpha/beta. */
function buildMatcher(term: string): RegExp {
  // Normalize term: lowercase, allow optional hyphen/space between segments
  const escaped = term
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Allow space, hyphen, or nothing between tokens like "β-blocker" / "β blocker"
    .replace(/[-\s]+/g, '[\\s\\-]?')
  // Accept Greek + ASCII aliases for α / β / γ
  const grekified = escaped
    .replace(/α/g, '(?:α|alpha)')
    .replace(/β/g, '(?:β|beta)')
    .replace(/γ/g, '(?:γ|gamma)')
  // Word boundary works poorly across CJK; use lookarounds for ASCII-letter boundaries only
  return new RegExp(`(?<![a-z0-9])${grekified}(?![a-z0-9])`, 'gi')
}

/** Count matches of `term` in a haystack of strings. Returns total + boolean
 *  "appears at all". */
function countMatches(haystack: string, term: string): number {
  const re = buildMatcher(term)
  const m = haystack.match(re)
  return m ? m.length : 0
}

// ── Importance heuristic → rarity tier ──────────────────────────────────────

/**
 * Map a (questions, count, answerContextCount) tuple to a rarity suggestion.
 * Per design.md §"Rarity 對應「醫學重要性」啟發":
 *   - high freq, basic mechanism      → N
 *   - first-line clinical drug        → R
 *   - specialty / narrow-TI           → SR
 *   - high-yield differential         → SSR
 *   - Nobel-tier / paradigm-shifting  → UR (manual override)
 */
function suggestRarity(
  category: Category,
  term: string,
  count: number,
  questions: number,
  inAnswerContext: number,
): Rarity {
  const t = term.toLowerCase()

  // Manual UR override — Nobel-tier / paradigm shifters
  const URList = ['penicillin', 'insulin', 'cisplatin', 'imatinib']
  if (URList.includes(t) && category === 'specific_drug') return 'UR'

  // SSR overrides — classic landmark concepts
  const SSRList = [
    'digoxin', 'warfarin', 'lithium', 'theophylline',
    'serotonin syndrome', 'torsades de pointes',
    'cytochrome p450', 'cyp3a4',
  ]
  if (SSRList.includes(t)) return 'SSR'

  // SR — narrow-therapeutic-index or specialty drug heuristic
  const SRList = [
    'methotrexate', 'amiodarone', 'tacrolimus', 'cyclosporine',
    'phenytoin', 'carbamazepine', 'valproate', 'clozapine',
    'qt prolongation', 'rhabdomyolysis', 'hepatotoxicity',
    'tardive dyskinesia',
  ]
  if (SRList.includes(t)) return 'SR'

  if (questions >= 10 || count >= 15) return 'N'
  if (questions >= 4 || inAnswerContext >= 2) return 'R'
  if (questions >= 2) return 'R'
  return 'N'
}

// ── Flavor draft (very rough; main thread T3 will refine per WLK voice) ─────

function flavorDraft(category: Category, term: string, rarity: Rarity): string {
  const t = term.toLowerCase()
  // Hand-tuned drafts for the highest-yield terms; the rest get a category default
  const HAND: Record<string, string> = {
    aspirin: '心梗、預防、止痛，全能老兵。',
    acetaminophen: '發燒先吃這顆，肝不要爆。',
    morphine: '止痛之王，呼吸抑制要小心。',
    warfarin: 'INR 沒控好就是腦出血。',
    digoxin: '治療窗超窄，過量看到黃綠光。',
    metformin: '糖尿病一線，腎不好不能吃。',
    'β-blocker': '心衰、高血壓、表現焦慮萬靈丹。',
    ssri: '抗憂鬱第一線，起效要等兩週。',
    nsaid: '消炎止痛，胃會痛、腎會壞。',
    statin: '降膽固醇神器，注意肌肉痛。',
    'ace inhibitor': '降壓護腎，但會咳到崩潰。',
    penicillin: '1928 培養皿污染，改變人類歷史。',
    insulin: '從狗胰臟萃出來的諾貝爾獎。',
    cisplatin: '化療始祖，順鉑救千萬人命。',
    imatinib: 'CML 終結者，靶向治療開山祖。',
    'cytochrome p450': '所有藥物交互作用的元兇。',
    'qt prolongation': '心電圖一拉長就準備電擊。',
    'serotonin syndrome': '兩種抗憂鬱合用的死亡警告。',
    'first-pass metabolism': '口服進去剩一半，肝太認真。',
    'first-pass effect': '吃下去先被肝幹掉一半。',
    'nmda receptor': 'ketamine 跟記憶都靠它。',
    'gaba-a receptor': '失眠、抗焦慮、麻醉都認它。',
    'β1-adrenergic': '心臟跳得快不快它說了算。',
    'α1-adrenergic': '血管收縮的開關。',
  }
  const hit = HAND[t]
  if (hit) return hit
  // Category-default placeholder (main thread will refine)
  const def: Record<Category, string> = {
    receptor: '考過的 receptor，記得 downstream。',
    drug_class: '一線藥，主治會考。',
    specific_drug: '考古題常客，背起來。',
    mechanism: '記住機轉，題目自己解。',
    adverse_effect: '副作用題眼，看到就選。',
  }
  return def[category]
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`[extract-pharma-terms] reading ${QUESTIONS_PATH}`)
  const raw = readFileSync(QUESTIONS_PATH, 'utf-8')
  const questions: RawQuestion[] = JSON.parse(raw)
  console.log(`[extract-pharma-terms] loaded ${questions.length} questions`)

  // Per-question haystack: stem + all options + answer-option-text + explanation
  const perQ: { id: string; haystack: string; answerHaystack: string }[] =
    questions.map((q) => {
      const optionsText = Object.values(q.options ?? {}).join(' ')
      const answerKey = q.answer
      const answerOptionText = q.options?.[answerKey] ?? ''
      const haystack = [q.stem, optionsText, q.explanation].filter(Boolean).join('  ')
      const answerHaystack = [answerOptionText, q.explanation].filter(Boolean).join('  ')
      return { id: q.id, haystack, answerHaystack }
    })

  const out: {
    extractedAt: string
    sourceQuestionsCount: number
    categories: Record<Category, Candidate[]>
  } = {
    extractedAt: new Date().toISOString(),
    sourceQuestionsCount: questions.length,
    categories: {
      receptor: [],
      drug_class: [],
      specific_drug: [],
      mechanism: [],
      adverse_effect: [],
    },
  }

  const categories: Category[] = [
    'receptor',
    'drug_class',
    'specific_drug',
    'mechanism',
    'adverse_effect',
  ]

  for (const cat of categories) {
    const terms = CATEGORY_TERMS[cat]
    const candidates: Candidate[] = []
    for (const term of terms) {
      let count = 0
      let inAnswerContext = 0
      const matchedQs: string[] = []
      for (const q of perQ) {
        const c = countMatches(q.haystack, term)
        if (c > 0) {
          count += c
          matchedQs.push(q.id)
          const ac = countMatches(q.answerHaystack, term)
          if (ac > 0) inAnswerContext += 1
        }
      }
      if (count === 0) continue
      const questionsHit = matchedQs.length
      const suggestedRarity = suggestRarity(cat, term, count, questionsHit, inAnswerContext)
      candidates.push({
        term,
        count,
        questions: questionsHit,
        sourceQuestionIds: matchedQs.slice(0, 5),
        inAnswerContext,
        suggestedRarity,
        flavorDraft: flavorDraft(cat, term, suggestedRarity),
      })
    }
    // Sort: by question count desc, then total count desc
    candidates.sort((a, b) => b.questions - a.questions || b.count - a.count)
    out.categories[cat] = candidates.slice(0, 14) // top ~12-14 per category
    console.log(
      `[extract-pharma-terms] ${cat}: ${candidates.length} matched, kept ${out.categories[cat].length}`,
    )
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8')
  console.log(`[extract-pharma-terms] wrote ${OUT_PATH}`)
}

main()
