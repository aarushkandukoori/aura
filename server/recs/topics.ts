/**
 * Topics: what a post is about, from a fixed list of 33 (food, coffee, travel, pets...).
 *
 * The recommendation algorithm learns which topics each person likes, so every post needs topics.
 * They come from keyword rules run over the caption, hashtags and location (counted twice, the
 * author chose those words) and over ai_note, what the picture shows (the image prompt for library
 * posts, the AI's description for the user's own photos).
 *
 * Library posts and stories also have AI-checked topics in content/topics.json (made once by
 * scripts/tag-topics.ts). Those win when they exist; keyword rules cover everything else, like
 * the user's own posts.
 *
 *   topicsOfText('iced oat latte before class #coffee')   // ['coffee', 'study']
 */
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.ts'
import { escapeRegex } from '../repo/text.ts'

/**
 * Every topic with the words that point to it. A word matches as a word start ("cook" also
 * matches "cooking"). A word ending in "$" must be the whole word (a plural "s" is fine): "tea$"
 * matches "tea" and "teas" but not "teacher". A RegExp is used as written, for the few words that
 * need context ("film" is about movies unless it is film for a camera).
 */
const TOPIC_WORDS: Record<string, (string | RegExp)[]> = {
  food: ['food', 'restaurant', 'dinner', 'lunch', 'brunch', 'breakfast', 'taco', 'ramen', 'pizza', 'burger', 'wings$',
    'pho$', 'sushi', 'dumpling', 'noodle', 'bbq', 'barbecue', 'street food', 'snack', 'dessert', 'pastr', 'croissant',
    'bakery', 'bakeries', 'bread', 'donut', 'ice cream', 'gelato', 'cake$', 'cookie', 'pie$', 'sandwich', 'bagel',
    'fries', 'curry', 'jollof', 'tamale', 'empanada', 'salsa$', 'chips', 'pancake', 'waffle', 'deep-dish', 'deep dish',
    'hot pot', 'spicy', 'wing spot', 'farmers market', 'smoothie', 'rice$', 'eggs$', 'cheese', 'chicken', 'pork',
    'steak', 'soup', 'salad', 'pasta', 'avocado', 'tortilla', 'feast', 'menu', 'snacks', 'burrito', 'nachos',
    'taco truck', 'pozole', 'stew', 'bowl of', 'plate of', 'diner$', 'takeout', 'sambar', 'dal$', 'kibbeh', 'hummus'],
  coffee: ['coffee', 'espresso', 'latte', 'cappuccino', 'cold brew', 'cafe', 'café', 'barista', 'matcha', 'chai',
    'tea$', 'boba', 'bubble tea', 'kissaten', 'pour-over', 'pour over', 'americano', 'cortado'],
  cooking: ['cook', 'recipe', 'homemade', 'home-made', 'baking', 'baked', 'bake$', 'dough', 'knead', 'oven',
    'stovetop', 'skillet', 'simmer', 'chopping', 'cutting board', 'meal prep', 'ingredient', 'apron', 'grill',
    'marinade', 'sourdough', 'challah', 'from scratch', 'stir-fry', 'frying pan', 'sheet pan', 'cast iron',
    'cook-off', 'kombucha', 'brewing', 'chile$', 'chiles$', 'spices', 'molcajete', 'brisket', 'smoker$'],
  travel: ['travel', 'trip$', 'vacation', 'abroad', 'flight', 'airport', 'plane$', 'passport', 'suitcase', 'luggage',
    'hotel', 'hostel', 'itinerary', 'train$', 'train station', 'sightseeing', 'tourist', 'backpacking', 'road trip',
    'jet lag', 'souvenir', 'tokyo', 'kyoto', 'osaka', 'lisbon', 'paris', 'rome$', 'italy', 'japan', 'mexico city',
    'seoul', 'bangkok', 'iceland', 'overseas', 'boarding', 'window seat', 'slow travel', 'hidden gem'],
  beach: ['beach', 'ocean', 'sea$', 'seaside', 'waves$', 'surf', 'sand$', 'sandy', 'shore', 'coast', 'boardwalk',
    'snorkel', 'pier$', 'sea turtle', 'tide', 'seashell', 'lifeguard', 'bay$'],
  city: ['city', 'skyline', 'downtown', 'street$', 'streets$', 'subway', 'metro$', 'rooftop', 'neighborhood', 'bodega',
    'crosswalk', 'alley', 'skyscraper', 'brooklyn', 'manhattan', 'nyc', 'chicago', 'bridge', 'traffic', 'taxi',
    'architecture', 'architect', 'building', 'facade', 'storefront', 'sidewalk', 'block party', 'urban'],
  outdoors: ['hike', 'hiking', 'hiker', 'trail', 'summit', 'camping', 'campfire', 'campsite', 'tent$', 'climb', 'boulder',
    'kayak', 'canoe', 'national park', 'mountain', 'peak$', 'cliff', 'desert', 'canyon', 'outdoor', 'wilderness',
    'backcountry', 'trailhead', 'lookout', 'ridge$'],
  nature: ['nature', 'flower', 'bloom', 'garden', 'wildflower', 'forest', 'woods', 'tree$', 'sunrise', 'sunset',
    'meadow', 'bird$', 'birdwatch', 'birding', 'butterfly', 'moss', 'lake$', 'river', 'clouds', 'rainbow', 'fog',
    'misty', 'sunflower', 'leaves', 'autumn leaves', 'valley', 'stars$', 'starry', 'moon$', 'waterfall', 'greenhouse'],
  fitness: ['fitness', 'gym$', 'workout', 'lifting', 'deadlift', 'squat', 'bench press', 'powerlift', 'running', 'runner',
    'marathon', '5k$', '10k$', 'yoga', 'pilates', 'stretch', 'protein', 'training', 'treadmill', 'barbell', 'dumbbell',
    'kettlebell', 'personal record', 'leg day', 'sweat$', 'sweaty', 'spin class', 'smoothie bowl', 'warmup', 'warm-up'],
  sports: ['sport', 'soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'volleyball', 'rugby',
    'cricket', 'gaelic', 'league', 'game day', 'match day', 'stadium', 'arena', 'jersey', 'touchdown', 'home run',
    'fantasy football', 'fantasy league', 'fantasy sports', 'tailgat', 'playoff', 'referee', 'hoops', 'pickup game',
    'scoreboard', 'bleachers', 'courtside', 'kickoff', 'goalie', 'dugout'],
  cycling: ['bike', 'bicycle', 'cycling', 'cyclist', 'bike ride', 'bike shop', 'pedal', 'handlebar', 'derailleur',
    'road bike', 'fixie', 'spokes', 'helmet'],
  pets: ['pet$', 'pets$', 'dog$', 'dogs$', 'doggo', 'puppy', 'pup$', 'pups$', 'cat$', 'cats$', 'kitten', 'kitty', 'corgi',
    'beagle', 'chihuahua', 'paws', 'leash', 'vet$', 'golden retriever', 'tabby', 'litter', 'fetch$', 'three-legged'],
  fashion: ['fashion', 'outfit', 'ootd', 'fit check', 'fit pic', 'styling', 'styled', 'thrift', 'wardrobe', 'closet',
    'lookbook', 'sneaker', 'try-on', 'runway', 'vintage market', 'vintage store', 'vintage shop', 'flea market',
    'modest fashion', 'streetwear', 'accessor', 'tailored', 'denim', 'boutique', 'hijab style', 'knitwear', 'blazer',
    'trench coat', 'wide-leg', 'the look', 'new set', 'fit$'],
  beauty: ['beauty', 'makeup', 'lipstick', 'skincare', 'skin care', 'nail$', 'nails$', 'manicure', 'nail art', 'hairstyl',
    'hair styling', 'braids', 'salon', 'perfume', 'fragrance', 'glam', 'lashes', 'blush', 'eyeliner', 'serum',
    'curls', 'blowout', 'silk press', 'haircut'],
  art: ['art$', 'arts$', 'artist', 'artwork', 'paint', 'watercolor', 'sketch', 'drawing', 'illustrat', 'pottery',
    'ceramic', 'clay', 'kiln', 'glaze', 'museum', 'gallery', 'exhibit', 'mural', 'craft', 'knitting', 'knitted',
    'yarn', 'crochet',
    'embroider', 'sticker', 'zine', 'design', 'calligraphy', 'stationery', 'canvas', 'easel', 'gouache', 'wheel throw'],
  photography: ['photography', 'photographer', 'film camera', 'film photo', 'disposable camera', 'vintage camera',
    'camera bag', 'camera strap', 'holding a camera', '35mm', 'lens$', 'lenses', 'darkroom', 'polaroid', 'photo walk',
    'contact sheet', 'film roll', 'negatives', 'shutter', 'tripod', 'rangefinder', 'medium format', 'prints$'],
  music: ['music', 'musician', 'song', 'guitar', 'piano', 'vinyl', 'record player', 'record store', 'concert', 'gig$',
    'live music', 'band$', 'album', 'playlist', 'headphones', 'karaoke', 'open mic', 'soundcheck', 'mixing board',
    'jazz', 'folk$', 'beatmaking', 'beat-making', 'beats$', 'microphone', 'mic$', 'setlist', 'music festival', 'choir',
    'gospel', 'singing', 'drummer', 'drums', 'bass$', 'synth', 'ukulele', 'violin', 'speaker', 'amp$', 'turntable',
    'cast album', 'soundtrack', 'hip-hop', 'rapper', 'lyric', 'mixing console', 'sound guy', 'stage lights'],
  dance: ['danc', 'salsa class', 'salsa night', 'ballet', 'bachata', 'choreo', 'bollywood', 'line danc', 'twirl',
    'dance floor', 'tango', 'two-step', 'studio mirror'],
  film: [/(?<!(?:roll|rolls|shot|shoot) (?:of |on )?)film(?!\s*(?:camera|photo|roll|stock|lab|scan|grain|strip|into))/, 'movie', 'cinema', 'theater', 'theatre', 'horror',
    'popcorn', 'netflix', 'tv show', 'episode', 'binge', 'k-drama', 'kdrama', 'telenovela', 'reality tv',
    'reality show', 'dating show', 'rom-com', 'romcom', 'screening', 'premiere', 'broadway', 'box office', 'sitcom',
    'documentar', 'true crime', 'podcast'],
  books: ['book', 'novel', 'reading', 'read$', 'library', 'poetry', 'poem', 'chapter', 'paperback', 'hardcover',
    'kindle', 'journal', 'author', 'bookmark', 'fantasy series', 'annotat'],
  gaming: ['gaming', 'gamer', 'video game', 'videogame', 'game console', 'gaming console', 'controller', 'nintendo', 'playstation', 'xbox',
    'board game', 'tabletop', 'dice', 'puzzle', 'crossword', 'arcade', 'chess', 'esports', 'cozy game', 'indie game',
    'game night', 'card game', 'speedrun', 'handheld', 'animal crossing', 'strategy game'],
  tech: ['tech$', 'laptop', 'keyboard', 'keycap', 'coding', 'code$', 'programm', 'computer', 'gadget', 'phone repair',
    'screen repair', 'soldering', 'circuit', 'robot', 'app$', 'software', 'monitor', 'desk setup', 'battle station',
    'motherboard', 'hackathon', 'raspberry pi', 'smartwatch', 'refurbish', 'python', 'javascript'],
  science: ['science', 'scientist', 'chemistry', 'biology', 'physics', 'lab coat', 'experiment', 'beaker', 'microscope',
    'telescope', 'marine bio', 'specimen', 'periodic table', 'research', 'fossil', 'astronomy', 'planetarium',
    'test tube', 'reef survey', 'lab bench', 'graduated cylinder', 'science demo', 'safety goggles', 'hatchling'],
  comedy: ['comedy', 'comedian', 'stand-up', 'standup', 'joke', 'punchline', 'pun$', 'puns$', 'meme', 'roast',
    'heckl', 'crowd work', 'open mic', 'dad joke', 'sketch comedy', 'improv'],
  nightlife: ['party', 'partying', 'nightclub', 'club$', 'clubbing', 'cocktail', 'drinks$', 'bar crawl', 'dive bar',
    'wine bar', 'rooftop bar', 'happy hour', 'karaoke', 'dance floor', 'night out', 'dj$', 'shots$', 'neon',
    'bartender', 'margarita', 'mocktail', 'beer', 'wine$', 'late-night', 'after party'],
  friends: ['friends', 'friend group', 'besties', 'bestie', 'crew$', 'squad', 'group of', 'roommate', 'hangout',
    'hang out', 'reunion', 'game night', 'girls night', 'boys night', 'the gang', 'group chat', 'gc$', 'all of us',
    'everyone came'],
  family: ['family', 'mom$', 'moms$', 'mama', 'mother', 'dad$', 'father', 'grandma', 'grandmother', 'abuela', 'abuelo',
    'grandpa', 'sister', 'brother', 'cousin', 'aunt', 'uncle', 'niece', 'nephew', 'parents', 'siblings', 'tia$',
    'lola$', 'nana$', 'baby shower'],
  selfie: ['selfie', 'mirror pic', 'mirror selfie', 'front-camera', 'front camera', 'front-facing', 'self-portrait',
    'self portrait', 'face card', 'photo booth'],
  home: ['cozy', 'home$', 'apartment', 'living room', 'bedroom', 'couch', 'sofa', 'blanket', 'candle', 'houseplant',
    'plants$', 'interior', 'decor', 'rug$', 'pillow', 'reading nook', 'windowsill', 'bookshelf', 'shelves',
    'label maker', 'organiz', 'rearrang', 'fairy lights', 'string lights', 'pajama', 'nest$'],
  study: ['study', 'studying', 'exam', 'finals', 'midterm', 'campus', 'class$', 'classes', 'lecture', 'homework', 'dorm',
    'textbook', 'notes$', 'thesis', 'semester', 'syllabus', 'flashcard', 'notebook', 'highlighter', 'grad school',
    'student', 'college', 'library carrel'],
  work: ['at work', 'from work', 'after work', 'before work', 'off work', 'work tee', 'office$', 'shift$', 'night shift', 'coworker', 'co-worker', 'scrubs', 'hospital', 'classroom',
    'clinic', 'courtroom', 'boss$', 'deadline', 'meeting', 'commute', 'break room', 'clocked', 'payday', 'job$',
    'workday', 'first day', 'on call', 'warehouse', 'pharmacy', 'patient', 'workstation', 'locker room', 'lab coat'],
  celebrations: ['birthday', 'bday', 'wedding', 'graduation', 'anniversary', 'holiday', 'christmas', 'xmas', 'halloween',
    'thanksgiving', 'diwali', 'eid$', 'hanukkah', 'new year', 'celebrat', 'confetti', 'balloon', 'candles on',
    'party hat', 'cheers', 'fireworks', 'costume'],
  wellness: ['self-care', 'self care', 'selfcare', 'meditat', 'mindful', 'therapy', 'rest day', 'bubble bath', 'spa$',
    'mental health', 'body neutral', 'affirmation', 'nap$', 'sleep in', 'slow morning', 'reset', 'walk$', 'walks$',
    'journaling', 'gratitude', 'wellness', 'skincare night'],
}

