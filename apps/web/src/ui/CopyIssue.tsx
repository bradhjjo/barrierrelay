import { useState } from 'preact/hooks';
import type { Ticket } from '@barrierrelay/shared/src/schema';
import { githubNewIssueUrl, issueMarkdown } from '../owner/issueExport';

export function CopyIssue({ ticket }: { ticket: Ticket }) {
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState('');
  const url = githubNewIssueUrl(repo, ticket);
  async function copy() {
    if (!navigator.clipboard?.writeText) {
      setStatus('Clipboard unavailable. Download the Markdown instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(issueMarkdown(ticket));
      setStatus('GitHub issue Markdown copied.');
    } catch {
      setStatus('Could not copy to clipboard. Download the Markdown instead.');
    }
  }
  function download() {
    try {
      const objectUrl = URL.createObjectURL(new Blob([issueMarkdown(ticket)], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'accessibility-issue.md';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setStatus('Markdown download started.');
    } catch {
      setStatus('Download unavailable. Try copying the Markdown instead.');
    }
  }
  return <section aria-label="Export GitHub issue">
    <button type="button" onClick={copy}>Copy as GitHub issue</button>
    <button type="button" onClick={download}>Download .md</button>
    <label>GitHub repository (optional, owner/repo)
      <input type="text" value={repo} placeholder="owner/repo" onInput={event => setRepo(event.currentTarget.value)} spellcheck={false} />
    </label>
    {url
      ? <a href={url} target="_blank" rel="noreferrer">Open new GitHub issue</a>
      : <span aria-disabled="true">Open new GitHub issue</span>}
    <p role="status">{status}</p>
  </section>;
}
