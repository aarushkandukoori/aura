/**
 * Emoji used around Messages: the quick reactions, the composer's picker and group chat icons.
 */

/** The six quick reactions in a message's picker. The first one is what a double tap sends. */
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍']

/** The composer's emoji picker: an 8 x 8 grid of the emoji people actually send. */
export const PICKER_EMOJI = [
  '😂', '🤣', '😭', '🥹', '😊', '😍', '🥰', '😘',
  '😎', '🤩', '🥳', '😅', '🙃', '😉', '😏', '😴',
  '🤔', '🤭', '😳', '😬', '🙄', '😤', '😡', '🤯',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💕', '💖', '✨', '🔥', '💯', '🎉', '👏', '🙌',
  '🙏', '👍', '👎', '👀', '💪', '🤝', '👋', '✌️',
  '🌸', '🌞', '🌙', '⭐', '🌈', '☕', '🍕', '🍜',
  '🎧', '🎶', '📸', '🎬', '✈️', '🏖️', '🐶', '🐱',
]

/** Icons a group chat can wear instead of its members' faces. */
export const GROUP_EMOJI = ['💌', '🎧', '🍻', '🔥', '✨', '🌸', '🎉', '📸', '🍕', '⚽', '🎮', '🏀', '🌙', '☕', '🐶', '💜']

// Pictographs, skin tones, flags, joiners and variation selectors - and spaces between them.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u

/** true for a short message made only of emoji ("😂", "❤️🔥"): chats show those big, without a bubble. */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || !EMOJI_ONLY.test(trimmed)) return false
  // Count what people see as single emoji (a family or a flag is several code points but one picture).
  const pictures = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
    .filter((part) => part.segment.trim() !== '')
  return pictures.length <= 3
}
