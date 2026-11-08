/**
 * Line banks for the offline templates (server/ai/offline.ts), used when no AI is available.
 *
 * Lines are written plainly; server/sim/voice.ts restyles them per character (lowercase, ALL
 * CAPS, signature emoji...). Slots like {thing} are filled from the caption or the chat, and a
 * line whose slot has no value is skipped. Slots: {name} the post author or the user (first
 * name), {thing} what the photo or message is about, {place} the location, {them} another
 * person's username or name, {interest} something the speaker is into.
 */
import type { Tone } from './voice.ts'

/** Comments on someone's post, by tone. */
export const POST_COMMENTS: Record<Tone, string[]> = {
  hype: [
    'no because the {thing}??', '{name} woke up and chose greatness', 'this is a whole event', 'lets gooo',
    'big day for the timeline', 'certified classic', 'the {thing} is insane', 'nobody is doing it like you',
    'hall of fame post', '{name} with the {thing} again', '{place} never looked this good', 'W post',
    'came back just to like it again', 'post of the year and it is not close', 'you are on a different level lately',
  ],
  chaotic: [
    'the {thing} omg', 'ok but the {thing}??', 'not me screenshotting this', 'excuse me who gave you permission',
    'this is so you it hurts', 'i was literally just thinking about you', 'the way i gasped',
    'take me to {place} immediately', "you can't just post this without warning", 'framing this and putting it on my fridge',
    'why is this making me emotional', 'ok main character', "i'm telling everyone i know you",
    '{name} what is this?? i love it', 'the {thing} is sending me',
  ],
  dry: [
    'acceptable.', 'ok fine. this is good.', 'the {thing} did not need to go this hard.', 'expected nothing. got this.',
    'filing this under proof you have taste.', 'you could have warned us.', 'rude to post this on a weekday.',
    'the {thing} has more personality than most people i know.', 'not bad for an amateur.',
    'i will be thinking about this for a normal amount of time.', 'who allowed you to be this photogenic.',
    'printing this. for evidence.', '{place}. of course.', 'this is the most you thing you have ever posted.',
  ],
  warm: [
    'this made me so happy', 'look at you!!', 'the {thing} is everything', 'okay this is so lovely',
    'you look so happy here', 'the light in this', '{place} suits you', 'saving this one', 'needed this today',
    'the {thing}!! so good', 'proud of you, always', 'this is such a good one {name}', 'my favorite post of yours',
    'okay the {thing} made my whole morning',
  ],
  proper: [
    'This is a genuinely great photo.', 'The {thing} steals the show.', 'I have questions about the {thing}, and I will be asking them.',
    'Strong work, as always.', 'This deserves to be printed and framed.', 'Excellent. No notes.',
    'Proud of you. This is lovely.', '{place} looks wonderful. Report back.', 'Objectively one of your best.',
    'Well done, {name}. Truly.', 'The composition here is excellent.', 'I would like to formally request the full story behind this.',
  ],
  fan: [
    "wait you're so cool", 'AHH the {thing}', 'okay this is my new wallpaper', 'saving this for inspo', 'how are you real',
    'every post is better than the last??', 'adding the {thing} to my vision board', 'not me checking your page every day',
    "this is so pretty i can't", 'okay the vibes in this', 'need to know where this is', 'this made my whole day',
    'how did you get this shot?', 'you always post at the perfect time',
  ],
  cool: [
    'obsessed.', 'great light.', 'solid.', 'clean.', 'this one.', 'love the framing.', 'quiet and good.', 'nice eye.',
    'perfect.', 'the colors.', 'the {thing}.', 'good one.',
  ],
}

/** One character answering another's comment under a post. */
export const CAST_REPLIES = [
  '@{them} literally', '@{them} i was about to say that', '@{them} the way we all thought it', '@{them} stop',
  "@{them} you're so right", '@{them} no because exactly', '@{them} calm down', '@{them} we know',
  '@{them} let them live', '@{them} said what we were all thinking', "@{them} this is why we're friends",
  '@{them} first of all, how dare you',
]

