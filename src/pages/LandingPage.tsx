import mockReport from '../../mock/report.json'
import { parseReport } from '../api/parseReport.ts'
import { CHECK_IDS, GRADES } from '../api/types.ts'
import { CoreDiagram } from '../components/CoreDiagram.tsx'
import { GradeBadge } from '../components/GradeBadge.tsx'
import { SiteHeader } from '../components/SiteHeader.tsx'
import { useI18n } from '../i18n/context.ts'
import { sortChecks } from '../report/checks.ts'
import { Link } from '../components/Link.tsx'
import { ROUTES } from '../router.ts'
import './site.css'
import './LandingPage.css'

// The figure on this page is an illustration. It shows the sample report, and the caption says so.
const SAMPLE_CHECKS = sortChecks(parseReport(mockReport).checks)

const STEPS = [1, 2, 3] as const

/** What Dwoggle is, how it works and what it does not claim, with the way into the map. */
export function LandingPage() {
  const { t } = useI18n()

  return (
    <div className="site landing">
      <SiteHeader />

      <main>
        <section className="landing__hero">
          <div className="landing__intro">
            <h1 className="landing__title display">{t('landing.title')}</h1>
            <p className="landing__lead">{t('landing.lead')}</p>
            <Link to={ROUTES.map} className="button button--primary landing__cta">
              {t('site.open_map')}
            </Link>
          </div>
          <figure className="landing__figure">
            <CoreDiagram checks={SAMPLE_CHECKS} />
            <figcaption className="landing__caption">{t('landing.example_caption')}</figcaption>
          </figure>
        </section>

        <div className="landing__paper">
          <section className="landing__section" aria-labelledby="landing-how">
            <h2 id="landing-how" className="landing__heading display">
              {t('landing.how.title')}
            </h2>
            <ol className="landing__steps">
              {STEPS.map((step) => (
                <li key={step} className="landing__step">
                  <h3 className="landing__step-title display">{t(`landing.how.step${step}.title`)}</h3>
                  <p>{t(`landing.how.step${step}.text`)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="landing__section" aria-labelledby="landing-checks">
            <h2 id="landing-checks" className="landing__heading display">
              {t('landing.checks.title')}
            </h2>
            <dl className="landing__checks">
              {CHECK_IDS.map((id) => (
                <div key={id} className={`landing__check landing__check--${id}`}>
                  <dt className="landing__check-name display">{t(`check.${id}`)}</dt>
                  <dd>{t(`landing.checks.${id}`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="landing__section" aria-labelledby="landing-trust">
            <h2 id="landing-trust" className="landing__heading display">
              {t('landing.trust.title')}
            </h2>
            <div className="landing__trust">
              <div className="landing__trust-text">
                <p>{t('landing.trust.text')}</p>
                <p>{t('grading.rule.no_data')}</p>
                <p>{t('grading.rule.trend')}</p>
                <p>{t('grading.rule.resolution')}</p>
              </div>
              <dl className="landing__grades">
                {GRADES.map((grade) => (
                  <div key={grade} className="landing__grade">
                    <dt>
                      <GradeBadge grade={grade} size="sm" />
                    </dt>
                    <dd>{t(`grade.${grade}`)}</dd>
                  </div>
                ))}
                <div className="landing__grade">
                  <dt>
                    <GradeBadge grade={null} size="sm" />
                  </dt>
                  <dd>{t('report.no_data')}</dd>
                </div>
              </dl>
            </div>
            <Link to={ROUTES.map} className="button button--primary landing__cta">
              {t('site.open_map')}
            </Link>
          </section>
        </div>
      </main>

      <footer className="landing__footer">
        <p>{t('app.disclaimer')}</p>
        <p>{t('landing.footer.challenge')}</p>
      </footer>
    </div>
  )
}
