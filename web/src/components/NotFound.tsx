import { Link } from 'react-router'

/** "This page wandered off" for unknown links and missing accounts or posts. */
export function NotFound({ title = 'This page wandered off.' }: { title?: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-24 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-4 max-w-sm text-[15px] text-muted">
        It may have been deleted, or the link has a typo.{' '}
        <Link to="/" className="font-semibold text-link hover:underline">
          Head back to your feed.
        </Link>
      </p>
    </div>
  )
}
