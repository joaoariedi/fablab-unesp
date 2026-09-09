/**
 * `12 MAI 2024` — the one date format the Artigos surface prints (T019, FR-005).
 *
 * `artigos.md` § *Grid de artigos* fixes it on the card (*"chip de categoria … + **data** de
 * publicação em caps ao lado"*, drawn as `12 MAI 2024`) and `Artigo.ts` repeats it on the field
 * itself (*"Exibida como 12 MAI 2024 e ordena a listagem"*). Both routes under `artigos/` print
 * it, which is why it lives beside them rather than inside either: two copies of a date
 * formatter is two chances for the listing and the detail page to date the same article
 * differently.
 *
 * ── Why UTC, and why that is not a detail ───────────────────────────────────────────────────
 *
 * Payload stores a `date` field as an instant, and the admin writes midnight **UTC** for a
 * date-only value: `2024-05-12T00:00:00.000Z`. Read with `getDate()` on a server in São Paulo
 * (UTC-3) that instant is the **11th** — every article dated a day early, on every card, in a
 * way a test running in a UTC container would never show. So the calendar parts are read in UTC
 * (`getUTCDate`), which is the calendar the value was written in.
 *
 * Not `Intl.DateTimeFormat`: the abbreviations are the design's (three letters, upper case, no
 * trailing dot) and ICU spells `pt-BR` months as `mai.` — with a full ICU build, and as `May`
 * without one. A five-word table has no such dependency.
 */

/** Portuguese month abbreviations as the mockups print them: three letters, no dot. The caps
 *  are the data's here rather than the cascade's, because the string is built, not styled. */
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/**
 * The stored instant as the site prints it, or `''` when there is nothing to print.
 *
 * `dataPublicacao` is optional on the collection — a `rascunho` has no publication date — so
 * the empty answer is a real case and the caller renders no date element at all rather than an
 * empty one.
 *
 * ```ts
 * dataCurta('2024-05-12T00:00:00.000Z')  // '12 MAI 2024'
 * ```
 */
export const dataCurta = (iso: string | null | undefined): string => {
  if (typeof iso !== 'string' || iso === '') return ''
  const data = new Date(iso)
  // A malformed date is a `NaN` clock, and `getUTCDate()` on it yields `NaN` — printing
  // "NaN undefined NaN" over a cover instead of simply omitting the date.
  if (Number.isNaN(data.getTime())) return ''
  const dia = String(data.getUTCDate()).padStart(2, '0')
  return `${dia} ${MESES[data.getUTCMonth()]} ${data.getUTCFullYear()}`
}
