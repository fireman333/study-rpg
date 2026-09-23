/**
 * Owner-masked leaderboard nicknames — resolved on READ, in the same query.
 *
 * Change: mask-moderated-leaderboard-nicknames (study-rpg-2nd, hospital-leaderboard).
 * Table: migrations/0011_leaderboard_nickname_masks.sql. Owner command:
 * scripts/mask-leaderboard-nickname.sh.
 *
 * Every surface that shows a leaderboard nickname to someone other than its
 * owner builds its SELECT from this fragment: the cron's five KV snapshots and
 * the 留言 board (listing + the echo returned after posting). The stored
 * nickname, the player's own `GET /leaderboard/me`, and the uniqueness check are
 * never masked — see the migration header for why masking on write fails.
 *
 * ⚠️ One query, not two. Reading the names and then the list separately admits a
 * state where the names were read and the list was not, and the only safe answer
 * in that state is to publish nothing. A LEFT JOIN makes the state impossible: if
 * the list cannot be read, the query fails and the caller writes nothing.
 *
 * ⚠️ The join requires BOTH `user_id` and the recorded `nickname_lower`. The first
 * makes the key the player's identity (another player with the same name is not
 * masked); the second makes a rename lift the mask and a rename back re-apply it.
 * Guarded by __tests__/nickname-mask.test.ts.
 */

/**
 * What a masked nickname is displayed as. Fixed length on purpose: a mask that
 * repeats `*` per character would publish the original's length (2–12), and for a
 * CJK name the length alone is a clue.
 *
 * ⚠️ The only definition. The client does not compare against it — it reads the
 * row's `nickname_masked` flag — and the owner script reads it from this file.
 */
export const NICKNAME_MASK = "***";

export const NICKNAME_MASKS_TABLE = "leaderboard_nickname_masks";

/** Alias the fragment gives the masks table. Chosen not to collide with callers' aliases. */
const MASK_ALIAS = "nmask";

export interface NicknameMaskSql {
  /**
   * SELECT-list expression for the name the public sees. Contains exactly ONE `?`,
   * which the caller binds to {@link NICKNAME_MASK}. The mask is bound rather than
   * spliced into the SQL so there is one string, not a string and its escaped copy.
   *
   * It sits in the SELECT list, i.e. BEFORE the join and the WHERE in the SQL text,
   * so its placeholder is the first one: bind `[NICKNAME_MASK, ...whereBinds]`.
   */
  displayName: string;
  /** SELECT-list expression, 1 when an entry applies to the row, else 0. No placeholders. */
  masked: string;
  /** The LEFT JOIN, placed after `FROM <table> <alias>`. No placeholders. */
  join: string;
}

const IDENT = /^[a-z][a-z0-9_]*$/;

/**
 * @param appId  a key of the app registry (`'m2'`, `'neurons'`) — code, never request
 *               input. Inlined as a literal after this check.
 * @param alias  the alias the caller gave its leaderboard table in `FROM`.
 */
export function nicknameMaskSql(appId: string, alias: string): NicknameMaskSql {
  if (!IDENT.test(appId)) throw new Error(`nicknameMaskSql: bad app id ${JSON.stringify(appId)}`);
  if (!IDENT.test(alias)) throw new Error(`nicknameMaskSql: bad alias ${JSON.stringify(alias)}`);
  const applies = `${MASK_ALIAS}.user_id IS NOT NULL`;
  return {
    displayName: `CASE WHEN ${applies} THEN ? ELSE ${alias}.nickname END`,
    masked: `(CASE WHEN ${applies} THEN 1 ELSE 0 END)`,
    join:
      `LEFT JOIN ${NICKNAME_MASKS_TABLE} ${MASK_ALIAS}` +
      ` ON ${MASK_ALIAS}.app_id = '${appId}'` +
      ` AND ${MASK_ALIAS}.user_id = ${alias}.user_id` +
      ` AND ${MASK_ALIAS}.nickname_lower = ${alias}.nickname_lower`,
  };
}
