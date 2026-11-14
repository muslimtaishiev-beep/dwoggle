"""All user-facing text, in English, Russian and Kyrgyz.

Grading produces message keys + parameters; this module renders them. The frontend gets both
the rendered text and the raw key/params, so it can re-render or override wording itself.

Wording rules (product): never "safe" or "dangerous" (grades are risk signals), and "this area",
never "plot" / "участок". tests/test_grading.py enforces both.

The app speaks 11 languages; the backend writes its own texts in en/ru/ky and falls back to the
nearest of those (Kazakh and Uzbek readers in the region read Russian; everyone else gets English).
"""

from __future__ import annotations

from typing import Literal

Lang = Literal["en", "ru", "ky"]
LANGS: tuple[Lang, ...] = ("en", "ru", "ky")

AppLang = Literal["ky", "ru", "kk", "uz", "en", "zh", "hi", "es", "ar", "fr", "pt"]
APP_LANGS: tuple[str, ...] = ("ky", "ru", "kk", "uz", "en", "zh", "hi", "es", "ar", "fr", "pt")
TEXT_FALLBACK: dict[str, Lang] = {"kk": "ru", "uz": "ru", "zh": "en", "hi": "en", "es": "en", "ar": "en", "fr": "en", "pt": "en"}


def text_lang(lang: str) -> Lang:
    """The en/ru/ky language our own texts come back in for an app language."""
    return lang if lang in LANGS else TEXT_FALLBACK.get(lang, "en")  # type: ignore[return-value]