/** Emoji in captions count like words ("🌮🔥🔥" is about food). Generic ones like 🔥 or 😂 say nothing. */
const TOPIC_EMOJI: Record<string, string> = {
  food: '🌮🍕🍜🍔🍟🌯🥟🍣🍱🥞🧇🍰🧁🍩🍪🍦🍝🥗🥘🍲🌶🥐🥯🍞🥪🍗🍖🥩🍤🍙',
  coffee: '☕🍵🧋',
  cooking: '🍳🔪',
  travel: '✈🧳🗺🌍🌎🌏🚆🚂🏝',
  beach: '🏖🌊🐚🏄🐢',
  city: '🏙🌆🌃🗽🚕🚇',
  outdoors: '🏔⛰🏕⛺🥾🧗',
  nature: '🌿🌻🌸🌷🌼🍂🍁🌅🌄🌙🌧🌈🐦🦅🌱',
  fitness: '💪🏋🏃🧘',
  sports: '🏀⚽🏈⚾🏒🎾🏐🏆',
  cycling: '🚲🚴',
  pets: '🐶🐕🐱🐈🐾🐩',
  fashion: '👗👠👟🧥👜🕶',
  beauty: '💄💅💇',
  art: '🎨🖌✏✍🖍🏺🧶',
  photography: '📷📸🎞',
  music: '🎧🎵🎶🎸🎹🎤🥁🎷🎛',
  dance: '💃🕺🩰',
  film: '🎬🍿📺🎥',
  books: '📚📖📓',
  gaming: '🎮🕹🎲🧩♟',
  tech: '💻⌨🖥🤖',
  science: '🔬🧪🔭🧬',
  nightlife: '🍸🍹🍻🥂🍷🍺🪩',
  friends: '👯',
  selfie: '🤳',
  home: '🛋🕯🪴🧸',
  study: '📝🎓🏫',
  work: '💼',
  celebrations: '🎉🎊🥳🎂🎁🎈🎃🎄🪔',
  wellness: '🛁',
}

