import { describe, it, expect } from 'vitest';
import { LONG_RUN, MAX_SCRUB_CHARS, capForScrub, scrubForTransmission } from '../../src/triage/scrub.js';
import { containsSecrets, redact } from '../../src/utils/redact.js';

describe('scrubForTransmission — URLs, hosts and paths', () => {
  it('reduces a URL to its path and drops the query', () => {
    const r = scrubForTransmission('see https://staging.app.internal/account/payment-methods?x=1&y=2 now');
    expect(r.text).toBe('see [URL /account/payment-methods] now');
    expect(r.redactions).toContain('URL');
  });

  it('keeps sentence punctuation after a URL', () => {
    const r = scrubForTransmission('Open https://staging.app.internal/. Then wait.');
    expect(r.text).toBe('Open [URL /]. Then wait.');
  });

  it('never lets basic-auth credentials embedded in a URL through', () => {
    const r = scrubForTransmission('opened https://qa-user:s3cret-pass@staging.app.internal/profile/avatar');
    expect(r.text).toBe('opened [URL /profile/avatar]');
    expect(r.text).not.toContain('s3cret');
    expect(r.text).not.toContain('qa-user');
  });

  it('replaces a bare hostname with [HOST]', () => {
    const r = scrubForTransmission('the host stage.app.internal returned 403');
    expect(r.text).toBe('the host [HOST] returned 403');
    expect(r.redactions).toContain('Host');
  });

  it('keeps example.* and localhost readable', () => {
    const r = scrubForTransmission('example.com and api.example.org and localhost stay');
    expect(r.text).toBe('example.com and api.example.org and localhost stay');
    expect(r.redactions).not.toContain('Host');
  });

  it('does not mistake file names for hosts', () => {
    const input = 'BUG-003.png, snapshot.json, README.md, e5-contacts.yml and page.html are files';
    expect(scrubForTransmission(input).text).toBe(input);
  });

  it('reduces an absolute path to its basename', () => {
    const r = scrubForTransmission(
      'saved /home/someone/project/output/sessions/2026-09-20-1500-explore-x/screenshots/BUG-001.png here',
    );
    expect(r.text).toBe('saved BUG-001.png here');
    expect(r.redactions).toContain('Path');
  });

  it('hides a storage-state reference', () => {
    const r = scrubForTransmission('state-load .auth/example-target.json after open');
    expect(r.text).toBe('state-load [AUTH_STATE] after open');
    expect(r.redactions).toContain('Path');
  });

  it('leaves non-ASCII text alone', () => {
    const input = 'Zoë, Ana Núñez and Łukasz saw “Please check the card details”';
    expect(scrubForTransmission(input).text).toBe(input);
  });

  it('scrubs upper-case and websocket URLs, query string included', () => {
    const r = scrubForTransmission('HTTP://APP.Corp.IO/login?session=abc123&sig=zz then wss://rt.corp.io/feed?auth=x');
    expect(r.text).toBe('[URL /login] then [URL /feed]');
  });

  it('reduces a Windows path to its basename and hides a backslash storage-state path', () => {
    expect(scrubForTransmission('saved C:\\Users\\bob\\proj\\shot.png').text).toBe('saved shot.png');
    expect(scrubForTransmission('loaded proj\\.auth\\acme.json').text).toBe('loaded proj\\[AUTH_STATE]');
  });

  it('covers CI and container roots without eating URL tokens', () => {
    expect(scrubForTransmission('ran /workspace/acme-web/output/x.md').text).toBe('ran x.md');
    expect(scrubForTransmission('see https://x.internal/srv/status').text).toBe('see [URL /srv/status]');
  });

  it('documents its gaps: IPs, single-label hosts and URL paths pass through', () => {
    expect(scrubForTransmission('call 10.0.0.12 on intranet').text).toBe('call 10.0.0.12 on intranet');
    expect(scrubForTransmission('https://x.internal/customers/acme').text).toBe('[URL /customers/acme]');
  });
});

