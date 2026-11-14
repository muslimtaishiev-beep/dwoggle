import { useEffect, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { navigate, type Route } from '../router.ts'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
}

/** A real link (it can be opened in a new tab) that changes page without a reload on a plain click. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a {...rest} href={to} onClick={handleClick} />
}

/** Sends the visitor to another page, replacing the current history entry. */
export function Redirect({ to }: { to: Route }) {
  useEffect(() => {
    navigate(to, { replace: true })
  }, [to])
  return null
}
