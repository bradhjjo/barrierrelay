import { describe, expect, it } from 'vitest';
import type { Ticket } from '@barrierrelay/shared/src/schema';
import { githubNewIssueUrl, issueMarkdown, issueTitle } from './issueExport';

export function sampleTicket(): Ticket {
  return {
    id: 'secret-ticket-id', reporterUid: 'private-reporter', createdAt: '', status: 'open',
    site: { origin: 'https://example.com', path: '/checkout' },
    draft: { barrierType: 'unnamed-button', targetRef: 'e1', summary: 'Button has no name', stepsToReproduce: ['Tab to button'], expected: 'Announce Pay', actual: 'Announces button', confidence: 'high' },
    fixPlan: { wcag: [{ sc: '4.1.2', title: 'Name, Role, Value', level: 'A' }], rootCause: 'Missing label', fix: { description: 'Add label', codeBefore: '<button>```</button>', codeAfter: '<button aria-label="Pay">````</button>' }, verification: ['Tab and listen'], sources: [{ title: 'WCAG', url: 'https://www.w3.org/WAI/' }] },
    sharedFacts: { elements: [], focusTrail: [], ruleHits: [], assistive: [] }, routing: [],
  };
}

describe('issue export', () => {
  it('keeps titles plain text while retaining private-data filtering', () => {
    const ticket = sampleTicket(); ticket.draft.summary = 'R&D *button* capture=secret';
    expect(issueTitle(ticket)).toBe('[a11y] R&D *button* [link removed]');
    expect(new URL(githubNewIssueUrl('owner/repo', ticket)!).searchParams.get('title')).toBe(issueTitle(ticket));
  });
  it('exports sanitized environment and assistive context plus unconditional reply and WAI resources', () => {
    const ticket = sampleTicket(); ticket.fixPlan = null;
    ticket.sharedFacts.environment = { browser: { name: 'R&D <browser> capture=private', major: 140 }, os: { name: 'Linux secret-ticket-id' }, settings: { forcedColors: true, prefersContrast: 'more', reducedMotion: true, colorScheme: 'dark', devicePixelRatio: 1.5 } };
    ticket.sharedFacts.assistive = ['screen-reader', 'keyboard-only'];
    const markdown = issueMarkdown(ticket);
    for (const value of ['## Environment', 'R&amp;D', '140', 'Forced colors: active', 'Contrast preference: more', 'Reduced motion: requested', 'Color scheme: dark', 'Device pixel ratio: 1.5', '## Assistive technology context', 'screen reader', 'keyboard only', '**Please reply:**', '## Learn more', 'https://www.w3.org/WAI/fundamentals/accessibility-intro/', 'https://www.w3.org/WAI/people-use-web/user-stories/', 'https://www.w3.org/WAI/standards-guidelines/wcag/']) expect(markdown).toContain(value);
    expect(markdown).not.toContain('capture=private'); expect(markdown).not.toContain(ticket.id);
    delete ticket.sharedFacts.environment;
    expect(issueMarkdown(ticket)).not.toContain('## Environment');
  });
  it('exports the repair details, checklist, sources and scoped disclaimer', () => {
    const markdown = issueMarkdown(sampleTicket());
    for (const text of ['https://example.com/checkout', 'Tab to button', 'Announce Pay', 'Announces button', '4.1.2', 'Missing label', 'Add label', '- [ ] Tab and listen', '[WCAG](<https://www.w3.org/WAI/>)', 'not WCAG certification.']) expect(markdown).toContain(text);
    expect(issueTitle(sampleTicket())).toBe('[a11y] Button has no name');
  });
  it('uses fences longer than embedded backtick runs', () => {
    const markdown = issueMarkdown(sampleTicket());
    expect(markdown).toContain('````\n<button>```</button>\n````');
    expect(markdown).toContain('`````\n<button aria-label="Pay">````</button>\n`````');
  });
  it('never exposes bearer-like ticket/owner URLs, ticket IDs or capture metadata', () => {
    const ticket = Object.assign(sampleTicket(), { ownerUrl: 'https://relay.test/t/secret-ticket-id', captureToken: 'capture-secret' });
    ticket.draft.actual += ' https://relay.test/t/secret-ticket-id?token=capture-secret';
    const output = issueMarkdown(ticket) + issueTitle(ticket) + githubNewIssueUrl('owner/repo', ticket);
    for (const secret of [ticket.id, ticket.reporterUid, ticket.ownerUrl, ticket.captureToken]) expect(output).not.toContain(secret);
  });
  it('redacts relative links to other tickets, recapture parameters and bare UUIDs in every public field', () => {
    const ticket = sampleTicket();
    const otherId = 'Ab123456789012345678';
    const uuid = '12345678-1234-4abc-8abc-123456789abc';
    const secret = `/t/${otherId}?edit=yes#private https://relay.test/recapture?CAPTURE=${uuid}&EXT=extension-secret ${uuid} ${ticket.id.toUpperCase()}`;
    ticket.draft.summary = secret;
    ticket.draft.actual = secret;
    ticket.draft.expected = secret;
    ticket.draft.stepsToReproduce = [secret];
    ticket.fixPlan!.rootCause = secret;
    ticket.fixPlan!.fix.description = secret;
    ticket.fixPlan!.verification = [secret];
    ticket.fixPlan!.wcag[0].title = secret;
    ticket.fixPlan!.sources[0].title = secret;
    const markdown = issueMarkdown(ticket);
    const title = issueTitle(ticket);
    const body = new URL(githubNewIssueUrl('owner/repo', ticket)!).searchParams.get('body')!;
    for (const output of [markdown, title, body]) {
      for (const value of [otherId, uuid, 'extension-secret', ticket.id, '/t/', 'capture=', 'ext=']) {
        expect(output.toLowerCase()).not.toContain(value.toLowerCase());
      }
    }
    expect(markdown).toContain('link removed');
  });
  it('drops source URLs containing ticket paths or capture/ext parameters', () => {
    const ticket = sampleTicket();
    ticket.fixPlan!.sources.push(
      { title: 'Private capture', url: 'https://relay.test/start?capture=12345678-1234-4abc-8abc-123456789abc' },
      { title: 'Private extension', url: 'https://relay.test/start?ext=extension-secret' },
      { title: 'Private ticket', url: 'https://relay.test/t/Ab123456789012345678' },
    );
    const markdown = issueMarkdown(ticket);
    expect(markdown).not.toMatch(/Private capture|Private extension|Private ticket|extension-secret/);
    expect(markdown).toContain('[WCAG](<https://www.w3.org/WAI/>)');
  });
  it('removes URI-encoded private data from text, page paths and source URLs', () => {
    const ticket = sampleTicket();
    ticket.id = 'PrivateTicketA000001';
    const otherId = 'OtherTicketA00000001';
    const uuid = '12345678-1234-4abc-8abc-123456789abc';
    const ticketPath = `/t/${otherId}`;
    const once = encodeURIComponent(ticketPath);
    const twice = encodeURIComponent(once);
    const variants = [
      `${ticketPath}#frag`, `/%2Ft%2F${otherId}#frag`, '/%74/%50rivateTicketA000001',
      `/start#?%43APTURE=secret&EXT%3Dopaque`, `/${uuid.replaceAll('-', '%2D')}`,
      `/${once}`, `/${twice}`, `/${encodeURIComponent(twice)}`, `/%ZZ${once}`,
    ];
    for (const path of variants) {
      const url = `https://relay.invalid${path}`;
      ticket.draft.summary = ticket.draft.actual = `Before ${url} after`;
      ticket.fixPlan!.sources = [{ title: 'Private source', url }];
      expect(issueTitle(ticket)).toBe('[a11y] Before [link removed] after');
      const github = new URL(githubNewIssueUrl('owner/repo', ticket)!);
      expect(github.searchParams.get('title')).toBe('[a11y] Before [link removed] after');
      const markdown = issueMarkdown(ticket);
      expect(markdown).toContain('## Actual\nBefore \\[link removed\\] after\n');
      expect(github.searchParams.get('body')).toBe(markdown);
      expect(markdown).not.toMatch(/Private source|relay\.invalid|secret|opaque/);
    }
    for (const path of variants.filter(path => !path.startsWith('/start'))) {
      ticket.site.path = `${path.split('#')[0]}?discard=yes`;
      expect(issueMarkdown(ticket)).toContain('**Page:** \\[link removed\\]\n');
    }
  });
  it.each([4, 5, 6, 8])('removes a %i-level encoded ticket path from every export destination', (depth) => {
    const ticket = sampleTicket();
    const otherId = 'OtherTicketA00000001';
    let encoded = `/t/${otherId}`;
    for (let i = 0; i < depth; i++) encoded = encodeURIComponent(encoded);
    const url = `https://relay.invalid/${encoded}`;
    ticket.site.path = `/${encoded}`;
    ticket.draft.summary = ticket.draft.actual = url;
    ticket.fixPlan!.sources = [{ title: 'Private source', url }];
    const markdown = issueMarkdown(ticket);
    const github = new URL(githubNewIssueUrl('owner/repo', ticket)!);
    expect(issueTitle(ticket)).toBe('[a11y] [link removed]');
    expect(markdown).toContain('**Page:** \\[link removed\\]');
    expect(markdown).toContain('## Actual\n\\[link removed\\]');
    expect(markdown).not.toMatch(/relay\.invalid|Private source|OtherTicketA00000001/);
    expect(github.searchParams.get('title')).toBe('[a11y] [link removed]');
    expect(github.searchParams.get('body')).toBe(markdown);
  });
  it('removes a fully encoded current ticket ID even from code snippets', () => {
    const ticket = sampleTicket();
    ticket.id = 'PrivateTicketA000001';
    let encoded = Array.from(ticket.id, char => `%${char.charCodeAt(0).toString(16)}`).join('');
    for (let i = 0; i < 3; i++) encoded = encodeURIComponent(encoded);
    ticket.draft.actual = encoded;
    ticket.fixPlan!.fix.codeBefore = `const id = '${encoded}';`;
    ticket.fixPlan!.fix.codeAfter = `const id = '${encoded}';`;
    const markdown = issueMarkdown(ticket);
    expect(markdown).toContain('## Actual\n\\[link removed\\]');
    expect(markdown).toContain('### Before\n[link removed]');
    expect(markdown).toContain('### After\n[link removed]');
    expect(markdown).not.toContain(encoded);
    expect(new URL(githubNewIssueUrl('owner/repo', ticket)!).searchParams.get('body')).toBe(markdown);
  });
  it('fails closed on over-budget or unresolved escapes without hiding ordinary percent text', () => {
    const ticket = sampleTicket();
    // A deeply encoded benign value still exhausts the budget: there is no proof of a safe fixpoint.
    let overBudget = '%41';
    for (let i = 0; i < 11; i++) overBudget = encodeURIComponent(overBudget);
    const url = `https://docs.invalid/${overBudget}`;
    ticket.draft.summary = `${overBudget} %FF 100% safe%20path`;
    ticket.site.path = `/${overBudget}`;
    ticket.fixPlan!.sources = [{ title: 'Unresolved source', url }];
    const markdown = issueMarkdown(ticket);
    expect(issueTitle(ticket)).toBe('[a11y] [link removed] [link removed] 100% safe%20path');
    expect(markdown).toContain('**Page:** \\[link removed\\]');
    expect(markdown).not.toContain('Unresolved source');
  });
  it.each([
    '&#47;t&#47;OtherTicketA00000001',
    '&#x2F;&#116;&#x2f;OtherTicketA00000001',
    '&sol;t&sol;OtherTicketA00000001',
    'capture&#61;secret',
    '&colon;&quest;capture&equals;secret&amp;ext&equals;opaque',
    '%26amp%3Bsol%3B%26%23116%3B%26percnt%3B2FOtherTicketA00000001',
    '%26%2337%3B43APTURE%26%23x3D%3Bsecret',
    '∕t∕OtherTicketA00000001',
    '／ｔ／OtherTicketA00000001',
    '/t/Oth\u200berTicketA00000001',
    'capture\u200b=secret',
    'ＥＸＴ＝opaque',
  ])('checks entity, mixed encoding and Unicode variants: %s', (value) => {
    const ticket = sampleTicket();
    const url = `https://relay.invalid/${value}`;
    ticket.draft.summary = ticket.draft.actual = `Before ${value} after`;
    ticket.site.path = `/${value}`;
    ticket.fixPlan!.sources = [{ title: 'Private source', url }];
    const markdown = issueMarkdown(ticket);
    const github = new URL(githubNewIssueUrl('owner/repo', ticket)!);
    expect(issueTitle(ticket)).toBe('[a11y] Before [link removed] after');
    expect(markdown).toContain('## Actual\nBefore \\[link removed\\] after');
    expect(markdown).toContain('**Page:** \\[link removed\\]');
    expect(markdown).not.toMatch(/Private source|OtherTicketA00000001|secret|opaque/);
    expect(github.searchParams.get('body')).toBe(markdown);
  });
  it('escapes every public ampersand so benign entity spellings display literally', () => {
    const ticket = sampleTicket();
    ticket.draft.summary = ticket.draft.actual = 'R&D, &copy; and &#169;';
    ticket.fixPlan!.sources = [{ title: 'R&D &copy;', url: 'https://docs.invalid/r&d' }];
    const markdown = issueMarkdown(ticket);
    const escaped = 'R&amp;D, &amp;copy; and &amp;#169;';
    expect(issueTitle(ticket)).toBe('[a11y] R&D, &copy; and &#169;');
    expect(markdown).toContain(`## Actual\n${escaped}`);
    expect(markdown).toContain('- [R&amp;D &amp;copy;](<https://docs.invalid/r&amp;d>)');
  });
  it('removes the whole token for scheme-relative links including suffixes and fragments', () => {
    const ticket = sampleTicket();
    ticket.draft.summary = '//relay.invalid/t/OtherTicketA00000001/notes#frag';
    expect(issueTitle(ticket)).toBe('[a11y] [link removed]');
    expect(issueMarkdown(ticket)).not.toMatch(/relay\.invalid|OtherTicketA00000001|notes#frag/);
  });
  it('removes parameter values separated by spaces, newlines, and tabs', () => {
    const ticket = sampleTicket();
    for (const [parameters, removed] of [
      ['CAPTURE=\nsecret ext=\r\nopaque', 4],
      ['CAPTURE \t= secret EXT\t=opaque', 5],
      ['%43APTURE%3D \tsecret EXT%20%3D\r\nopaque', 4],
    ] as const) {
      ticket.draft.summary = ticket.draft.actual = `Before ${parameters} after`;
      const title = issueTitle(ticket);
      const markdown = issueMarkdown(ticket);
      for (const output of [title, markdown]) expect(output).not.toMatch(/\b(?:capture|ext)\b|secret|opaque/i);
      expect(title).toBe(`[a11y] Before ${'[link removed] '.repeat(removed)}after`);
      expect(new URL(githubNewIssueUrl('owner/repo', ticket)!).searchParams.get('body')).toBe(markdown);
    }
  });
  it('emits only origin and pathname for public pages and http(s) sources', () => {
    const ticket = sampleTicket();
    ticket.site.path = '/checkout?tracking=abc#details';
    ticket.fixPlan!.sources = [
      { title: '[WCAG] <reference>', url: 'https://docs.invalid/guides?tracking=abc#details' },
      { title: 'Insecure scheme', url: 'javascript:alert(1)' },
    ];
    const markdown = issueMarkdown(ticket);
    expect(markdown).toContain('**Page:** https://example.com/checkout\n');
    expect(markdown).toContain('- [\\[WCAG\\] \\<reference\\>](<https://docs.invalid/guides>)');
    expect(markdown).not.toMatch(/tracking|details|Insecure scheme|javascript:/);
  });
  it('flattens Setext headings, thematic breaks, lists, fences and indents without changing fenced code', () => {
    const ticket = sampleTicket();
    const code = '    indented code\t\r\npublic text\n===\n\n---\n\n1) list\n\n~~~~~\nunintended code\n~~~~~\n\talso indented';
    ticket.draft.actual = ticket.fixPlan!.fix.codeAfter = code;
    const markdown = issueMarkdown(ticket);
    expect(markdown).toContain('## Actual\nindented code public text === --- 1) list \\~\\~\\~\\~\\~ unintended code \\~\\~\\~\\~\\~ also indented\n\n## WCAG success criteria');
    expect(markdown).toContain('### After\n``````\n' + code + '\n``````\n');
  });
  it.each([
    ['# heading', '\\# heading'], ['> quote', '\\> quote'], ['- list', '\\- list'], ['+ list', '\\+ list'],
    ['* list', '\\* list'], ['===', '\\==='], ['---', '\\---'], ['| table', '\\| table'],
    ['~~~', '\\~\\~\\~'], ['```js', '\\`\\`\\`js'], ['12. list', '12\\. list'], ['12) list', '12\\) list'],
    ['inline <b> and `code`', 'inline \\<b\\> and \\`code\\`'],
  ])('escapes free text %j without introducing Markdown blocks', (input, escaped) => {
    const ticket = sampleTicket();
    ticket.draft.summary = ticket.draft.actual = input;
    expect(issueTitle(ticket)).toBe(`[a11y] ${input}`);
    expect(issueMarkdown(ticket)).toContain(`## Actual\n${escaped}\n\n## WCAG success criteria`);
  });
  it('withholds code containing bearer data instead of rewriting its contents', () => {
    const ticket = sampleTicket();
    ticket.fixPlan!.fix.codeAfter = 'a.href = "/%2Ft%2FOtherTicketA00000001"';
    const markdown = issueMarkdown(ticket);
    expect(markdown).toContain('### After\n[link removed]\n');
    expect(markdown).not.toContain('OtherTicketA00000001');
  });
  it('rejects repository dot segments and accepts other contract-valid segments after trimming', () => {
    const ticket = sampleTicket();
    for (const repo of ['owner/..', './x', '../repo', 'owner/.']) expect(githubNewIssueUrl(repo, ticket)).toBeNull();
    for (const repo of ['owner/repo', 'owner/_repo', 'owner/-repo', 'owner/..repo', '.github/.github']) {
      expect(new URL(githubNewIssueUrl(` ${repo} `, ticket)!).pathname).toBe(`/${repo}/issues/new`);
    }
  });
  it('does not put ticket-shaped segments or the current ticket ID in a repo URL', () => {
    const ticket = sampleTicket();
    ticket.id = 'PrivateTicketA000001';
    for (const repo of [`owner/${ticket.id}`, `${ticket.id.toUpperCase()}-mirror/repo`, 'owner/OtherTicketA00000001', 'OtherTicketA00000001/repo']) {
      expect(githubNewIssueUrl(repo, ticket)).toBeNull();
    }
  });
  it('caps titles and supports tickets without plans', () => {
    const ticket = sampleTicket(); ticket.draft.summary = 'x'.repeat(200); ticket.fixPlan = null;
    expect(issueTitle(ticket).length).toBe(120);
    expect(issueMarkdown(ticket)).toContain('Fix plan not available yet.');
  });
  it('validates repository names and encodes title and body', () => {
    for (const repo of ['', 'repo', 'a/b/c', 'https://github.com/a/b', 'a/b?x=y', 'a b/c']) expect(githubNewIssueUrl(repo, sampleTicket())).toBeNull();
    const url = new URL(githubNewIssueUrl('owner/repo.name-1', sampleTicket())!);
    expect(url.pathname).toBe('/owner/repo.name-1/issues/new');
    expect(url.searchParams.get('title')).toBe(issueTitle(sampleTicket()));
    expect(url.searchParams.get('body')).toBe(issueMarkdown(sampleTicket()));
  });
  it('keeps encoded URLs bounded and asks to paste copied Markdown', () => {
    const ticket = sampleTicket(); ticket.draft.actual = '障'.repeat(10000);
    const url = githubNewIssueUrl('owner/repo', ticket)!;
    expect(url.length).toBeLessThanOrEqual(7500);
    expect(new URL(url).searchParams.get('body')).toContain('Paste the copied Markdown');
    expect(githubNewIssueUrl(`${'a'.repeat(8000)}/b`, ticket)).toBeNull();
  });
});
