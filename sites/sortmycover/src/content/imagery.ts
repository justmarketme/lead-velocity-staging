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
  /* hub pages */
  hubCover: s("hub-cover", "A couple walking in the park", "Black and white mixed South African couple, about 40, walking in Delta Park with a pram, Johannesburg"),
  hubWills: s("hub-wills", "A family looking at old photographs", "White South African family across three generations looking at an old photo album at a dining table, Stellenbosch"),
} satisfies Record<string, SceneImage>;

/** The four hero mosaic tiles, in reading order. */
export const HERO_MOSAIC: SceneImage[] = [SCENES.heroKitchen, SCENES.heroBaby, SCENES.heroMove, SCENES.heroMorning];

/** Campaign slug -> its own scene. */
export const CAMPAIGN_SCENES: Record<string, SceneImage> = {
  "adviser-conversation": SCENES.cAdviser,
  "new-bond": SCENES.cNewBond,
  "salary-stops": SCENES.cSalaryStops,
  "cover-gap": SCENES.cCoverGap,
  "owners-directors": SCENES.cOwners,
  "new-baby": SCENES.cNewBaby,
  "children-guardian": SCENES.cGuardian,
  "will-myth": SCENES.cWillMyth,
  "will-and-cover": SCENES.cWillCover,
  "where-is-the-will": SCENES.cWhereWill,
};
