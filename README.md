# N2 study

A static site for JLPT N2. There is no built-in vocabulary or kanji list. You add a word when you could not read it, or paste a chapter yourself.

## Open it

No build step. Open `index.html` in a browser. For home-screen install and offline use, serve the folder over http (for example `python3 -m http.server` in this directory), then use “Add to Home Screen”. A `file://` URL will not install the service worker.

English interface (en-GB). Dates follow Europe/Bucharest.

## Today

The exam date on the home screen is Sunday 6 December 2026. The pass mark shown there is 90/180, with at least 19 in each section. The app does not calculate scaled scores.

From 5 October the day name is “Review drills for pages 10-14”, then “Unit 1” through “Unit 45”, one unit a day. No unit titles are invented. Then three mock-test days, then “Mocks done”.

New items are words you added that day, at most 20 in the session. Yesterday’s “Could not read” count is shown as a number. The session leads with up to 5 of those, then any word that is due, then today’s new words. One button starts it. The end screen says only that today’s unit is complete.

## Cards

The front is the kanji only. Furigana, when on, is on the back only. The back shows the reading, the English, and an example only if you typed one. The buttons are “Read correctly” and “Could not read.”

## Chapters

Create a chapter (for example “Unit 1” or “Pages 10-14”). Paste words yourself: one line per word, fields separated by tab, comma, or `|`. Order is kanji, reading, English, optional example. Modes:

- **Flashcards** — kanji on the front, reading/English/example on the back, Next and Shuffle. Practice only; grading stays on Today.
- **Quiz · choose** — English or reading shown, pick the kanji from four choices.
- **Quiz · type** — English or reading shown, type the kanji.
- **Darker day** — reading and meaning only (no kanji on the prompt). Either reading → choose meaning, or meaning → choose reading.

A quiz miss is stored as Could not read for the next day’s session. Export and import include chapters. No textbook list is shipped; paste only what you choose.

## Combinations

Separate tab for kanji words and compounds from OpenJLPT (community JLPT tags), not from a textbook. Levels, in order: N3 common, N3 less common, N2 common, N2 less common. Common vs less common = top vs bottom half of that level after sorting by OpenSubtitles frequency (FrequencyWords 2016 `ja_50k`, CC BY-SA). Flashcards, Quiz · choose, Quiz · type, and Darker day match the Chapters phone UX. Quiz misses go to Wrong words.

## Wrong words

Nav item **Wrong**. Lists every word marked Could not read or missed in Quiz / Darker day: kanji, reading, meaning, last miss time (Bucharest), miss count. Open items can be re-drilled (flashcards, quiz, Darker day). Getting one right later marks it resolved; the log line stays. Empty state: “Nothing missed yet.”

## Chapters repair

On a chapter screen: rename (without re-pasting), append paste, replace all with paste, delete one word, delete the chapter (confirm).

## Add a word

Kanji, reading, English, and an optional example. Saved in `localStorage` under `jlpt-n2-words-v1`. Export writes `jlpt-n2-words.json` (words, chapters, mistake history, which days are complete).

### Paste many words

Under the single form on **Add** there is a **Paste many words** box and an **Add all words** button. Leave a blank line between words; each word is 3 or 4 lines (word, reading, meaning, optional example). One line `word | reading | meaning | example` also works. A live count (“24 words found · 24 will be added”) shows before saving. Words already saved with the same word and reading are skipped. New words wait in Today, 20 a day, until first studied.

## Grammar readings

Gram paste format: `pattern | reading | meaning | usage | example` (reading, usage and example optional). Old lines `pattern | meaning | usage [| example]` still parse as before: field 2 counts as a reading only when it is kana only and the pattern has kanji (or there are 5+ fields). Blocks also work: one field per line, blank line between points. Readings show under the pattern in the list, on the back of flashcards and in quiz feedback; with Furigana on, the pattern also gets ruby on the front. Quiz · type accepts the pattern or its reading (〜 optional). Each point in “Points in this chapter” has an **Edit** button to add or fix the reading (and other fields). Edits set `updatedAt`; on merge/sync the newer edit wins per point (chapter renames too).

## Sync across devices

Card **Sync across devices** at the bottom of **Today**. Paste a GitHub token that has only the `gist` scope (https://github.com/settings/tokens/new?scopes=gist&description=JLPT%20N2%20sync) and press **Turn on sync**, once per device. The token is stored only in that browser's localStorage (`jlpt-n2-sync-token`) and is sent only to api.github.com. The app finds or creates one secret gist with the file `jlpt-n2-study-data.json`.

Each sync pulls the gist, merges it with local data (union by id, tombstones for deletes, max for stats), and pushes only if something changed. It runs on startup, on focus, every few minutes while open, 5 seconds after a change, when the app is hidden, and when the device comes back online. An empty copy never replaces non-empty data, and unreadable gist content is never overwritten. Import still replaces data on the device, but sync will merge the gist back in.

Grammar, Reading, Listening, and Test stay hidden until 6 December 2026.

## Files a phone needs

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `icons/icon.svg`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `data/grammar.js`
- `data/reading.js`
- `data/listening.js`
- `data/mock.js`

`README.md` and `SOURCES.md` are not required to run the app.
