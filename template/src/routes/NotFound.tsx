import { Link } from '@tanstack/react-router'
import { AccentHeading, linkClass } from '../components/ui'
import { t } from '../text'

export function NotFound() {
  return (
    <section>
      <AccentHeading>{t.notFound}</AccentHeading>
      <p>
        <Link to="/" className={linkClass}>
          {t.backToItems}
        </Link>
      </p>
    </section>
  )
}