/** Strangers who follow the user. */
export const CROWD_COMMENTS = [
  'this is so good', 'the {thing} omg', 'obsessed with this', 'okay this is art', 'the vibes are immaculate',
  '{place} looks amazing', 'you never miss', 'this is my favorite post of yours', 'so pretty', 'iconic',
  'living for this', 'saved this', 'how is this so good', 'wow wow wow', 'the {thing} though',
  'this popped up at the perfect time', 'need more posts like this', 'love your page',
]

/** When a caption sounds like someone is struggling, the comments get gentle. */
export const SUPPORT_COMMENTS = ['here for you', 'sending you so much love', 'thinking of you', 'we love you', 'call me anytime, seriously']

/** A friend DMs the user about their new post: an opener, then a follow-up. */
export const POST_DM_OPENERS = [
  'ok your post', 'i just saw your post', "you posted and didn't tell me??", 'the {thing} in your post',
  'your new post is so good', 'wait your post', 'i liked it in like two seconds', "okay i'm obsessed with your post",
]
export const POST_DM_FOLLOWUPS = [
  'where was this', 'who took it', 'you look so happy', 'i need the full story', 'how did i not know about this',
  'the comments are going crazy btw', 'when are we doing this together', 'proud of you honestly',
  "send me the ones you didn't post",
]

/** The besties talk about the user's post in their group chat. */
export const GROUP_POST_LINES = [
  "did everyone see {name}'s post", '{name} posted!!', '{name} really said good morning to the timeline',
  "the {thing} in {name}'s post", 'i liked it in 0.2 seconds', 'we need to talk about the post',
  "i'm commenting at least twice", "{name} you're glowing lately what's going on", 'the comments are already a war zone',
  'not {name} being the main character again', "who's telling {name} it's their best one",
]

/** Replies in a chat, by what the user's message was about (see intentOf in voice.ts). */
export const CHAT_REPLIES: Record<string, string[]> = {
  howAreYou: ['honestly good! tired but good', 'surviving lol', 'better now that you texted', 'a lot going on but good. you?', "can't complain. what about you"],
  greeting: ['hiii', 'hey you', 'there you are', "heyyy what's up", 'hi!! i was just thinking about you'],
  question: ['ok wait good question', 'honestly? yes', 'hmm let me think', 'you already know the answer', "depends who's asking", "that's a tough one"],
  thanks: ['of course!!', 'anytime', 'always', 'stop you never have to thank me', "that's what i'm here for"],
  love: ['love you more', 'miss you too', "you're stuck with me", "okay now i'm emotional", 'same, always'],
  sad: ["oh no, i'm sorry", 'that sounds really hard', 'do you want to talk about it?', "i'm here, seriously", 'want me to call?'],
  goodNews: ['WAIT', 'no way!!', 'i knew it', "we're celebrating", "i'm so proud of you", 'this is the best news'],
  laugh: ['lmao', 'stop 😭', "i can't with you", 'crying', 'why are you like this', 'the way i laughed out loud'],
  plans: ["i'm in", 'yes please', 'what time', 'say less', "i'll be there", "only if you're buying"],
  photo: ['wait where is this', 'okay this is so good', 'i need to see more', "ok i'm jealous", 'why does your life look like a movie'],
  other: ['wait tell me more', "okay that's so real", 'honestly same', 'no because i was just thinking that', 'ok and then what', "that's so you"],
}

/** A second bubble that keeps the conversation going. */
export const FOLLOW_UPS = [
  'what are you up to today', "how's your week going", 'when are we hanging out', 'did you eat yet', "what's new with you",
  'tell me everything',
]

/**
 * When someone sounds like they are in crisis, every character answers with care and points to
 * 988 (the Suicide & Crisis Lifeline in the US). Sent in this order.
 */
export const CRISIS_REPLIES = [
  "hey. i'm really glad you told me, and i care about you a lot",
  "please reach out to someone you trust tonight. you can also call or text 988 any time, day or night, they're there to help",
  "i'm here too. do you want to tell me what's going on?",
]

/** A friend starts a DM out of the blue. */
export const DM_OPENERS = [
  'random but i saw something about {interest} today and thought of you', '{interest} update: i am fully obsessed',
  'your last post is still living in my head', 'i need your opinion on something', 'are you free this weekend',
  "miss you. that's the whole message", 'okay i have the funniest story for you', 'what are you doing rn',
  'still thinking about the {thing} from your post', 'quick question, how are you actually doing',
  'you would have loved today. so much {interest}',
]

