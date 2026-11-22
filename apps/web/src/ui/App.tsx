import { useEffect, useRef, useState } from 'preact/hooks';
import { armReturn, isExtensionMissing } from '../capture/intake';
import type { BarrierDraft, FixPlan, RoutingLogEntry, Ticket, TicketStatus } from '@barrierrelay/shared/src/schema';
import { BARRIER_TYPES } from '@barrierrelay/shared/src/schema';
import type { CaptureBundle, ShareApprovals } from '../contracts';
import { OnDeviceUnavailableError } from '../contracts';
import { createServices, ticketStore } from '../services';
import type { Services } from '../services';
import { ShareSummary } from './ShareSummary';
import { CopyIssue } from './CopyIssue';
import { collectEnvironment, environmentWords } from '../../../../packages/collector/src/environment';
const badges = { 'on-device': 'On-device', 'in-cloud': 'Cloud', 'local-code': 'Local code' };
function Routing({ rows }: { rows: RoutingLogEntry[] }) { return <aside class="routing" aria-labelledby="routing-title"><h2 id="routing-title">Hybrid routing</h2><p>Raw capture stays local. Only your approved payload may reach cloud AI.</p><table><caption>Execution location and data sent</caption><thead><tr><th scope="col">Step</th><th scope="col">Ran on</th><th scope="col">ms</th><th scope="col">Cloud bytes</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{row.step}{row.note && <small>{row.note}</small>}</td><td><span class={`badge ${row.ranOn}`}>{badges[row.ranOn]}</span></td><td>{Math.round(row.ms)}</td><td>{row.bytesSentToCloud}</td></tr>)}</tbody></table>{!rows.length && <p>No processing yet.</p>}</aside>; }
function Plan({ plan }: { plan: FixPlan }) {
  return <section>
    <h2>Fix plan</h2><p>{plan.rootCause}</p>
    <ul>{plan.wcag.map(w => <li key={w.sc}>WCAG {w.sc}: {w.title} ({w.level})</li>)}</ul>
    <p>{plan.fix.description}</p>
    {plan.fix.codeBefore && <><h3>Before</h3><pre><code>{plan.fix.codeBefore}</code></pre></>}
    <h3>After</h3><pre><code>{plan.fix.codeAfter}</code></pre>
    <h3>Verification checklist</h3>
    <ul>{plan.verification.map((v, i) => <li key={i}><label><input type="checkbox" /> {v}</label></li>)}</ul>
    <h3>Sources</h3>
    {plan.sources.length ? <ul class="sources">{plan.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}<br /><small>{s.url}</small></a></li>)}</ul> : <p>No grounding sources returned. Independently review this guidance.</p>}
  </section>;
}
export function App() {
  const [services, setServices] = useState<Services | null>(null);
  const [message, setMessage] = useState('Loading services…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [routing, setRouting] = useState<RoutingLogEntry[]>([]);
  const [device, setDevice] = useState('Checking…');
  const [progress, setProgress] = useState(0);
  const [cases, setCases] = useState<{ id: string }[]>([]);
  const [bundle, setBundle] = useState<CaptureBundle | null>(null);
  const [image, setImage] = useState('');
  const [draft, setDraft] = useState<BarrierDraft | null>(null);
  const [stepsText, setStepsText] = useState('');
  const [recaptureStatus, setRecaptureStatus] = useState('');
  const [fallback, setFallback] = useState(false);
  const [check, setCheck] = useState('');
  const [environmentFromBrowser, setEnvironmentFromBrowser] = useState(false);
  const [approvals, setApprovals] = useState<ShareApprovals>({ includeEnvironment: true, includePath: false, includeVisibleText: false, includeFocusTrail: false });
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [verifySource, setVerifySource] = useState('');
  const latestPayloadKey = useRef('');
  const [ownerLink, setOwnerLink] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [mine, setMine] = useState<Ticket[]>([]);
  const [step, setStep] = useState(1);
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const fixture = params.get('fixture');
  const append = (rows: RoutingLogEntry[], offline = !navigator.onLine) => setRouting(old => [
    ...old,
    ...rows.map(row => offline ? { ...row, note: [row.note, 'Offline'].filter(Boolean).join(' · ') } : row),
  ]);
  async function act(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  useEffect(() => { void act(async () => {
    const s = await createServices(); setServices(s); setMessage(s.demo ? 'Deterministic demo mode: no AI inference. Ticket storage still uses Firebase.' : 'Ready. Private on-device drafting; approved cloud fix planning.');
    void s.pipeline.onDeviceState().then(setDevice).catch(() => setDevice('unavailable'));
    const index = await fetch('/fixtures/index.json').then(r => r.json()); setCases(index.cases);
    if (path === '/report') {
      const caseId = fixture ? index.cases.find((c: { id: string }) => c.id === fixture || c.id.startsWith(`${fixture}-`))?.id : null;
      if (fixture && !caseId) throw new Error('Unknown demo case.');
      const b = caseId ? await s.intake.loadFixture(caseId, params.get('variant') === 'fixed' ? 'fixed' : 'broken') : await s.intake.waitForCapture();
      if (!b.facts.environment) { b.facts.environment = collectEnvironment(); setEnvironmentFromBrowser(true); }
      setBundle(b);
      append([{ step: 'collect', ranOn: 'local-code', mode: 'n/a', ms: 0, bytesSentToCloud: 0, note: b.source === 'fixture' ? `Synthetic fixture: ${caseId}` : 'Extension capture received.' }]);
    }
    if (path.startsWith('/t/')) { const t = await ticketStore.get(path.split('/')[2]); if (!t) throw new Error('Ticket not found.'); setTicket(t); setRouting(t.routing); }
    if (path === '/mine') setMine(await ticketStore.listMine());
  }); }, []);
  useEffect(() => { if (!bundle?.regionPng) return; const url = URL.createObjectURL(bundle.regionPng); setImage(url); return () => URL.revokeObjectURL(url); }, [bundle]);
  const payload = services && bundle && draft ? services.redact(bundle, draft, approvals) : null;
  latestPayloadKey.current = payload ? JSON.stringify(payload) : '';
  function editDraft(key: keyof BarrierDraft, value: unknown) { setDraft(old => old ? { ...old, [key]: value } : old); setPlan(null); setCheck('Draft changed; run self-check again.'); }
  async function selfCheck() { if (!services || !draft || !bundle) return; const result = await services.pipeline.selfCheck(draft, bundle.facts); append(result.log); setCheck(result.ok ? 'Self-check passed.' : `Review needed: ${result.issues.join(' ')}`); }
  async function changeStatus(status: TicketStatus) { if (!ticket) return; await ticketStore.setStatus(ticket.id, status); setTicket(await ticketStore.get(ticket.id)); setMessage(`Ticket status: ${status}`); }
  async function verify(caseId?: string) {
    if (!ticket || !services) return;
    const started = performance.now();
    if (caseId && !ticket.routing.some(row => row.step === 'collect' && row.note === `Synthetic fixture: ${caseId}`)) throw new Error('Choose the original demo fixture. Live-site tickets require a reporter re-capture.');
    const b = caseId ? await services.intake.loadFixture(caseId, 'fixed') : await services.intake.waitForCapture();
    if (ticket.draft.targetRef && !b.facts.elements.some(e => e.ref === ticket.draft.targetRef)) throw new Error('The reported target is missing from this capture; verification cannot pass.');
    if (!caseId && new URL(b.facts.page.url).origin !== ticket.site.origin) throw new Error('Re-capture the original site before verifying.');
    const targetHits = b.facts.ruleHits.filter(h => h.ref === ticket.draft.targetRef);
    const result = targetHits.length ? 'fail' : 'pass';
    await ticketStore.addVerification(ticket.id, result, targetHits);
    append([{ step: 'verify', ranOn: 'local-code', mode: 'n/a', ms: performance.now() - started, bytesSentToCloud: 0, note: caseId ? 'Synthetic fixed fixture collector results; not a live site verification.' : 'Re-captured page rules checked.' }]);
    setTicket(await ticketStore.get(ticket.id)); setMessage(`Verification ${result}.`);
  }
  return <><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/">BarrierRelay<span>ACCESSIBILITY, DELIVERED</span></a><nav aria-label="Main"><a href="/report">Report a barrier</a><a href="/mine">My tickets</a><a href="/#extension">Install extension</a></nav></header><div class="shell"><main id="main"><p class="eyebrow">PRIVATE CAPTURE → SHARED REPAIR</p><div role="status" aria-live="polite" class="notice">{busy ? 'Working… ' : ''}{message}</div>{error && <p role="alert" class="error">{error}</p>}
  {path === '/' && <><h1>Turn a blocked moment<br />into a better web.</h1><p class="lede">Capture an accessibility barrier privately. Review what you share. Give the site owner a clear path to a fix and a way to re-check it.</p><section><h2>Private on-device AI</h2><p>Status: <strong>{device}</strong></p><button disabled={!services || busy} onClick={() => { if (!services) return; setBusy(true); setError(''); services.pipeline.prepareOnDevice(setProgress).then(state => { setDevice(state); setMessage(`On-device AI: ${state}`); }).catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}>Prepare private on-device AI</button><progress value={progress} max="1" aria-label="On-device model preparation" /><p>No automatic download. Preparation starts only when you choose it.</p></section><section><h2>Try a demo</h2><p>Synthetic pages. No personal data. Choose a barrier to follow the full repair loop.</p><ul class="demo-list">{cases.map(c => <li key={c.id}><a href={`/report?fixture=${c.id}&variant=broken`}>{c.id.replaceAll('-', ' ')}</a></li>)}</ul></section><section id="extension"><h2>Install the capture extension</h2><ol><li>Download or clone the BarrierRelay source.</li><li>Build the extension with <code>npm run build --workspace=@barrierrelay/extension</code>.</li><li>Open Chrome extensions, enable Developer mode, and choose Load unpacked for <code>extension/dist</code>.</li><li>Select the blocked region and send the capture to this app.</li></ol><p>The extension collects selected-region facts, not passwords or form values.</p></section></>}
  {path === '/report' && <><h1>Report an accessibility barrier</h1><ol class="steps" aria-label="Report progress">{['Capture','Draft','Privacy','Fix plan','Share'].map((s, i) => <li aria-current={step === i + 1 ? 'step' : undefined} key={s}>{i + 1}. {s}</li>)}</ol>
    <section aria-labelledby="report-device-heading">
      <h2 id="report-device-heading">Private on-device AI</h2>
      <p>Status: <strong>{device}</strong></p>
      <button disabled={!services || busy} onClick={() => {
        if (!services) return;
        setBusy(true); setError('');
        // Invoke directly inside the trusted click, before yielding user activation.
        services.pipeline.prepareOnDevice(setProgress)
          .then(state => { setDevice(state); setMessage(`On-device AI: ${state}`); })
          .catch(e => setError(e instanceof Error ? e.message : String(e)))
          .finally(() => setBusy(false));
      }}>Prepare private on-device AI</button>
      <progress value={progress} max="1" aria-label="On-device model preparation" />
    </section>
    <section aria-labelledby="capture-heading">
      <h2 id="capture-heading">1. What we captured</h2>
      {bundle ? <>
        <p>{bundle.facts.page.title} · {bundle.facts.elements.length} elements · {bundle.source}</p>
        <p>Region image stays on this device and is never part of the shared ticket.</p>
        {image && <img class="capture" src={image} alt="Locally captured region of the reported page" />}
        <ul>{bundle.facts.elements.map(e => <li key={e.ref}><code>{e.ref}</code> {e.role ?? e.tag}: {e.accessibleName || '(no accessible name)'} · {e.focusable ? 'keyboard focusable' : 'not keyboard focusable'}</li>)}</ul>
        <h3>Focus trail</h3>
        <ol>{bundle.facts.focusTrail.map((f, i) => <li key={i}>{f.key} → {f.ref ?? 'outside region'}</li>)}</ol>
        <button disabled={busy || !services || !!ownerLink} onClick={() => void act(async () => {
          if (!services) return;
          const offline = !navigator.onLine;
          let result;
          try {
            result = await services.pipeline.draftOnDevice(bundle);
            setFallback(false);
          } catch (e) {
            if (!(e instanceof OnDeviceUnavailableError)) throw e;
            result = services.pipeline.draftFromRules(bundle);
            setFallback(true);
          }
          setPlan(null);
          setCheck('');
          setDraft(result.draft); setStepsText(result.draft.stepsToReproduce.join('\n'));
          append(result.log, offline);
          setStep(2);
          setMessage('Draft ready. Review and edit before sharing.');
        })}>Create private draft</button>
      </> : <p>Waiting for a capture. You can <a href="/">choose a demo instead</a>.</p>}
    </section>
    {draft && <section><h2>2. Review your draft</h2><p class="badge">{fallback ? 'Rules-only draft (no on-device AI available)' : 'On-device draft'}</p><label>Barrier type<select value={draft.barrierType} onChange={e => editDraft('barrierType', e.currentTarget.value)}>{BARRIER_TYPES.map(t => <option key={t}>{t}</option>)}</select></label><label>Target element<select value={draft.targetRef ?? ''} onChange={e => editDraft('targetRef', e.currentTarget.value || null)}><option value="">No target</option>{bundle?.facts.elements.map(e => <option key={e.ref} value={e.ref}>{e.ref}: {e.role ?? e.tag}</option>)}</select></label>{(['summary','expected','actual'] as const).map(key => <label key={key}>{key[0].toUpperCase() + key.slice(1)}<textarea maxLength={160} value={draft[key]} onInput={e => editDraft(key, e.currentTarget.value)} /></label>)}<label>Steps to reproduce (one per line)<textarea value={stepsText} onInput={e => { const text = e.currentTarget.value; setStepsText(text); editDraft('stepsToReproduce', text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 5)); }} /></label>{stepsText.split('\n').filter(line => line.trim()).length > 5 && <p role="status">Only the first 5 non-empty steps will be saved. Combine or remove extra steps.</p>}<label>Confidence<select value={draft.confidence} onChange={e => editDraft('confidence', e.currentTarget.value)}>{['low','medium','high'].map(c => <option key={c}>{c}</option>)}</select></label><button disabled={busy} onClick={() => void act(async () => { await selfCheck(); setStep(3); })}>Run self-check</button><p role="status">{check}</p></section>}
    {payload && <section>
      <h2>3. What leaves your device</h2>
      <p>Review what will be sent when you request a cloud fix plan or create a ticket.</p>
      <fieldset><legend>Optional sharing approvals</legend>
        {([['includeEnvironment',`Include coarse browser, OS and settings${environmentFromBrowser ? ' (from this browser)' : ''}`],['includePath','Include page path (without query or fragment)'],['includeVisibleText','Include redacted visible text'],['includeFocusTrail','Include keyboard focus trail']] as const).map(([key, text]) =>
          <label key={key}><input type="checkbox" checked={approvals[key]} onChange={e => {
            const checked = e.currentTarget.checked;
            setApprovals(old => ({ ...old, [key]: checked }));
            setPlan(null);
          }} /> {text}</label>
        )}
      </fieldset>
      <ShareSummary payload={payload} />
      <details><summary>View approved shared JSON</summary><pre class="payload" tabIndex={0} aria-label="Approved shared JSON">{JSON.stringify(payload, null, 2)}</pre></details>
      <button disabled={busy || check !== 'Self-check passed.'} onClick={() => void act(async () => {
        if (!services) return;
        append([{ step: 'redact', ranOn: 'local-code', mode: 'n/a', ms: 0, bytesSentToCloud: 0 }]);
        const sentKey = JSON.stringify(payload);
        const result = await services.pipeline.fixPlanInCloud(payload);
        // Discard a plan generated from an approved payload that changed while the request was in flight.
        if (latestPayloadKey.current !== sentKey) { append(result.log); setMessage('Sharing choices or the draft changed while the plan was generated. Request the fix plan again.'); return; }
        setPlan(result.fixPlan);
        append(result.log);
        setStep(4);
        setMessage(services.demo ? 'Local demo fix plan ready. No cloud inference was used.' : 'Cloud fix plan ready.');
      })}>Get a fix plan</button>
    </section>}
    {plan && payload && <><section><h2>4. Repair guidance</h2><Plan plan={plan} /></section><section><h2>5. Share with the site owner</h2><p>Store the approved payload and fix plan in Firebase. Anyone signed in anonymously who knows the link can read and update this ticket.</p><button disabled={busy || !!ownerLink} onClick={() => void act(async () => { const result = await ticketStore.create(payload, plan, routing); setOwnerLink(result.ownerLink); setStep(5); setMessage('Ticket created. Share the owner link.'); })}>Create shareable ticket</button>{ownerLink && <div><label>Owner link<input readOnly value={ownerLink} /></label><a data-testid="owner-link" href={ownerLink}>Open owner ticket</a><button onClick={() => void act(async () => { await navigator.clipboard.writeText(ownerLink); setMessage('Owner link copied.'); })}>Copy owner link</button></div>}</section></>}
  </>}
  {path.startsWith('/t/') && <><h1>Site owner repair desk</h1>{ticket && <><p class="badge" data-testid="ticket-status">{ticket.status}</p><h2>{ticket.draft.summary}</h2><p>{ticket.site.origin}{ticket.site.path}</p><h3>Steps to reproduce</h3><ol>{ticket.draft.stepsToReproduce.map((s, i) => <li key={i}>{s}</li>)}</ol><h3>Expected</h3><p>{ticket.draft.expected}</p><h3>Actual</h3><p>{ticket.draft.actual}</p>{ticket.fixPlan && <Plan plan={ticket.fixPlan} />}<CopyIssue ticket={ticket} /><section><h2>Reporter environment</h2>{ticket.sharedFacts.environment ? <ul>{environmentWords(ticket.sharedFacts.environment).map(value => <li key={value}>{value}</li>)}</ul> : <p>Environment not shared.</p>}<h3>Assistive technology context</h3>{ticket.sharedFacts.assistive.length ? <ul>{ticket.sharedFacts.assistive.map((value, i) => <li key={i}>{typeof value === 'string' ? value.replaceAll('-', ' ') : 'unrecognized value'}</li>)}</ul> : <p>No assistive context specified.</p>}</section><section><h2>Reply to the reporter</h2><p>Please acknowledge this ticket and mark it fixed after repair. Acknowledge / Mark fixed update the status visible to the reporter in My tickets when they revisit it; no notification or direct message is sent.</p></section><section><h2>Repair status</h2><button disabled={busy || ticket.status !== 'open'} onClick={() => void act(() => changeStatus('acknowledged'))}>Acknowledge</button><button disabled={busy || ticket.status !== 'acknowledged'} onClick={() => void act(() => changeStatus('fixed'))}>Mark fixed</button><p>{verifySource ? 'Demo verification checks a synthetic fixed fixture, not a live website. For a real report, ask the reporter to re-capture the same control after the repair.' : 'Verification uses the reporter\'s re-capture of the repaired page: a scoped rule check on the same control, not WCAG conformance.'}</p><button disabled={busy} onClick={() => void act(async () => { try { await armReturn(ticket.id); setRecaptureStatus('Armed for 30 minutes. Go to the repaired page, focus the same control, and capture with the extension.'); } catch (e) { if (isExtensionMissing(e)) { setRecaptureStatus('Extension not available. Install or enable BarrierRelay in Chrome, reload this page, and try again.'); return; } setRecaptureStatus(`Could not arm re-capture: ${e instanceof Error ? e.message : String(e)} Retry Start reporter re-capture; if it persists, reload this page.`); } })}>Start reporter re-capture</button><p role="status">{recaptureStatus || (params.has('capture') && params.has('ext') ? 'Re-capture received — select Reporter re-capture and Verify fix' : '')}</p><label>Verification source<select id="verify-fixture" value={verifySource} onChange={e => setVerifySource((e.target as HTMLSelectElement).value)}><option value="">Reporter re-capture</option>{cases.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label><button disabled={busy || ticket.status !== 'fixed'} onClick={() => void act(() => verify(verifySource || undefined))}>Verify fix</button>{ticket.verification && <p role="status">Verification {ticket.verification.result}: {ticket.verification.ruleHitsAfter.length} remaining target rule hits.</p>}</section></>}</>}
  {path === '/mine' && <><h1>My tickets</h1>{mine.length ? <ul>{mine.map(t => <li key={t.id}><a href={`/t/${t.id}`}>{t.draft.summary}</a> — {t.status}</li>)}</ul> : <p>No tickets yet.</p>}</>}
  {!['/','/report','/mine'].includes(path) && !path.startsWith('/t/') && <h1>Page not found</h1>}
  </main><Routing rows={routing} /></div><footer>BarrierRelay · Private by design. Repair by collaboration.</footer></>;
}