/** Every topic id, in the order above. */
export const TOPICS = Object.keys(TOPIC_WORDS)

/** Topic names for people: "Because you like #coffee", "Lately into: coffee, film". */
const LABELS: Record<string, string> = {
  celebrations: 'celebrations', film: 'movies and TV', home: 'cozy home stuff', study: 'student life', work: 'work life',
}

export function topicLabel(topic: string): string {
  return LABELS[topic] ?? topic
}

/** Words people use for a topic that aren't in its keyword list (interest chips, hashtags). */
const ALIASES: Record<string, string> = {
  movies: 'film', movie: 'film', tv: 'film', reading: 'books', animals: 'pets', dogs: 'pets', cats: 'pets',
  hiking: 'outdoors', camping: 'outdoors', gym: 'fitness', workout: 'fitness', foodie: 'food', baking: 'cooking',
  makeup: 'beauty', skincare: 'beauty', games: 'gaming', videogames: 'gaming', photo: 'photography',
  photos: 'photography', partying: 'nightlife', parties: 'nightlife', pottery: 'art', crafts: 'art', design: 'art',
  architecture: 'city', school: 'study', college: 'study', job: 'work', biking: 'cycling', bikes: 'cycling',
  fantasyfootball: 'sports', ootd: 'fashion', modestfashion: 'fashion', karaoke: 'music', climbing: 'outdoors',
}

