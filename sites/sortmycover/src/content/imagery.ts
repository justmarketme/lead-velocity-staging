/* Every people image on the site, in one place, one fresh scene per slot (Jono, 16 Oct 2026: no image is used twice).
   tests/imagery.test.ts fails if two slots share a file or a file is missing.
   Across the site the scenes rotate Black, Coloured, Indian and white South African households, aged roughly 35-50.
   Images are decorative life scenes generated in Google Flow and finished in Canva, never clients, advisers or testimonials
   (CODEX-BRIEF section 6). `scene` is the Flow prompt core; the shared style line is in deliverables/website/flow-image-brief.md. */
export type SceneImage = { src: string; alt: string; w: number; h: number; scene: string };

const s = (key: string, alt: string, scene: string, w = 1440, h = 966): SceneImage => ({ src: `/img/${key}.webp`, alt, w, h, scene });

export const SCENES = {
  /* home: hero mosaic (all four groups in the first screen) */
  heroKitchen: s("hero-kitchen", "A couple talking at their kitchen table", "Black South African couple, early 40s, talking and smiling at a light wooden kitchen table with coffee, Johannesburg home, morning light", 1440, 1788),
  heroBaby: s("hero-baby", "Parents with their baby in the living room", "Indian South African couple, mid-30s, the father holding a baby, the mother laughing, bright Durban living room with plants", 1440, 1076),
  heroMove: s("hero-move", "A couple unpacking boxes in a new home", "Coloured South African couple, late 30s, unpacking cardboard boxes in a new Cape Town house, Table Mountain soft through the window", 1440, 1788),
  heroMorning: s("hero-morning", "A parent getting ready for work", "White South African mother, mid-40s, laptop bag on her shoulder, child's school bag on a chair, morning routine in a Pretoria home", 1440, 1076),
  /* home: life-moment picker */
  momentBond: s("moment-bond", "A couple holding the keys to a new home", "Indian South African couple, about 40, standing at the front door of a new townhouse in Umhlanga, holding a set of keys, smiling at each other"),
  momentBaby: s("moment-baby", "A father with a newborn at home", "White South African father, late 30s, rocking a newborn by a sunny window in a Centurion home, quiet and tender"),
  momentIncome: s("moment-income", "A working parent leaving for the day", "Black South African woman, about 40, in a nurse's or office uniform kissing her son goodbye at the front gate of a Soweto home, early morning"),
  momentBusiness: s("moment-business", "A business owner in a workshop", "Coloured South African man, about 45, owner of a small furniture workshop in Paarl, sleeves rolled up, sanding a table, one employee in soft focus"),
  momentWill: s("moment-will", "Grandparents and grandchildren together", "Black South African couple, about 50, on a garden bench with two grandchildren, Pretoria east garden, late afternoon"),
  /* home: the two calls, and the two editorial bands */
  svcCover: s("svc-cover", "A couple on a video call at home", "White South African couple, mid-40s, on a sofa having a relaxed video call on a laptop, Johannesburg north home, evening lamp light"),
  svcWills: s("svc-wills", "A couple reading papers at a dining table", "Indian South African couple, about 50, reading a folder of papers with reading glasses at a dining table, calm and focused, Durban home"),
  edCover: s("ed-cover", "A family cooking together", "Coloured South African family, parents and two teenagers, cooking together in a Cape Town kitchen, laughing", 1440, 2146),
  edWills: s("ed-wills", "Two sisters talking over tea", "Black South African sisters, 40s, talking over tea on a stoep, Bloemfontein, warm light"),
  /* campaign landing pages, one each (config/angles.json) */
  cAdviser: s("c-adviser", "A person on a phone call at home", "Indian South African woman, about 42, on a relaxed phone call on her stoep with a notebook, Johannesburg"),
  cNewBond: s("c-new-bond", "A couple carrying a box into a new house", "White South African couple, late 30s, carrying a moving box up the path of a new house in Pretoria east"),
  cSalaryStops: s("c-salary-stops", "A commuter on the way to work", "Coloured South African man, about 40, walking to his car in work clothes with a coffee, Cape Town suburb, early morning"),
  cCoverGap: s("c-cover-gap", "A family at the dinner table", "Black South African family of four at the dinner table, Midrand home, warm evening light"),
  cOwners: s("c-owners", "A business owner in her shop", "Indian South African woman, about 45, owner of a small bakery in Pietermaritzburg, behind the counter, relaxed"),
  cNewBaby: s("c-new-baby", "Parents with a newborn on the couch", "Coloured South African couple, early 30s, with a newborn on the couch, Durbanville home"),
  cGuardian: s("c-guardian", "A parent walking children to school", "White South African father walking two young children to school, holding hands, Johannesburg suburb"),
  cWillMyth: s("c-will-myth", "A young couple at home with their dog", "Black South African couple, mid-30s, on the floor of a small flat with their dog, relaxed weekend, Braamfontein"),
  cWillCover: s("c-will-cover", "A couple planning at the kitchen counter", "Indian South African couple, about 45, at a kitchen counter with a notepad and laptop, Chatsworth home"),
  cWhereWill: s("c-where-will", "A woman putting a folder in a cabinet", "Coloured South African woman, about 50, placing a folder into a wooden filing cabinet in a study, Port Elizabeth home"),
  /* learn guides the cycle-1 paid ads link to (17 Oct 2026) */
  lHomeLoan: s("learn-home-loan", "A couple reading home loan papers at a dining table", "Black South African couple, late 30s, reading bond documents together at a dining table with a laptop and coffee, Johannesburg south home, soft daylight", 1264, 848),
  lIncome: s("learn-income", "A worker getting ready before an early shift", "Indian South African man, about 45, in a work shirt packing a lunch box in a Durban kitchen at dawn, car keys on the counter, calm", 1264, 848),
  lOwners: s("learn-owners", "A business owner at work in her nursery", "White South African woman, about 48, owner of a small plant nursery in the KwaZulu-Natal Midlands, clipboard in hand, greenhouse behind her, morning light", 1264, 848),
  lAdviser: s("learn-adviser", "A couple on a video call with notes beside them", "Coloured South African couple, early 40s, on a video call at a laptop in a Mitchells Plain living room, notebook open, listening, afternoon light", 1264, 848),
  /* hub pages */
  hubCover: s("hub-cover", "A couple walking in the park", "Black and white mixed South African couple, about 40, walking in Delta Park with a pram, Johannesburg"),
  /* the cycle-1 ads (Jono, 18 Oct 2026): the article and the campaign page an ad leads to show the ad's own photo, so a reader
     arriving from Facebook or Instagram sees the same picture. Cropped 3:2 from checklist/creative/ads/cycle1. */
  adNewBond: s("ad-new-bond", "A family at the front door of their new home", "Black South African couple, late 30s, with their daughter at the door of a new house, the new-bond ad photo", 896, 597),
  adSalaryStops: s("ad-salary-stops", "A mother getting her son ready for school", "Coloured South African mother, about 40, fixing her son's school blazer at the front door, Table Mountain behind, the salary-stops ad photo", 1440, 960),
  adOwners: s("ad-owners-directors", "A business owner in his workshop", "White South African man, about 48, owner of a joinery workshop, checking a tablet while his team works, the owners-directors ad photo", 1440, 960),
  adAdviser: s("ad-adviser-conversation", "A man on a phone call at home", "Indian South African man, about 40, smiling on a phone call at his kitchen counter with a notebook, the adviser-conversation ad photo", 1440, 960),
  /* every other guide: stills from the same four ad shoots, so the same households carry through the site */
  aLifeCover: s("a-life-cover", "A family laughing at the dinner table", "Indian South African family, parents about 40 and their son, at dinner", 1440, 960),
  aIncomeProtection: s("a-income-protection", "A working mother with her coffee before the day starts", "Coloured South African mother, about 40, in work clothes with a mug in her kitchen", 1440, 960),
  aSevereIllness: s("a-severe-illness", "A mother and son together on the couch", "Coloured South African mother, about 40, on the couch with her son reading", 1440, 960),
  aDisability: s("a-disability", "A business owner in his bakkie checking his phone", "White South African man, about 48, in the driver's seat of his work bakkie", 1440, 960),
  aCreditLife: s("a-credit-life", "A couple going through papers at home", "Black South African couple, late 30s, reading papers at a dining table in their new house", 1440, 960),
  aCoverGap: s("a-cover-gap", "A family looking at a laptop together", "White South African family, parents about 48 and their teenage daughter, at a laptop at home", 1440, 960),
  aPayslip: s("a-payslip", "A man reading a document at home", "Black South African man, late 30s, reading a sheet of paper at a table, moving boxes behind", 1440, 960),
  aHowItWorks: s("a-how-it-works", "A woman reading a message on her phone", "Black South African woman, late 30s, on her couch reading a message on her phone", 1440, 960),
  aTheCall: s("a-the-call", "A couple on a video call at home", "Black South African couple, late 30s, on a video call on a laptop in their living room", 1440, 960),
  aWhatToBring: s("a-what-to-bring", "A man on a video call with a notebook", "Indian South African man, about 40, on a video call at his kitchen counter with a notebook", 1440, 960),
  aCheckAdviser: s("a-check-adviser", "A man listening on a video call", "White South African man, about 48, listening on a video call at his desk", 1440, 960),
  aYourDetails: s("a-your-details", "A man reading a message on his phone", "Indian South African man, about 40, reading his phone on the sofa", 1440, 960),
  aWhatAWillDoes: s("a-what-a-will-does", "A mother kissing her son goodbye at the door", "Coloured South African mother, about 40, kissing her son at the front door before school", 1440, 960),
  aGuardians: s("a-guardians", "A father carrying his daughter on his shoulders", "Black South African family, late 30s, the daughter on her father's shoulders in the living room", 1440, 960),
  aEstateCosts: s("a-estate-costs", "A woman on a video call with notes", "Coloured South African woman, about 40, on a video call at a laptop with a notebook", 1440, 960),
  aEstateAdmin: s("a-estate-admin", "A woman working at a laptop in an office", "Coloured South African woman, about 40, at a laptop in a bright office", 1440, 960),
  pFaq: s("p-faq", "A man reading his phone at the kitchen counter", "Indian South African man, about 40, reading a message at his kitchen counter", 1440, 960),
  pAdvisers: s("p-advisers", "A man at his desk before a call", "Black South African man, about 50, at a desk with a laptop and bookshelves", 896, 597),
  pHomeWhatWeAre: s("p-home-what-we-are", "A business owner opening his workshop", "White South African man, about 48, pushing up the door of his workshop at sunrise", 1440, 960),
  hubWills: s("hub-wills", "A family looking at old photographs", "White South African family across three generations looking at an old photo album at a dining table, Stellenbosch"),
} satisfies Record<string, SceneImage>;