TEXTS: dict[str, dict[str, str]] = {
    # --- Bekem's moods ------------------------------------------------------------------
    "mood.relaxed.title": {"en": "Bekem is relaxed", "ru": "Бекем спокоен", "ky": "Бекем тынч"},
    "mood.relaxed.line": {
        "en": "Few warning signs in this area.",
        "ru": "В этой местности мало тревожных признаков.",
        "ky": "Бул аймакта тынчсыздандырган белгилер аз.",
    },
    "mood.alert.title": {"en": "Bekem is alert", "ru": "Бекем насторожился", "ky": "Бекем сергек"},
    "mood.alert.line": {
        "en": "Some warning signs. Check before you buy.",
        "ru": "Есть тревожные признаки. Проверьте, прежде чем покупать.",
        "ky": "Айрым белгилер тынчсыздандырат. Сатып алардан мурун текшериңиз.",
    },
    "mood.whistling.title": {"en": "Bekem is whistling!", "ru": "Бекем свистит!", "ky": "Бекем ышкырып жатат!"},
    "mood.whistling.line": {
        "en": "High flood or landslide risk in this area.",
        "ru": "Высокий риск паводка или оползня в этой местности.",
        "ky": "Бул аймакта суу ташкыны же жер көчкү тобокелдиги жогору.",
    },
    "greeting": {
        "en": "Tap any land. I'll tell you what I know about it.",
        "ru": "Нажми на любое место на карте. Я расскажу, что о нём знаю.",
        "ky": "Каалаган жерди басыңыз. Мен ал жөнүндө билгенимди айтып берем.",
    },
    # --- Check titles -------------------------------------------------------------------
    "check.flood": {"en": "Flood/mudflow", "ru": "Паводок/сель", "ky": "Суу ташкыны/сел"},
    "check.landslide": {"en": "Landslide", "ru": "Оползень", "ky": "Жер көчкү"},
    "check.earthquake": {"en": "Earthquake", "ru": "Землетрясение", "ky": "Жер титирөө"},
    "check.heat": {"en": "Heat", "ru": "Жара", "ky": "Ысык"},
    "check.green": {"en": "Green", "ru": "Зелень", "ky": "Жашылдык"},
    # --- Flood ----------------------------------------------------------------------------
    "flood.water_years": {
        "en": "Satellites saw water within {radius} m in {n} of {total} years observed ({first}–{last}).",
        "ru": "Спутники видели воду в радиусе {radius} м в {n} из {total} лет наблюдений ({first}–{last}).",
        "ky": "Спутниктер {total} жылдык байкоонун ({first}–{last}) {n} жылында {radius} м радиуста суу көрүшкөн.",
    },
    "flood.no_water": {
        "en": "Satellites never saw water within {radius} m in {total} years observed ({first}–{last}).",
        "ru": "За {total} лет наблюдений ({first}–{last}) спутники ни разу не видели воду в радиусе {radius} м.",
        "ky": "{total} жылдык байкоодо ({first}–{last}) спутниктер {radius} м радиуста бир да жолу суу көрүшкөн жок.",
    },
    "flood.low": {
        "en": "This area is {drop} m lower than the land around it.",
        "ru": "Эта местность на {drop} м ниже окрестностей.",
        "ky": "Бул аймак айланасынан {drop} м төмөн жайгашкан.",
    },
    "flood.mudflow": {
        "en": "Steep slopes rise above this area: a possible mudflow path.",
        "ru": "Над этой местностью крутые склоны: возможный путь селя.",
        "ky": "Бул аймактын үстүндө тик капталдар бар: сел өтүшү мүмкүн.",
    },
    "flood.rain_up": {
        "en": "Spring-summer rainfall here is rising (+{change} mm since {start}, significant ✓).",
        "ru": "Весенне-летние осадки здесь растут (+{change} мм с {start} года, значимо ✓).",
        "ky": "Бул аймакта жаз-жайкы жаан-чачын көбөйүүдө ({start}-жылдан бери +{change} мм, ишенимдүү ✓).",
    },
    "flood.rain_extreme_up": {
        "en": "The heaviest rain day of the season is getting heavier (+{change} mm since {start}, significant ✓).",
        "ru": "Самый сильный дождь сезона становится сильнее (+{change} мм с {start} года, значимо ✓).",
        "ky": "Мезгилдин эң катуу жааны күчөп баратат ({start}-жылдан бери +{change} мм, ишенимдүү ✓).",
    },
    "flood.runoff_up": {
        "en": "Storm runoff in this area has been rising since {start} (significant ✓; regional, ~28 km).",
        "ru": "Ливневый сток в этом районе растёт с {start} года (значимо ✓; по району, ~28 км).",
        "ky": "Бул аймакта жаан агымы {start}-жылдан бери көбөйүүдө (ишенимдүү ✓; аймак боюнча, ~28 км).",
    },
    # --- Landslide --------------------------------------------------------------------------
    "landslide.slope.A": {
        "en": "Flat ground, very low landslide risk.",
        "ru": "Ровная местность, риск оползня очень низкий.",
        "ky": "Түз жер, жер көчкү тобокелдиги өтө төмөн.",
    },
    "landslide.slope.B": {
        "en": "Gentle slope, low landslide risk.",
        "ru": "Пологий склон, риск оползня низкий.",
        "ky": "Жантайыңкы жер, жер көчкү тобокелдиги төмөн.",
    },
    "landslide.slope.C": {
        "en": "Noticeable slope (up to {slope}°). Check the soil before building.",
        "ru": "Заметный уклон (до {slope}°). Проверьте грунт перед стройкой.",
        "ky": "Байкаларлык эңиш ({slope}° чейин). Курулуштан мурун топуракты текшериңиз.",
    },
    "landslide.slope.D": {
        "en": "Steep slope (up to {slope}°). High landslide risk.",
        "ru": "Крутой склон (до {slope}°). Высокий риск оползня.",
        "ky": "Тик каптал ({slope}° чейин). Жер көчкү тобокелдиги жогору.",
    },
    "landslide.susc": {
        "en": "NASA landslide map: {cls} susceptibility.",
        "ru": "Карта оползней NASA: {cls} подверженность.",
        "ky": "NASA жер көчкү картасы: тобокелдик деңгээли {cls}.",
    },
    "landslide.runout": {
        "en": "Very steep land within 1.5 km: soil or rocks can come down from above.",
        "ru": "В радиусе 1,5 км очень крутые склоны: сверху может сойти грунт или камни.",
        "ky": "1,5 км радиуста өтө тик капталдар бар: үстүнөн топурак же таш түшүшү мүмкүн.",
    },
    "susc.1": {"en": "very low", "ru": "очень низкая", "ky": "өтө төмөн"},
    "susc.2": {"en": "low", "ru": "низкая", "ky": "төмөн"},
    "susc.3": {"en": "moderate", "ru": "средняя", "ky": "орточо"},
    "susc.4": {"en": "high", "ru": "высокая", "ky": "жогору"},
    "susc.5": {"en": "very high", "ru": "очень высокая", "ky": "өтө жогору"},
    # --- Earthquake ----------------------------------------------------------------------
    "eq.near": {
        "en": "{km} km from an active fault ({name}).",
        "ru": "{km} км от активного разлома ({name}).",
        "ky": "Активдүү жаракадан {km} км ({name}).",
    },
    "eq.near_unnamed": {
        "en": "{km} km from an active fault.",
        "ru": "{km} км от активного разлома.",
        "ky": "Активдүү жаракадан {km} км.",
    },
    "eq.none": {
        "en": "No mapped active fault within {km} km.",
        "ru": "В радиусе {km} км нет известных активных разломов.",
        "ky": "{km} км радиуста белгилүү активдүү жарака жок.",
    },
    "eq.advice.D": {
        "en": "Build only with an engineered earthquake-resistant design.",
        "ru": "Стройте только по сейсмостойкому инженерному проекту.",
        "ky": "Жер титирөөгө чыдамдуу инженердик долбоор менен гана куруңуз.",
    },
    "eq.advice.C": {
        "en": "Build with reinforced concrete.",
        "ru": "Стройте из железобетона.",
        "ky": "Темир-бетондон куруңуз.",
    },
    "eq.advice.B": {
        "en": "Follow the seismic building code.",
        "ru": "Соблюдайте сейсмические нормы строительства.",
        "ky": "Сейсмикалык курулуш эрежелерин сактаңыз.",
    },
    "eq.advice.A": {
        "en": "All of Kyrgyzstan is seismic: still follow the building code.",
        "ru": "Весь Кыргызстан сейсмичен: нормы строительства всё равно обязательны.",
        "ky": "Бүт Кыргызстан сейсмикалык аймак: курулуш эрежелерин баары бир сактаңыз.",
    },
    # --- Heat -----------------------------------------------------------------------------
    "heat.up_sig": {
        "en": "{change}°C hotter in summer than in {start}. This trend is statistically real.",
        "ru": "Летом на {change}°C жарче, чем в {start} году. Этот тренд статистически достоверен.",
        "ky": "Жайында {start}-жылга караганда {change}°C ысык. Бул тренд статистикалык жактан ишенимдүү.",
    },
    "heat.up_ns": {
        "en": "{change}°C warmer than in {start}, but the trend is not statistically proven.",
        "ru": "На {change}°C теплее, чем в {start} году, но тренд статистически не доказан.",
        "ky": "{start}-жылга караганда {change}°C жылуу, бирок тренд статистикалык жактан далилденген эмес.",
    },
    "heat.stable": {
        "en": "No real change in summer temperature since {start}.",
        "ru": "С {start} года летняя температура заметно не изменилась.",
        "ky": "{start}-жылдан бери жайкы температура олуттуу өзгөргөн жок.",
    },
    "heat.down_sig": {
        "en": "{change}°C cooler in summer than in {start}. This trend is statistically real.",
        "ru": "Летом на {change}°C прохладнее, чем в {start} году. Тренд статистически достоверен.",
        "ky": "Жайында {start}-жылга караганда {change}°C салкын. Тренд статистикалык жактан ишенимдүү.",
    },
    # --- Green ----------------------------------------------------------------------------
    "green.stable": {
        "en": "Vegetation is stable.",
        "ru": "Растительность стабильна.",
        "ky": "Өсүмдүктөр туруктуу.",
    },
    "green.up": {
        "en": "Greener than in {start}. This trend is statistically real.",
        "ru": "Зеленее, чем в {start} году. Тренд статистически достоверен.",
        "ky": "{start}-жылга караганда жашылыраак. Тренд статистикалык жактан ишенимдүү.",
    },
    "green.down": {
        "en": "Vegetation dropped {pct}% since {start}. This trend is statistically real.",
        "ru": "Растительности стало на {pct}% меньше, чем в {start} году. Тренд статистически достоверен.",
        "ky": "{start}-жылдан бери өсүмдүктөр {pct}% азайды. Тренд статистикалык жактан ишенимдүү.",
    },
    "green.bare": {
        "en": "Little vegetation here (built-up or bare land).",
        "ru": "Растительности мало (застройка или голая земля).",
        "ky": "Бул жерде өсүмдүк аз (курулуш же жылаңач жер).",
    },
    # --- Second opinions (never change a grade) ----------------------------------------
    "verify.station.agrees": {
        "en": "Weather station {name} ({km} km): the air temperature trend points the same way ({dir}). Only the direction is compared: the station measures air, the satellite measures the ground surface.",
        "ru": "Метеостанция {name} ({km} км): тренд температуры воздуха направлен так же ({dir}). Сравниваем только направление: станция меряет воздух, спутник поверхность земли.",
        "ky": "{name} метеостанциясы ({km} км): абанын температурасынын тренди ошол эле багытта ({dir}). Багыт гана салыштырылат: станция абаны, спутник жер бетин өлчөйт.",
    },
    "verify.station.differs": {
        "en": "Weather station {name} ({km} km): the air temperature trend points another way ({dir}). Only the direction is compared: the station measures air, the satellite measures the ground surface.",
        "ru": "Метеостанция {name} ({km} км): тренд температуры воздуха направлен иначе ({dir}). Сравниваем только направление: станция меряет воздух, спутник поверхность земли.",
        "ky": "{name} метеостанциясы ({km} км): абанын температурасынын тренди башка багытта ({dir}). Багыт гана салыштырылат: станция абаны, спутник жер бетин өлчөйт.",
    },
    "verify.station.none": {
        "en": "No weather station with long records within 30 km at a similar height.",
        "ru": "В радиусе 30 км нет метеостанции с длинным рядом на похожей высоте.",
        "ky": "30 км радиуста окшош бийиктикте узак маалыматы бар метеостанция жок.",
    },
    "verify.station.short": {
        "en": "Weather station {name} has too few complete summers to compare.",
        "ru": "У метеостанции {name} слишком мало полных летних сезонов для сравнения.",
        "ky": "{name} метеостанциясында салыштыруу үчүн толук жайлар аз.",
    },
    "trend.increasing": {"en": "rising", "ru": "рост", "ky": "өсүү"},
    "trend.decreasing": {"en": "falling", "ru": "снижение", "ky": "төмөндөө"},
    "trend.none": {"en": "no clear trend", "ru": "нет явного тренда", "ky": "так тренд жок"},
    "verify.appeears.same": {
        "en": "Same result via NASA AppEEARS: {change}{unit}, {sig}. This is the same MODIS data recalculated through NASA's own tool, a check of our calculation.",
        "ru": "Тот же результат через NASA AppEEARS: {change}{unit}, {sig}. Это те же данные MODIS, пересчитанные через инструмент NASA, то есть проверка нашего расчёта.",
        "ky": "NASA AppEEARS аркылуу ошол эле жыйынтык: {change}{unit}, {sig}. Бул NASAнын куралы аркылуу кайра эсептелген ошол эле MODIS маалыматы, биздин эсептөөнү текшерүү.",
    },
    "verify.appeears.differs": {
        "en": "NASA AppEEARS gives a different trend from the same MODIS data ({change}{unit}, {sig}). Treat this grade with caution.",
        "ru": "NASA AppEEARS по тем же данным MODIS даёт другой тренд ({change}{unit}, {sig}). К этой оценке стоит отнестись осторожно.",
        "ky": "NASA AppEEARS ошол эле MODIS маалыматынан башка тренд берет ({change}{unit}, {sig}). Бул баага этият болуңуз.",
    },
    "verify.appeears.pending": {
        "en": "Double-checking this area with NASA AppEEARS (takes minutes to hours).",
        "ru": "Перепроверяем эту местность через NASA AppEEARS (от минут до нескольких часов).",
        "ky": "Бул аймак NASA AppEEARS аркылуу кайра текшерилүүдө (бир нече мүнөттөн сааттарга чейин).",
    },
    "verify.appeears.unavailable": {
        "en": "NASA AppEEARS check not available for this area yet.",
        "ru": "Проверка NASA AppEEARS для этой местности пока недоступна.",
        "ky": "Бул аймак үчүн NASA AppEEARS текшерүүсү азырынча жок.",
    },
    "verify.mod44w.agrees": {
        "en": "MODIS water map (separate sensor, 250 m): water in this area or within 250 m of it in {n} of {total} years ({first}–{last}). Agrees with Landsat.",
        "ru": "Карта воды MODIS (другой спутник, 250 м): вода в этой местности или в 250 м от неё в {n} из {total} лет ({first}–{last}). Совпадает с Landsat.",
        "ky": "MODIS суу картасы (башка спутник, 250 м): бул аймакта же 250 м айланасында {total} жылдын ({first}–{last}) {n} жылында суу болгон. Landsat менен дал келет.",
    },
    "verify.mod44w.differs": {
        "en": "MODIS water map (separate sensor, 250 m): water in this area or within 250 m of it in {n} of {total} years ({first}–{last}). Does not agree with Landsat; the sensors see at different scales.",
        "ru": "Карта воды MODIS (другой спутник, 250 м): вода в этой местности или в 250 м от неё в {n} из {total} лет ({first}–{last}). Не совпадает с Landsat: спутники видят в разном масштабе.",
        "ky": "MODIS суу картасы (башка спутник, 250 м): бул аймакта же 250 м айланасында {total} жылдын ({first}–{last}) {n} жылында суу болгон. Landsat менен дал келбейт: спутниктер ар башка масштабда көрөт.",
    },
    # --- Sign-up: why are you here? ----------------------------------------------------------
    "purpose.question": {
        "en": "Why are you checking land with Bekem?",
        "ru": "Зачем вы проверяете землю с Бекемом?",
        "ky": "Эмне үчүн Бекем менен жерди текшерип жатасыз?",
    },
    "purpose.buy_land": {"en": "Buying land or a home", "ru": "Покупаю землю или жильё", "ky": "Жер же үй сатып алам"},
    "purpose.build": {"en": "Planning to build", "ru": "Собираюсь строить", "ky": "Үй курууну пландап жатам"},
    "purpose.own_home": {
        "en": "Checking the place I already live",
        "ru": "Проверяю место, где уже живу",
        "ky": "Азыр жашаган жеримди текшерем",
    },
    "purpose.realtor": {
        "en": "Real estate agent or developer",
        "ru": "Риелтор или застройщик",
        "ky": "Риелтор же курулуш компаниясы",
    },
    "purpose.government": {
        "en": "MChS, city hall or other government",
        "ru": "МЧС, мэрия или другой госорган",
        "ky": "ӨКМ, мэрия же башка мамлекеттик орган",
    },
    "purpose.research": {
        "en": "Research, study or journalism",
        "ru": "Исследования, учёба или журналистика",
        "ky": "Изилдөө, окуу же журналистика",
    },
    "purpose.curious": {"en": "Just curious", "ru": "Просто интересно", "ky": "Жөн гана кызыкдармын"},
    "purpose.other": {"en": "Other (tell us)", "ru": "Другое (напишите)", "ky": "Башка (жазыңыз)"},
    "signup.prompt": {
        "en": "Save this area and get alerts: sign up in 30 seconds.",
        "ru": "Сохраните эту местность и получайте предупреждения: регистрация за 30 секунд.",
        "ky": "Бул аймакты сактап, эскертүүлөрдү алыңыз: 30 секундада катталыңыз.",
    },
    # --- Sign-in errors (field-level codes are stable for the frontend) ------------------------
    "err.country_invalid": {"en": "Choose a country.", "ru": "Выберите страну.", "ky": "Өлкөнү тандаңыз."},
    "err.phone_invalid": {
        "en": "Enter a valid phone number, e.g. +996 555 123 456.",
        "ru": "Введите правильный номер, например +996 555 123 456.",
        "ky": "Туура номер жазыңыз, мисалы +996 555 123 456.",
    },
    "err.purpose_invalid": {"en": "Choose why you're here.", "ru": "Выберите, зачем вы здесь.", "ky": "Эмне үчүн келгениңизди тандаңыз."},
    "err.note_required": {"en": "Tell us a few words.", "ru": "Напишите пару слов.", "ky": "Бир нече сөз жазыңыз."},
    "err.note_too_long": {"en": "Please keep it under 300 characters.", "ru": "Не больше 300 символов.", "ky": "300 белгиден ашпасын."},
    "err.concerns_invalid": {
        "en": "Pick from flood, landslide, earthquake and heat.",
        "ru": "Выберите из: паводок, оползень, землетрясение, жара.",
        "ky": "Тандаңыз: суу ташкыны, жер көчкү, жер титирөө, ысык.",
    },
    "err.token_missing": {"en": "Please sign in.", "ru": "Пожалуйста, войдите.", "ky": "Сураныч, кириңиз."},
    "err.token_invalid": {"en": "Invalid sign-in. Please sign in again.", "ru": "Ошибка входа. Войдите снова.", "ky": "Кирүүдө ката. Кайра кириңиз."},
    "err.token_expired": {"en": "Your sign-in has expired. Please sign in again.", "ru": "Сессия истекла. Войдите снова.", "ky": "Сессия бүттү. Кайра кириңиз."},
    "err.auth_disabled": {
        "en": "Sign-in is not set up on this server yet.",
        "ru": "Вход на этом сервере ещё не настроен.",
        "ky": "Бул серверде кирүү азырынча орнотула элек.",
    },
    # --- Shared ---------------------------------------------------------------------------
    "nodata": {
        "en": "Not enough satellite data here.",
        "ru": "Недостаточно спутниковых данных.",
        "ky": "Спутник маалыматтары жетишсиз.",
    },
    "significant": {"en": "significant ✓", "ru": "значимо ✓", "ky": "ишенимдүү ✓"},
    "not_significant": {"en": "not significant", "ru": "не значимо", "ky": "ишенимсиз"},
    "series.water": {
        "en": "Water seen within {radius} m (% of area)",
        "ru": "Вода в радиусе {radius} м (% площади)",
        "ky": "{radius} м радиуста суу (аянттын %)",
    },
    "series.rain": {
        "en": "Spring-summer rainfall (Mar-Sep, mm)",
        "ru": "Осадки весна-лето (мар-сен, мм)",
        "ky": "Жаз-жайкы жаан-чачын (мар-сен, мм)",
    },
    "series.rain_max": {
        "en": "Wettest day of the season (Mar-Sep, mm)",
        "ru": "Самый дождливый день сезона (мар-сен, мм)",
        "ky": "Мезгилдин эң жаанчыл күнү (мар-сен, мм)",
    },
    "series.runoff": {
        "en": "Storm runoff, wettest month (mm, regional ~28 km)",
        "ru": "Ливневый сток, самый влажный месяц (мм, по району ~28 км)",
        "ky": "Жаан агымы, эң нымдуу ай (мм, аймак ~28 км)",
    },
    "series.soil": {
        "en": "Topsoil moisture, May-Sep (mm in top 10 cm, regional ~28 km)",
        "ru": "Влажность верхнего слоя почвы, май-сен (мм в 10 см, по району ~28 км)",
        "ky": "Топурактын үстүнкү катмарынын нымдуулугу, май-сен (10 смде мм, аймак ~28 км)",
    },
    "series.lst": {
        "en": "Summer ground temperature (Jun-Aug, °C)",
        "ru": "Летняя температура поверхности (июн-авг, °C)",
        "ky": "Жайкы жер бетинин температурасы (июн-авг, °C)",
    },
    "series.ndvi": {
        "en": "Vegetation index NDVI (May-Sep)",
        "ru": "Индекс растительности NDVI (май-сен)",
        "ky": "Өсүмдүк индекси NDVI (май-сен)",
    },
    "disclaimer": {
        "en": (
            "These are risk signals from satellite data, not official permission. MChS zoning still decides. "
            "Satellite pixels are 30 m to 1 km, so the grades describe the surrounding area, not exact property lines."
        ),
        "ru": (
            "Это сигналы риска по спутниковым данным, а не официальное разрешение. Решает зонирование МЧС. "
            "Пиксели спутников от 30 м до 1 км, поэтому оценивается окружающая местность, а не точные границы владения."
        ),
        "ky": (
            "Бул спутник маалыматы боюнча тобокелдик белгилери, расмий уруксат эмес. Акыркы чечимди ӨКМдин "
            "зоналоосу чечет. Спутник пикселдери 30 м ден 1 км ге чейин, ошондуктан менчиктин так чеги эмес, "
            "айланадагы аймак бааланат."
        ),
    },
}


def t(key: str, lang: str = "en", **params) -> str:
    """Render a message in `lang` (any app language; see text_lang). Params starting with "@" are keys."""
    lang = text_lang(lang)
    entry = TEXTS.get(key)
    if entry is None:
        return key
    template = entry.get(lang) or entry["en"]
    params = {k: t(v[1:], lang) if isinstance(v, str) and v.startswith("@") else v for k, v in params.items()}
    try:
        return template.format(**params)
    except (KeyError, IndexError):
        return template


def missing_translations() -> list[str]:
    return [f"{k}:{lang}" for k, v in TEXTS.items() for lang in LANGS if not v.get(lang)]
