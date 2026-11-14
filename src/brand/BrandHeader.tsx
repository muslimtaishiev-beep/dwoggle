import { BrandMark } from './BrandMark.tsx'
import './brand.css'

/**
 * The header of the sign-up page and the dig: just the logo. These pages follow the browser's language,
 * and the dig asks for the language as its first question. The logo is not a link: the sign-up page is the
 * main page itself, and leaving the dig by accident would lose its answers.
 */
export function BrandHeader() {
  return (
    <header className="brand-header">
      <span className="brand-header__logo">
        <BrandMark />
      </span>
    </header>
  )
}