// ----- matching -------------------------------------------------------------------------------

/**
 * One regex per topic that finds all of its words and emoji (global, so matches can be counted).
 * Words must start at a word boundary; emoji can sit anywhere.
 */
const PATTERNS: [topic: string, pattern: RegExp][] = TOPICS.map((topic) => {
  const words = TOPIC_WORDS[topic].map((word) => {
    if (word instanceof RegExp) return word.source
    return word.endsWith('$') ? `${escapeRegex(word.slice(0, -1))}s?\\b` : escapeRegex(word)
  })
  const emoji = [...(TOPIC_EMOJI[topic] ?? '')].map(escapeRegex)
  return [topic, new RegExp(`\\b(?:${words.join('|')})${emoji.length > 0 ? `|${emoji.join('|')}` : ''}`, 'giu')]
})

/** How many times each topic's words appear in a text. */
function countHits(text: string): Map<string, number> {
  const hits = new Map<string, number>()
  if (!text) return hits
  const plain = text.replaceAll('\uFE0F', '') // "✈️" and "✈" are the same emoji
  for (const [topic, pattern] of PATTERNS) {
    const count = plain.match(pattern)?.length ?? 0
    if (count > 0) hits.set(topic, count)
  }
  return hits
}

/** At most this many topics per post: the main one and up to two more. */
const MAX_TOPICS = 3

