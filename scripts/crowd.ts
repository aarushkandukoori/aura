/**
 * Background followers ("the crowd"): ~1,200 believable usernames with a shared pool of AI avatars.
 * They fill "Liked by", follower lists and story viewers, and leave quick comments.
 * No AI is needed for names; a seeded random generator makes the output the same every run.
 */
import type { CastImage, CrowdAccount } from '../shared/cast.ts'

const FIRST = `ava mia zoe lily emma nora ella aria luna maya leah ruby isla ivy hazel chloe grace sofia camila
priya ananya aisha fatima amara zara yara noor leila hana yuki mei jia sora min ji-woo seo-yeon
olivia amelia harper evelyn abigail emily madison scarlett victoria riley aubrey brooklyn savannah
jasmine destiny imani nia kiara tiana aaliyah gabriela valentina lucia daniela mariana paola renata
liam noah oliver elijah james lucas mason ethan logan jackson levi mateo jack owen leo ezra miles
kai theo jude ryan nathan aaron isaac dylan caleb adrian julian marcus andre malik darius jamal tyrese
arjun rohan dev kabir aditya vikram rahul omar karim yusuf hamza tariq kenji haruto ren jun hiro
min-jun ji-ho seo-jun wei hao chen bao diego carlos javier mateus rafael santiago thiago gabriel
alex jordan taylor casey riley morgan quinn avery rowan sage skyler river jamie emerson`.split(/\s+/)

const LAST = `smith johnson lee kim park nguyen tran patel shah singh garcia martinez rodriguez lopez gonzalez
hernandez perez sanchez ramirez torres rivera flores gomez diaz reyes cruz morales ortiz gutierrez
chavez ramos ruiz alvarez mendoza castillo jimenez moreno romero herrera medina aguilar vargas
williams brown jones miller davis wilson anderson thomas moore jackson martin thompson white harris
clark lewis robinson walker young allen king wright scott green baker adams nelson hill campbell
mitchell roberts carter phillips evans turner parker collins edwards stewart morris murphy cook
rogers morgan cooper peterson reed bailey bell kelly howard ward cox richardson wood watson brooks
bennett gray james hughes price sanders myers long ross foster okafor adeyemi mensah diallo ali
hassan khan chaudhry iyer reddy menon rao nair kapoor malhotra wang zhang liu chen yang huang zhao
wu zhou xu sun ma tanaka suzuki takahashi watanabe ito yamamoto nakamura kobayashi sato silva
santos oliveira souza costa pereira almeida ferreira rossi russo bianchi romano novak kowalski`.split(/\s+/)

const WORDS = `sunny lowkey vibes daily official real just itz its the not sleepy coffee matcha film
studio diaries journal world club bby x.o loves eats travels moves fits shots photo art dump
archive era core soft wild golden velvet cosmic lunar indie neon pixel mango peach cherry`.split(/\s+/)

/** Mulberry32: a tiny seeded random number generator (same seed -> same sequence). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

export function makeCrowd(count: number, avatarFiles: string[]): CrowdAccount[] {
  const random = seeded(2026)
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const used = new Set<string>()
  const accounts: CrowdAccount[] = []

  while (accounts.length < count) {
    const first = pick(FIRST)
    const last = pick(LAST)
    const n = Math.floor(random() * 99) + 1
    const f = first.replace(/[^a-z]/g, '')
    const patterns = [
      `${f}.${last}`, `${f}_${last}`, `${f}${last}${n}`, `${f}.${last.charAt(0)}`, `${pick(WORDS)}.${f}`,
      `${f}${pick(WORDS)}`, `its${f}${last.charAt(0)}`, `${f}__${n}`, `${f}.${pick(WORDS)}`, `${last}.${f}`,
      `_${f}${last}`, `${f}${last.slice(0, 3)}`, `${f}.${n}`, `x${f}x`, `${f}${last}.${pick(WORDS)}`,
    ]
    const username = pick(patterns).slice(0, 28)
    if (used.has(username)) continue
    used.add(username)

    const id = `u${String(accounts.length + 1).padStart(4, '0')}`
    const displayName = random() < 0.12 ? cap(f) : `${cap(first)} ${cap(last)}`
    // ~75% have a profile picture from the shared pool, the rest show the default silhouette.
    const avatar = random() < 0.75 && avatarFiles.length ? pick(avatarFiles) : null
    accounts.push({ id, username, displayName, avatar })
  }
  return accounts
}

/** Prompts for the shared crowd avatar pool: mostly casual selfies, plus pets, scenery and objects. */
export function crowdAvatarPrompts(count: number): CastImage[] {
  const random = seeded(77)
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const people = ['young woman', 'young man', 'woman in her late twenties', 'man in his early thirties', 'college student', 'teenage-looking adult woman of 19', 'man in his twenties', 'woman in her thirties']
  const looks = ['East Asian', 'South Asian', 'Black', 'Latina', 'Latino', 'white', 'Middle Eastern', 'Southeast Asian', 'mixed-race']
  const hair = ['curly hair', 'a messy bun', 'short buzzed hair', 'long straight hair', 'braids', 'a bob haircut', 'wavy shoulder-length hair', 'a baseball cap', 'a beanie', 'locs']
  const places = ['in a car', 'at a cafe', 'on a city street at night', 'at the beach at sunset', 'in a bedroom with fairy lights', 'at a concert', 'on a hiking trail', 'in a mirror selfie', 'at a park', 'at a rooftop party']
  const other = [
    'close-up photo of a fluffy orange cat looking at the camera',
    'a golden retriever puppy smiling in the grass',
    'a pink and orange sunset over the ocean',
    'a cup of latte art on a wooden table, top-down',
    'a vintage film camera on a bedsheet, soft light',
    'a sunflower against a blue sky',
    'a skateboard on a city sidewalk, low angle',
    'neon city lights at night, bokeh',
    'a black cat with green eyes on a windowsill',
    'a small succulent plant in a terracotta pot',
    'mountains reflected in a calm lake at dawn',
    'a french bulldog wearing a tiny sweater',
  ]
  const images: CastImage[] = []
  for (let i = 0; i < count; i++) {
    const prompt =
      i % 6 === 5
        ? `${pick(other)}, square crop, casual phone photo used as a profile picture`
        : `casual phone selfie of a ${pick(looks)} ${pick(people)} with ${pick(hair)}, ${pick(places)}, natural light, candid smile, square profile picture`
    images.push({ prompt, file: `/content/images/crowd/a${String(i + 1).padStart(2, '0')}.webp`, width: 512, height: 512 })
  }
  return images
}

/** Avatars the user can pick during onboarding instead of uploading a photo. */
export function presetAvatarPrompts(): CastImage[] {
  const prompts = [
    'soft glowing iridescent aura orb in lilac, peach and mint on a cream background, dreamy gradient, minimal',
    'a calico cat sitting in a sunbeam, cozy, film photo',
    'pastel pink and orange sunset clouds, dreamy, film grain',
    'a vintage film camera on a sunny windowsill with a plant, film photo',
    'a cute shiba inu puppy smiling, close-up, soft light',
    'a single bright yellow sunflower against a clear blue sky',
    'city skyline at blue hour with lights reflecting on water',
    'a cup of iced matcha latte on a marble table, top-down, soft light',
  ]
  return prompts.map((prompt, i) => ({ prompt, file: `/content/images/presets/${i + 1}.webp`, width: 512, height: 512 }))
}
