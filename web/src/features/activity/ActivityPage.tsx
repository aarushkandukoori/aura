import { PageHeader } from '../../components'
import { ActivityList } from './ActivityList'

/** /activity: the notifications page (on phones it opens from the heart in the top bar). */
export function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-[600px] pb-6">
      <PageHeader title="Notifications" className="md:hidden" />
      <h1 className="hidden px-4 pb-2 pt-9 text-2xl font-bold md:block">Notifications</h1>
      <ActivityList />
    </div>
  )
}
