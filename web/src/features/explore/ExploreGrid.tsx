/**
 * The explore grid. Posts are laid out in blocks of 8 that fill three rows of a 3-column grid:
 *
 *   [ ][ ][ ]      three squares on top
 *   [ ][ ][T]      then a tall tile (T) beside four squares,
 *   [ ][ ][T]      so every third row starts a tall tile.
 *
 * The tall tile is the block's first reel (or its first post if it has none) and switches sides
 * every block. A block only depends on its own 8 posts, so loading more never moves tiles above.
 */
import { cx } from '../../lib/cx'
import type { Post } from '../../lib/types'
import { ExploreTile } from './ExploreTile'

const BLOCK_SIZE = 8

interface Block {
  top: Post[]   // the 3 squares in the first row
  tall: Post    // the tall tile
  rest: Post[]  // the 4 squares beside it
}

function makeBlock(posts: Post[]): Block {
  const tallIndex = Math.max(0, posts.findIndex((post) => post.kind === 'reel'))
  const others = posts.filter((_, index) => index !== tallIndex)
  return { top: others.slice(0, 3), tall: posts[tallIndex], rest: others.slice(3) }
}

/** Placement of the tall tile: column 1 or 3, rows 2-3. */
function tallPlacement(onLeft: boolean): string {
  return cx('row-span-2 row-start-2', onLeft ? 'col-start-1' : 'col-start-3')
}

const GAP = 'gap-0.5 md:gap-1'

interface ExploreGridProps {
  posts: Post[]
  /** No more pages: show the last few posts that don't fill a whole block. */
  done: boolean
}

export function ExploreGrid({ posts, done }: ExploreGridProps) {
  const blockCount = Math.floor(posts.length / BLOCK_SIZE)
  const blocks = Array.from({ length: blockCount }, (_, index) => makeBlock(posts.slice(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE)))
  // While more pages are coming, an unfinished last block waits for them instead of reshuffling later.
  const leftovers = done ? posts.slice(blockCount * BLOCK_SIZE) : []

  return (
    <div className={cx('flex flex-col', GAP)}>
      {blocks.map((block, index) => (
        <div key={block.tall.id} className={cx('grid aspect-square grid-cols-3 grid-rows-3', GAP)}>
          {block.top.map((post) => (
            <ExploreTile key={post.id} post={post} />
          ))}
          <ExploreTile post={block.tall} tall className={tallPlacement(index % 2 === 1)} />
          {block.rest.map((post) => (
            <ExploreTile key={post.id} post={post} />
          ))}
        </div>
      ))}
      {leftovers.length > 0 && (
        <div className={cx('grid grid-cols-3', GAP)}>
          {leftovers.map((post) => (
            <div key={post.id} className="aspect-square">
              <ExploreTile post={post} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Shimmering blocks in the same shape while the first page loads. */
export function ExploreGridSkeleton({ blocks = 2 }: { blocks?: number }) {
  return (
    <div aria-label="Loading posts" className={cx('flex flex-col', GAP)}>
      {Array.from({ length: blocks }, (_, block) => (
        <div key={block} className={cx('grid aspect-square grid-cols-3 grid-rows-3', GAP)}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="shimmer" />
          ))}
          <div className={cx('shimmer', tallPlacement(block % 2 === 1))} />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={`rest-${index}`} className="shimmer" />
          ))}
        </div>
      ))}
    </div>
  )
}
