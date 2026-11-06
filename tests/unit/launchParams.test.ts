import { parseLaunchParams } from '../../src/platform/launchParams';

const VALID = 'cr_lang=english&cr_book=animals';

function userIdOf(search: string): string {
  const result = parseLaunchParams(search);
  if (!result.ok) throw new Error('expected valid launch params');
  return result.params.userId;
}

describe('UT-01 parseLaunchParams: valid launch URL', () => {
  it('returns lang, deck and userId', () => {
    expect(parseLaunchParams('?cr_lang=english&cr_book=animals&cr_user_id=u1')).toEqual({
      ok: true,
      params: { lang: 'english', deck: 'animals', userId: 'u1' },
    });
  });

  it('accepts a search string without the leading "?" and hyphenated 64-char slugs', () => {
    const slug = `a-${'b'.repeat(62)}`;
    expect(parseLaunchParams(`cr_lang=${slug}&cr_book=deck-2`)).toEqual({
      ok: true,
      params: { lang: slug, deck: 'deck-2', userId: '' },
    });
  });
});

describe('UT-02 parseLaunchParams: missing or empty required params', () => {
  it.each([
    ['missing cr_lang', '?cr_book=animals&cr_user_id=u1'],
    ['empty cr_lang', '?cr_lang=&cr_book=animals'],
    ['missing cr_book', '?cr_lang=english&cr_user_id=u1'],
    ['empty cr_book', '?cr_lang=english&cr_book='],
    ['no query at all', ''],
  ])('%s → E1', (_label, search) => {
    expect(parseLaunchParams(search)).toEqual({ ok: false, error: 'E1' });
  });
});

describe('UT-03 parseLaunchParams: invalid lang/deck', () => {
  const invalid = [
    ['../x', '../x'],
    ['ENGLISH', 'ENGLISH'],
    ['a b (encoded %20)', 'a%20b'],
    ['a b (encoded +)', 'a+b'],
    ['a/b', 'a/b'],
    ['%2e%2e', '%2e%2e'],
    ['65 chars', 'a'.repeat(65)],
    ['""', ''],
  ];

  it.each(invalid)('cr_lang=%s → E1 with no params to build a path from', (_label, value) => {
    const result = parseLaunchParams(`?cr_lang=${value}&cr_book=animals`);
    expect(result).toEqual({ ok: false, error: 'E1' });
    expect(result).not.toHaveProperty('params');
  });

  it.each(invalid)('cr_book=%s → E1 with no params to build a path from', (_label, value) => {
    const result = parseLaunchParams(`?cr_lang=english&cr_book=${value}`);
    expect(result).toEqual({ ok: false, error: 'E1' });
    expect(result).not.toHaveProperty('params');
  });

  it('rejects padded values instead of trimming them', () => {
    expect(parseLaunchParams('?cr_lang=%20english&cr_book=animals')).toEqual({ ok: false, error: 'E1' });
  });
});

describe('UT-04 parseLaunchParams: cr_user_id', () => {
  it('is "" when absent', () => {
    expect(userIdOf(`?${VALID}`)).toBe('');
  });

  it('is trimmed when whitespace-padded', () => {
    expect(userIdOf(`?${VALID}&cr_user_id=%20%09u1%20`)).toBe('u1');
  });

  it('is "" when longer than 128 chars and kept at exactly 128', () => {
    expect(userIdOf(`?${VALID}&cr_user_id=${'x'.repeat(129)}`)).toBe('');
    expect(userIdOf(`?${VALID}&cr_user_id=${'x'.repeat(128)}`)).toBe('x'.repeat(128));
  });

  it('is otherwise opaque and not validated', () => {
    expect(userIdOf(`?${VALID}&cr_user_id=${encodeURIComponent('Ab_9/..:é')}`)).toBe('Ab_9/..:é');
  });
});
