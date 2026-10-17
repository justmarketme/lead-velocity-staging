#!/usr/bin/env python3
"""Flesch-Kincaid grade for every unique primary_text in concepts.csv.

Usage: python3 fk_check.py [path/to/concepts.csv]
Exit code 1 if any text is above grade 7, any hook is over 8 words,
or any primary text is over 90 words (4.2 / 3.5a rules).
No third-party packages; the syllable count is a simple vowel-group heuristic,
so expect +/-1 grade against textstat.
"""
import csv
import re
import sys
from pathlib import Path

NUM_WORDS = {"1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "28": 3, "30": 2, "40": 2}


def syllables(word: str) -> int:
    w = word.lower().strip(".,:;?'\"()")
    if not w:
        return 0
    if w in NUM_WORDS:
        return NUM_WORDS[w]
    if re.fullmatch(r"r?[\d.,]+m?", w):
        return 2
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return 1
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    if w.endswith("ed") and not w.endswith(("ted", "ded")) and n > 1:
        n -= 1
    return max(1, n)


def fk(text: str):
    sentences = [s for s in re.split(r"[.?!]+(?:\s|$)", text) if s.strip()]
    words = text.split()
    syl = sum(syllables(w) for w in words)
    grade = 0.39 * (len(words) / len(sentences)) + 11.8 * (syl / len(words)) - 15.59
    return len(words), len(sentences), syl, round(grade, 1)


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("concepts.csv")
    seen, failed = set(), False
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cid = row["concept_id"]
            if cid in seen:
                continue
            seen.add(cid)
            w, s, y, g = fk(row["primary_text"])
            hook_words = len(row["hook"].split())
            ok = g <= 7 and w <= 90 and hook_words <= 8
            failed |= not ok
            print(f"{cid}  words={w:3d} sentences={s:2d} syllables={y:3d}  FK={g:4.1f}  hook_words={hook_words}  {'OK' if ok else 'FAIL'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
