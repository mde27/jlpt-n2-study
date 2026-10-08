# Sources

Nothing here is taken from a Try! textbook PDF, a pdfcoffee file, or a Drive PDF. Grammar **names** come from the publisher’s public 学習内容 lists. Notes under those names are original. Reading passages and listening scripts are original. Vocabulary and kanji are from the open dataset below. If a field was missing, the item was dropped (none were, in this build).

## Exam date, times, and pass line

- https://www.jlpt.jp/e/  
  English home page of the official JLPT site, operated by the Japan Foundation and Japan Educational Exchanges and Services. The 2026 date images’ alt text reads: “First test: Sunday, July 5, 2026” and “Second test: Sunday, December 6, 2026”. Fetched 4 October 2026. The guide PDF at https://www.jlpt.jp/reference/pdf/guide_2026.pdf is a designed brochure with no text layer, so the date was taken from the home page alt text and from the JEES page below.
- https://info.jees-jlpt.jp/info/2026-2jisshiannnai.html  
  JEES guide for the second 2026 test in Japan. Test date: 6 December 2026 (Sunday). N2 answer times: Language Knowledge (Vocabulary/Grammar) and Reading, 105 minutes (9:10–11:15); Listening, 50 minutes (11:45–12:50). The clock in the mock uses those two limits. The paper does not split the 105 minutes between language knowledge and reading.
- https://www.jlpt.jp/e/guideline/results.html  
  Official scoring. N2 sections are Language Knowledge (Vocabulary/Grammar), Reading, and Listening, each 0–60, total 0–180. Overall pass mark 90. Sectional pass mark 19 in each section. A section under 19 fails the whole test. Scores are scaled. This app shows that rule and does **not** convert raw answers into scaled points.

Her stated date, 7 December 2026, is not the official date. The app shows 6 December and notes the date she gave.

## Grammar point list (names and chapter titles only)

- https://client-storage.ask-books.com/uploads/files/try/N3gakushukomoku.pdf  
  Publisher (ASK) public list: 『TRY! 日本語能力試験 N3 文法から伸ばす日本語』 学習内容. Created 15 April 2021. Taken: chapter titles and the 113 numbered patterns, in order. The can-do column was not copied.
- https://client-storage.ask-books.com/uploads/files/try/N2gakushukomoku.pdf  
  Same series for N2. 139 numbered patterns, in order, plus the furigana the PDF prints on 上 (うえ or じょう) so the repeated patterns stay distinct. Can-do column not copied.

ASK’s later product pages describe revised editions as 127 N3 patterns and 149 N2 patterns (https://ask-books.com/jlpt-try and the N3/N2 book pages). Those extra points are not in the 2021 public lists above, so they are not in the app. Explanations in the app are original one- or two-sentence notes, not the book’s wording. No example sentences were added for grammar.

## Vocabulary, kanji, and example sentences

- https://github.com/evanclan/OpenJLPT (CC BY-SA 4.0)  
  Files used, raw, fetched 4 October 2026:
  - https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n3.json
  - https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n2.json
  - https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/kanji/n3.json
  - https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/kanji/n2.json
  - https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/pos.json (part-of-speech labels)
  - https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md (upstream attribution)

  Kept for each word: id, word, reading, meanings, level, part of speech, other written forms when present, and at most one example that had both Japanese and English. Kept for each kanji: character, on readings, kun readings, meanings, stroke count when present, and up to six words from that entry. Items missing a word, reading, or meaning (or, for kanji, both a reading and a meaning) would have been omitted. None were.

Upstream, as named in that NOTICE:

- JMdict / EDICT and KANJIDIC2, Electronic Dictionary Research and Development Group, CC BY-SA 4.0. https://www.edrdg.org/ and https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
- JLPT level tags: Jonathan Waller’s lists, CC BY. https://www.tanos.co.uk/jlpt/
- Example sentences: Tatoeba, CC BY 2.0 FR. https://tatoeba.org

The OpenJLPT grammar files were not used. The grammar syllabus is the Try! point list above.

These vocabulary and kanji files are a derived dataset under CC BY-SA 4.0. Credit OpenJLPT and the upstream projects if you pass the data on, and keep the same licence on derivatives. JLPT level groups are community lists, not an official Japan Foundation word list.

## Not used

- No Try! textbook body, exercises, dialogues, or example sentences.
- No pitch-accent data. OpenJLPT entries used here have no pitch field, so pitch is not shown.
- No past papers.


## Combinations (kanji compounds tab)

Built 6 October 2026 from the same OpenJLPT vocab files (N3 / N2), not from any textbook.

- Kept only entries with a written form that contains at least one kanji (the headword, or an `other_forms` entry when the headword is kana-only), plus reading and at least one English meaning. Pure kana-only entries were skipped.
- Frequency split: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) `content/2016/ja/ja_50k.txt` (CC BY-SA 4.0), from OpenSubtitles token counts. Rank = line order in that file (more frequent first). Within each JLPT level, words are sorted by that rank (unlisted words sort last). The first half is **common**; the second half is **less common**.

## Drill: built-in N2 set (`data/drills.js`)

Built 8 October 2026. Everything in this file that a learner reads as a question is **original**, written for this app: all grammar questions, composition sentences, context sentences, paraphrase items, word-formation sentences, the vocabulary example sentences, the one-line meanings and usage notes, and the English glosses. Nothing was copied from official JLPT sample questions or past papers, from prep books (Speed Master, 新完全マスター, Try!, ソウマトメ) or from sites such as jlptsensei, nihongo-pro or MLC. Only the general knowledge of *which* points are frequently tested was used.

- Word list for Kanji reading / Orthography: 153 common words. 139 are in the OpenJLPT N2/N3 lists already used for Combos (124 n2-common, 2 n2-less, 13 N3); 14 are other everyday N2-level words (補足, 削減, 模範, 頻繁, 柔軟, 緩和, 撤退, 獲得, 措置, 携帯, 貯蓄, 携わる, 衰える, 偏る). OpenJLPT: https://github.com/evanclan/OpenJLPT, CC BY-SA 4.0.
- JMdict/EDICT (Electronic Dictionary Research and Development Group, CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html), file `JMdict_e.gz` from http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz, used at build time only: to confirm each answer word and reading exists, that no wrong reading is a real reading of the word (e.g. 境界 also has きょうがい, so that is never offered as wrong), that every fake spelling in Orthography (警借, 敬備 …) is not a real JMdict headword, and that every wrong prefix/suffix in Word formation does not make a real word (e.g. 不完成 / 非完成 / 無完成 for 未完成). No JMdict glosses were copied into the file.
- Tatoeba: not used in this set (all sentences are original), so no sentence ids are needed.
- Distractors: grammar wrong options are other N2 patterns that are ungrammatical in the slot (wrong connection form) or clearly illogical; points that would also fit (末に for あげく, ばかりだ for 一方だ, わりに for にしては, 上は / からには for 以上) were deliberately not offered.
- `data/drills.js` as a whole is shared under CC BY-SA 4.0 because the word selection derives from OpenJLPT and the checks from JMdict.
