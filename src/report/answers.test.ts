import { describe, expect, it } from 'vitest'
import mockReport from '../../mock/report.json'
import { parseReport } from '../api/parseReport.ts'
import { formatNumber, translate, type Lang, type MessageKey, type MessageParams } from '../i18n/i18n.ts'
import { answerTo, topicOf, type Topic } from './answers.ts'

const report = parseReport(mockReport)
const i18n = (lang: Lang) => ({
  lang,
  t: (key: MessageKey, params?: MessageParams) => translate(lang, key, params),
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => formatNumber(lang, n, options),
})

describe('topicOf', () => {
  it.each<[string, Topic]>([
    ['Why is earthquake a D?', 'earthquake'],
    ['Can I build here?', 'build'],
    ['Can I build near the fault?', 'build'],
    ['Почему здесь жарко?', 'heat'],
    ['Бывает ли тут наводнение или сель?', 'flood'],
    ['Можно ли здесь строить дом?', 'build'],
    ['Тут безопасно?', 'summary'],
    ['Что значат оценки?', 'grades'],
    ['Откуда ты это знаешь?', 'data'],
    ['Бул жерде жер титирөө болобу?', 'earthquake'],
    ['Бул жерге үй курса болобу?', 'build'],
    ['Суу ташкыны барбы?', 'flood'],
    ['Коопсузбу?', 'summary'],
    ['How is the weather on Mars?', 'unknown'],
  ])('%s -> %s', (question, topic) => {
    expect(topicOf(question)).toBe(topic)
  })
})

describe('answerTo', () => {
  const topics: Topic[] = ['earthquake', 'flood', 'landslide', 'heat', 'green', 'build', 'summary', 'grades', 'data', 'unknown']

  it('answers a check from the report: its grade, what the grade means, and the report\'s own sentences', () => {
    const answer = answerTo('earthquake', report, i18n('en'))
    expect(answer).toMatch(/^Earthquake: D\. Strong warning signs found\./)
    expect(answer).toContain('Issyk Atta Fault')
  })

  it('ends a check\'s answer with what to do about it, where the app has a line for that grade', () => {
    expect(answerTo('flood', report, i18n('en')).endsWith(translate('en', 'advice.flood.D'))).toBe(true)
    expect(answerTo('heat', report, i18n('ru')).endsWith(translate('ru', 'advice.heat.D'))).toBe(true)
    // Greenery has grade A here: nothing to do, so nothing is added.
    expect(answerTo('green', report, i18n('en'))).not.toContain(translate('en', 'advice.green.B'))
  })

  it('gives all the advice with the answer about building', () => {
    const answer = answerTo('build', report, i18n('en'))
    for (const key of ['advice.flood.D', 'advice.heat.D'] as const) expect(answer).toContain(translate('en', key))
  })

  it('says so when a check has no data, instead of inventing a grade', () => {
    expect(answerTo('landslide', report, i18n('en'))).toBe('Landslide: no data. Not enough satellite data here.')
  })

  it('needs a place for questions about one, but explains grades and data without', () => {
    expect(answerTo('build', null, i18n('en'))).toBe(translate('en', 'chat.need_place'))
    expect(answerTo('grades', null, i18n('en'))).toContain('A: No warning signs found.')
    expect(answerTo('data', null, i18n('ru'))).toContain('NASA')
  })

  // Asked "is it safe?", Dwoggle must still not say it: no answer may use the words the wording rules forbid.
  it.each<[Lang, RegExp]>([
    ['en', /safe|dangerous|plot/i],
    ['ru', /безопасн|опасн|участок|участк/i],
    ['ky', /коопсуз|коркунучтуу|участок|жер тилкеси/i],
  ])('never uses a forbidden word in %s', (lang, forbidden) => {
    for (const topic of topics) {
      expect(answerTo(topic, report, i18n(lang)), `${lang} ${topic}`).not.toMatch(forbidden)
      expect(answerTo(topic, null, i18n(lang)), `${lang} ${topic} without a report`).not.toMatch(forbidden)
    }
  })

  it('always answers something', () => {
    for (const topic of topics) expect(answerTo(topic, report, i18n('ky')).trim()).not.toBe('')
  })
})