describe('scrubForTransmission — composes redact()', () => {
  it('still redacts secrets and reports their categories', () => {
    const r = scrubForTransmission('Authorization: Bearer abcdefghijklmnop\nmail someone@corp-mail.internal');
    expect(r.text).toContain('Authorization: [REDACTED]');
    expect(r.text).toContain('[EMAIL_REDACTED]');
    expect(r.redactions).toEqual(expect.arrayContaining(['Authorization header', 'Email']));
  });

  it('does not change what redact() and containsSecrets() do', () => {
    expect(containsSecrets('contact support@example.com for help')).toBe(false);
    expect(containsSecrets('POST /api/login took 1743183294821 ns')).toBe(false);
    expect(containsSecrets('the host stage.app.internal returned 403')).toBe(false);
    expect(redact('https://stage.app.internal/x').text).toBe('https://stage.app.internal/x');
  });
});

describe('scrubForTransmission — every scheme, escaped URLs, scheme-less queries', () => {
  it.each([
    ['redis://default:hunter2@cache.corp.io:6379/0?db=1', '[URL /0]'],
    ['postgres://admin:pw@db.corp.io:5432/orders?sslmode=require', '[URL /orders]'],
    ['mongodb+srv://svc:pw@cluster0.corp.io/app?retryWrites=true', '[URL /app]'],
    ['amqp://guest:guest@mq.corp.io/vhost', '[URL /vhost]'],
    ['ftp://u:p@files.corp.io/exports/a.csv', '[URL /exports/a.csv]'],
    ['jdbc:mysql://db.corp.io/x', 'jdbc:[URL /x]'],
  ])('reduces %s to its path, userinfo and query dropped', (input, expected) => {
    const r = scrubForTransmission(`dsn ${input} end`);
    expect(r.text).toBe(`dsn ${expected} end`);
    expect(r.text).not.toMatch(/hunter2|admin|guest|svc:|corp\.io|sslmode|retryWrites/);
    expect(r.redactions).toContain('URL');
  });

  it('handles a JSON-escaped URL inside a response body', () => {
    const r = scrubForTransmission('{"next":"https:\\/\\/api.corp.io\\/v1\\/orders?token=abc123&page=2","ok":true}');
    expect(r.text).toBe('{"next":"[URL /v1/orders]","ok":true}');
  });

  it('drops the query of a scheme-less host/path?query and keeps the path', () => {
    expect(scrubForTransmission('go to app.corp.io/orders?session=abc now').text).toBe('go to [HOST]/orders now');
    expect(scrubForTransmission('docs at example.com/help?t=secret-ish').text).toBe('docs at example.com/help');
    expect(scrubForTransmission('ping stage.corp.io?k=v').text).toBe('ping [HOST]');
  });
});

describe('scrubForTransmission — bounded work on hostile input', () => {
  const budgetMs = 200;
  it.each([
    ['a × 200k', 'a'.repeat(2e5)],
    ['a- × 100k', 'a-'.repeat(1e5)],
    ['a. × 100k', 'a.'.repeat(1e5)],
    ['160-char runs', ('a'.repeat(LONG_RUN) + ' ').repeat(1250)],
    ['160-char dotted runs', ('a.'.repeat(LONG_RUN / 2) + ' ').repeat(1250)],
    ['repeated scheme', 'http://'.repeat(3e4)],
    ['near-e-mails', ('a'.repeat(150) + '@ ').repeat(1300)],
  ])('scrubs %s in under 200 ms', (_label, input) => {
    const t = performance.now();
    scrubForTransmission(input);
    expect(performance.now() - t).toBeLessThan(budgetMs);
  });

  it('replaces an unbroken run longer than LONG_RUN whole', () => {
    const jwtish = `${'A'.repeat(100)}.${'b'.repeat(100)}.${'c'.repeat(100)}`;
    const r = scrubForTransmission(`token ${jwtish} end`);
    expect(r.text).toBe('token [LONG_TOKEN] end');
    expect(r.redactions).toContain('Long token');
  });

  it('never looks past MAX_SCRUB_CHARS', () => {
    const r = scrubForTransmission('word '.repeat(MAX_SCRUB_CHARS / 4));
    expect(r.text.length).toBeLessThan(MAX_SCRUB_CHARS + 100);
    expect(r.text).toMatch(/\[truncated \d+ chars\]$/);
  });
});

describe('capForScrub', () => {
  it('leaves a short string alone', () => {
    expect(capForScrub('short', 10)).toBe('short');
  });

  it('drops the token the cut lands in, so half a secret is not sent', () => {
    const out = capForScrub('keep this ghp_abcdefghijklmnopqrstuvwxyz0123', 20);
    expect(out).toBe('keep this … [truncated 34 chars]');
  });
});
