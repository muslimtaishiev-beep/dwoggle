"""User profile: country, phone, and why they came to Bekem. Validation lives here, storage in auth.py."""

from __future__ import annotations

import re

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

# Calling codes where we can turn a local number ("0555 123 456") into international form.
LOCAL_PREFIX = {"KG": "996", "KZ": "7", "RU": "7", "UZ": "998", "TJ": "992", "TR": "90"}

E164 = re.compile(r"^\+[1-9]\d{7,14}$")
KG_MOBILE = re.compile(r"^\+996\d{9}$")
NOTE_MAX = 300


class ProfileError(ValueError):
    def __init__(self, field: str, code: str):
        super().__init__(f"{field}: {code}")
        self.field = field
        self.code = code


def normalize_phone(raw: str, country: str) -> str:
    """'+996 (555) 12-34-56', '00996555123456', '0555123456' (KG) -> '+996555123456'."""
    digits = re.sub(r"[\s\-().]", "", raw or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    elif not digits.startswith("+") and country in LOCAL_PREFIX:
        code = LOCAL_PREFIX[country]
        if digits.startswith(code):
            digits = "+" + digits
        elif digits.startswith(("0", "8")):  # national trunk prefix
            digits = "+" + code + digits[1:]
        else:
            digits = "+" + code + digits
    if not E164.match(digits):
        raise ProfileError("phone", "phone_invalid")
    if country == "KG" and digits.startswith("+996") and not KG_MOBILE.match(digits):
        raise ProfileError("phone", "phone_invalid")
    return digits


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
