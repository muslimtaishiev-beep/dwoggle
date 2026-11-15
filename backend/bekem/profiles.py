"""User profile: country, phone, and why they came to Bekem. Validation lives here, storage in auth.py."""

from __future__ import annotations

import phonenumbers

# "Why are you here?" The answer tells us who Bekem is really for (families, builders, MChS, realtors).
PURPOSES = ("buy_land", "build", "own_home", "realtor", "government", "research", "curious", "other")

# "What worries you most?" Optional, any subset (can be empty). Green is not a worry people pick.
CONCERNS = ("flood", "landslide", "earthquake", "heat")

# ISO 3166-1 alpha-2. The frontend shows names with Intl.DisplayNames in the user's language.
COUNTRIES = frozenset(
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW "
    "BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI "
    "FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN "
    "IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME "
    "MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF "
    "PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV "
    "SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE "
    "YT ZA ZM ZW".split()
)

NOTE_MAX = 300


class ProfileError(ValueError):
    def __init__(self, field: str, code: str):
        super().__init__(f"{field}: {code}")
        self.field = field
        self.code = code


def normalize_phone(raw: str, country: str) -> str:
    """Any way people write a number -> E.164, checked against that country's real numbering plan.

    Uses libphonenumber (Google's rules, as on Android): '+996 (555) 12-34-56', '00996555123456',
    '0555 123 456' and '+996 0555 123 456' (the local 0 typed after the code) all give '+996555123456'.
    The chosen country is only the default for numbers written without a code; a number with its own code
    (someone living abroad) is checked against that code's country.
    """
    text = (raw or "").strip()
    if text.startswith("00"):  # international prefix used in most of the world
        text = "+" + text[2:]
    if not text or len(text) > 40:
        raise ProfileError("phone", "phone_invalid")
    try:
        number = phonenumbers.parse(text, country if country in COUNTRIES else None)
    except phonenumbers.NumberParseException as e:
        raise ProfileError("phone", "phone_invalid") from e
    if not phonenumbers.is_valid_number(number):
        raise ProfileError("phone", "phone_invalid")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def validate_concerns(concerns: list[str]) -> list[str]:
    """Known ids only, duplicates dropped, original order kept."""
    out: list[str] = []
    for c in concerns:
        if c not in CONCERNS:
            raise ProfileError("concerns", "concerns_invalid")
        if c not in out:
            out.append(c)
    return out


def validate_profile(country: str, phone: str, purpose: str, purpose_note: str | None) -> dict:
    country = (country or "").strip().upper()
    if country not in COUNTRIES:
        raise ProfileError("country", "country_invalid")
    if purpose not in PURPOSES:
        raise ProfileError("purpose", "purpose_invalid")
    note = (purpose_note or "").strip()
    if len(note) > NOTE_MAX:
        raise ProfileError("purpose_note", "note_too_long")
    if purpose == "other" and not note:
        raise ProfileError("purpose_note", "note_required")
    # No phone yet (the dig saves the first answers before asking for it): None, and the saved one is kept.
    return {
        "country": country,
        "phone": normalize_phone(phone, country) if (phone or "").strip() else None,
        "purpose": purpose,
        "purpose_note": note or None,
    }