/**
 * Turn hit counts into a short ranked list. Weak extras are dropped: a cooking post with a mug in
 * the background is about cooking, not coffee (a topic needs a quarter of the best one's hits).
 */
function strongest(scores: Map<string, number>): string[] {
  const best = Math.max(0, ...scores.values())
  return [...scores]
    .filter(([, score]) => score >= Math.max(1, best * 0.25))
    .sort((a, b) => b[1] - a[1] || TOPICS.indexOf(a[0]) - TOPICS.indexOf(b[0]))
    .slice(0, MAX_TOPICS)
    .map(([topic]) => topic)
}

/** Topics of a piece of text, strongest first. */
export function topicsOfText(text: string): string[] {
  return strongest(countHits(text))
}

/**
 * Topics of a post. The caption and hashtags count double (the author chose those words).
 * The picture description counts once for its first part, which names what the picture is of
 * ("Overhead shot of a mechanical keyboard"), and half for the rest, which is mostly background
 * ("...a mug of tea beside it"). `look` is the author's usual appearance, which every library
 * image prompt starts with ("...thrifted vintage jackets..."): it says nothing about this post.
 */
export function topicsOfPostText(post: { caption: string; location?: string | null; note?: string | null }, look = ''): string[] {
  const scores = new Map<string, number>()
  const add = (text: string, weight: number) => {
    for (const [topic, count] of countHits(text)) scores.set(topic, (scores.get(topic) ?? 0) + count * weight)
  }
  add(post.caption, 2)
  add(post.location ?? '', 1)
  const note = look ? (post.note ?? '').split(look).join(' ') : post.note ?? ''
  // Carousels and reels describe each picture, separated by " | ".
  for (const picture of note.split(' | ')) {
    const comma = picture.indexOf(',')
    add(comma < 0 ? picture : picture.slice(0, comma), 1)
    if (comma >= 0) add(picture.slice(comma + 1), 0.5)
  }
  for (const tag of post.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const topic = topicOfWord(tag[1])
    if (topic) scores.set(topic, (scores.get(topic) ?? 0) + 2) // "#coffee" says it outright
  }
  return strongest(scores)
}