/** The four hero mosaic tiles, in reading order. */
export const HERO_MOSAIC: SceneImage[] = [SCENES.heroKitchen, SCENES.heroBaby, SCENES.heroMove, SCENES.heroMorning];

/** The four angles with a paid ad show the ad's own photo on their campaign page and on the guide the ad links to. */
export const AD_SCENES: Record<string, { scene: SceneImage; article: string }> = {
  "new-bond": { scene: SCENES.adNewBond, article: "life-cover-and-a-home-loan" },
  "salary-stops": { scene: SCENES.adSalaryStops, article: "income-protection-vs-disability-cover" },
  "owners-directors": { scene: SCENES.adOwners, article: "cover-for-business-owners-and-directors" },
  "adviser-conversation": { scene: SCENES.adAdviser, article: "questions-to-ask-a-financial-adviser" },
};

/** Campaign slug -> its scene. */
export const CAMPAIGN_SCENES: Record<string, SceneImage> = {
  "adviser-conversation": SCENES.adAdviser,
  "new-bond": SCENES.adNewBond,
  "salary-stops": SCENES.adSalaryStops,
  "cover-gap": SCENES.cCoverGap,
  "owners-directors": SCENES.adOwners,
  "new-baby": SCENES.cNewBaby,
  "children-guardian": SCENES.cGuardian,
  "will-myth": SCENES.cWillMyth,
  "will-and-cover": SCENES.cWillCover,
  "where-is-the-will": SCENES.cWhereWill,
};

