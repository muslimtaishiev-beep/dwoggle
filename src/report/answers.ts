import { CHECK_IDS, GRADES, type CheckId, type Report } from '../api/types.ts'
import type { I18nContextValue } from '../i18n/context.ts'
import { buildAnswer, checkFact, PANEL_ORDER, reportSummary, whyAnswer } from './facts.ts'

/**
 * Dwoggle's answers in the chat. They are put together from the open report and the app's own texts: nothing is
 * made up, and the wording rules hold (risk signals, never a verdict or permission). A typed or spoken question
 * is matched to one of a few topics by the words in it.
 */
type I18n = Pick<I18nContextValue, 'lang' | 't' | 'formatNumber'>

/** What a question is about: one of the five checks, or one of the general topics. */
export type Topic = CheckId | 'build' | 'summary' | 'grades' | 'data' | 'unknown'

/**
 * Words and word stems that give a topic away, in English, Russian and Kyrgyz, lower case. A question belongs to
 * the first topic, in this order, one of whose stems it contains: so "can I build near the fault" is about
 * building, and "is the earthquake risk high" about earthquakes.
 */
const STEMS: readonly (readonly [Exclude<Topic, 'unknown'>, readonly string[]])[] = [
  ['build', ['build', 'construct', 'house', 'home', 'buy', 'строи', 'постро', 'стройк', 'дом', 'купи', 'покуп', 'жить', 'куруу', 'курса', 'курам', 'үй', 'сатып', 'жашоо']],
  ['earthquake', ['earthquake', 'quake', 'seism', 'fault', 'tremor', 'землетряс', 'сейсм', 'разлом', 'трясет', 'трясёт', 'толчк', 'жер титир', 'титирөө', 'жарака']],
  ['flood', ['flood', 'water', 'mudflow', 'river', 'rain', 'наводн', 'паводк', 'вода', 'воды', 'воде', 'затоп', 'сель', 'селя', 'селев', 'река', 'реки', 'дожд', 'суу', 'ташкын', 'дарыя', 'жамгыр', 'селдин']],
  ['landslide', ['landslide', 'slide', 'slope', 'оползн', 'склон', 'обвал', 'көчкү', 'эңкейиш']],
  ['heat', ['heat', 'hot', 'temperature', 'warm', 'жара', 'жарк', 'температур', 'тепл', 'ысык', 'аптап']],
  ['green', ['green', 'tree', 'plant', 'vegetation', 'зелен', 'зелён', 'раститель', 'дерев', 'жашыл', 'өсүмдүк', 'дарак']],
  ['grades', ['grade', 'letter', 'mean', 'оценк', 'букв', 'значит', 'означа', 'баалар', 'баасы', 'тамга', 'билдирет']],
  ['data', ['nasa', 'satellite', 'data', 'source', 'how do you know', 'спутник', 'данны', 'источник', 'откуда', 'наса', 'маалымат', 'булак', 'кайдан']],
  // Asked whether a place is safe or dangerous, Dwoggle answers with the warning signs: he never uses those words himself.
  ['summary', ['summary', 'overall', 'everything', 'tell me', 'find', 'safe', 'danger', 'risk', 'итог', 'вкратце', 'коротко', 'расскаж', 'нашёл', 'нашел', 'безопас', 'опасн', 'риск', 'жыйынтык', 'кыскача', 'айтып бер', 'коопсуз', 'коркунуч', 'тобокел']],
]

export function topicOf(question: string): Topic {
  const text = question.toLocaleLowerCase()
  return STEMS.find(([, stems]) => stems.some((stem) => text.includes(stem)))?.[0] ?? 'unknown'
}

function isCheck(topic: Topic): topic is CheckId {
  return (CHECK_IDS as readonly string[]).includes(topic)
}

/** "Earthquake: D. Strong warning signs found." and then the check's own sentences. */
function checkAnswer(id: CheckId, report: Report, i18n: I18n): string {
  const { t } = i18n
  const check = report.checks.find((item) => item.id === id)
  if (!check || check.grade === null) return `${t(`check.${id}`)}: ${t('grade.none')}. ${t('api.nodata')}`
  return `${t(`check.${id}`)}: ${check.grade}. ${t(`grade.${check.grade}`)}. ${whyAnswer(check, i18n)}`
}

/** The warning signs found, then one line for every check that has a grade. */
function summaryAnswer(report: Report, i18n: I18n): string {
  const { t } = i18n
  const lines = PANEL_ORDER.flatMap((id) => {
    const check = report.checks.find((item) => item.id === id)
    const fact = check ? checkFact(check, i18n) : null
    return check?.grade && fact ? [`${t(`check.${id}`)} ${check.grade}: ${fact}.`] : []
  })
  return [t('chat.signals_lead'), reportSummary(report, i18n), ...lines].join(' ')
}

/** Dwoggle's answer on a topic. Without a report he can still explain the grades and where the data comes from. */
export function answerTo(topic: Topic, report: Report | null, i18n: I18n): string {
  const { t } = i18n
  if (topic === 'grades') return [...GRADES.map((grade) => `${grade}: ${t(`grade.${grade}`)}.`), t('app.disclaimer')].join(' ')
  if (topic === 'data') return t('chat.data')
  if (report === null) return t('chat.need_place')
  if (topic === 'unknown') return t('chat.unknown')
  if (topic === 'build') return buildAnswer(report, i18n)
  if (topic === 'summary') return summaryAnswer(report, i18n)
  return isCheck(topic) ? checkAnswer(topic, report, i18n) : t('chat.unknown')
}