/** A single word or hashtag that names a topic ("coffee", "movies", "ootd"), or null. */
function topicOfWord(word: string): string | null {
  const clean = word.trim().replace(/^#/, '').toLowerCase()
  if (TOPIC_WORDS[clean]) return clean
  if (ALIASES[clean]) return ALIASES[clean]
  return null
}

/**
 * Topics an interest points to: "movies" -> film, "film photography" -> photography,
 * "taco truck rankings" -> food. Used for onboarding interests, searches and hashtag pages.
 */
export function topicsOfInterest(interest: string): string[] {
  const named = topicOfWord(interest)
  if (named) return [named]
  return topicsOfText(interest).slice(0, 2)
}

// ----- library topics from content/topics.json ------------------------------------------------

/** What scripts/tag-topics.ts writes: library id ("maya-p3") -> topics, strongest first. */
export interface TopicsFile {
  version: 1
  generatedAt: string
  model: string
  topics: Record<string, string[]>
}

let libraryTopics: Record<string, string[]> | null = null

/** Topics checked by the AI for a library post or story, or [] when there are none. */
export function libraryTopicsFor(sourceId: string | null | undefined): string[] {
  if (!sourceId) return []
  libraryTopics ??= readTopicsFile()
  return libraryTopics[sourceId] ?? []
}

function readTopicsFile(): Record<string, string[]> {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(config.contentDir, 'topics.json'), 'utf8')) as Partial<TopicsFile>
    const topics: Record<string, string[]> = {}
    for (const [id, list] of Object.entries(file.topics ?? {})) {
      // Only topics from the list above, so a stale file can't invent new ones.
      if (Array.isArray(list)) topics[id] = list.filter((topic) => TOPIC_WORDS[topic]).slice(0, MAX_TOPICS)
    }
    return topics
  } catch {
    return {} // no file yet: the keyword rules do all the work
  }
}