/** A DM that has a reason (see dmOpener's `reason`). */
export const REASON_OPENERS: Record<'followed' | 'liked-post', string[]> = {
  followed: ['omg you followed me back', 'okay you following me just made my day', 'thank you for the follow!!'],
  'liked-post': ['you liked my post in like 4 seconds and i noticed', 'okay you liking that one means a lot', 'the fact that you liked it first'],
}

/** A group chat wakes up on its own: someone starts, others answer, sometimes the user is pulled in. */
export const CHATTER_STARTERS = [
  'can we talk about {interest} for a second', '{interest} update: it is going great, thanks for asking',
  'i need to tell you all about my {interest} situation', 'okay who else is obsessed with {interest} right now',
  'hot take incoming', "okay i need everyone's honest opinion", 'guess what happened at work today', 'i have news',
  'why is it so quiet in here', 'someone remind me why i said yes to plans tonight',
  'i just did something very stupid and i need support',
]
export const CHATTER_REPLIES = [
  'go on', 'oh no', 'tell us everything', "i'm in", 'not again lol', 'this better be good', 'wait what',
  "ok i'm listening", 'same honestly', 'say less', "we're all thinking it", 'this is why i love this chat',
]
export const CHATTER_PULL_INS = [
  '{name} back me up here', "{name} you're coming right?", '{name} what do you think', "we need {name}'s vote",
  '{name} you would love this', 'where is {name} when we need them', '{name} settle this',
]

/** A second member chiming in after someone answered the user in a group. */
export const GROUP_PILE_ONS = [
  '{them} literally', 'what {them} said', 'see {name} gets it', '{name} finally speaks', 'ok {name} has spoken',
  'this is why {name} is the favorite',
]

/** The first messages after the user joins. */
export const WELCOME_GROUP = [
  '{name} is HERE', 'FINALLY', 'the group is complete', 'welcome welcome', 'took you long enough',
  'ok now we can actually plan things', 'everyone act normal', 'hi {name}!!', 'who wants to tell {name} what they missed',
  'the chat just got 10x better', 'look who finally showed up', 'we were literally just talking about you',
  'ok the real fun starts now',
]
export const WELCOME_DM = [
  "you're finally on here!!", "okay i followed you, don't leave me on read", 'took you long enough honestly',
  "i'm so happy you're here", 'first one to message you. remember that', 'your page is already better than mine',
  'ok now i can actually tag you in things',
]
/** A fan's message request, sent right after the user joins (so nothing about their posts yet). */
export const REQUEST_OPENERS = ['hi!! sorry if this is random', "hi! hope this isn't weird"]
export const REQUEST_FOLLOW_UPS = [
  'i saw you just joined and had to say hi', 'your friends talk about you so much, i feel like i know you already',
  'no need to reply, i just wanted to say welcome',
]

/** Reactions and replies to the user's story. */
export const STORY_EMOJIS = ['😍', '🔥', '😂', '😮', '👏', '❤️', '✨', '🙌', '🥹', '💯']
export const STORY_REPLIES = [
  'wait where is this', 'ok the {thing}', 'need details immediately', 'this is so you', 'take me with you next time',
  'jealous', 'i love this', 'why does your life look like a movie', 'okay who are you with', 'this made my day',
]

/** Answering a question in the comments without giving everything away. */
export const QUESTION_REPLIES = ["i'll tell you everything later", 'dm me', 'long story', 'you have to come next time', 'ha, secret']

/** A post's author answering a comment on it. */
export const AUTHOR_REPLIES = [
  'thank you!!', 'you would notice that', 'stop 😭', 'okay you get it', "i knew you'd say that", "you're the best",
  'miss you!!', 'come next time', 'right??', 'only for you',
]

/** A close friend whose message was read but not answered. */
export const NUDGES = ['hello??', 'left me on read 💀', 'ok be like that', 'i see you reading these', 'the audacity', "fine i'll talk to myself then"]