/** Article slug -> its photo. Every guide has one (Jono, 18 Oct 2026). The four ad guides use the ad's photo. */
export const ARTICLE_SCENES: Record<string, SceneImage> = {
  "life-cover-and-a-home-loan": SCENES.adNewBond,
  "income-protection-vs-disability-cover": SCENES.adSalaryStops,
  "cover-for-business-owners-and-directors": SCENES.adOwners,
  "questions-to-ask-a-financial-adviser": SCENES.adAdviser,
  "life-cover": SCENES.aLifeCover,
  "income-protection": SCENES.aIncomeProtection,
  "severe-illness-cover": SCENES.aSevereIllness,
  "disability-cover": SCENES.aDisability,
  "life-events": SCENES.cNewBond,
  "what-is-credit-life-insurance": SCENES.aCreditLife,
  "what-is-a-life-cover-gap": SCENES.aCoverGap,
  "how-to-read-your-payslips-cover-line": SCENES.aPayslip,
  "how-sortmycover-works": SCENES.aHowItWorks,
  "what-happens-on-a-30-minute-call": SCENES.aTheCall,
  "what-to-bring-to-your-call": SCENES.aWhatToBring,
  "how-to-check-an-adviser": SCENES.aCheckAdviser,
  "what-happens-to-your-details": SCENES.aYourDetails,
  "how-to-complain": SCENES.lOwners,
  "estate-duty-south-africa": SCENES.lHomeLoan,
  "what-a-will-does": SCENES.aWhatAWillDoes,
  "guardians-and-childrens-trusts": SCENES.aGuardians,
  "estate-costs-and-a-will": SCENES.aEstateCosts,
  "estate-administration": SCENES.aEstateAdmin,
  "the-will-appointment": SCENES.lAdviser,
  "where-to-keep-a-will": SCENES.lIncome,
};

/** Page path -> its photo, shown under the page heading by PageFrame. */
export const PAGE_SCENES: Record<string, SceneImage> = {
  "/how-it-works/": SCENES.cAdviser,
  "/about/": SCENES.cOwners,
  "/advisers/": SCENES.pAdvisers,
  "/contact/": SCENES.cSalaryStops,
  "/faq/": SCENES.pFaq,
};
