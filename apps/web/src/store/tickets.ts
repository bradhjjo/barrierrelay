import { getToken } from 'firebase/app-check';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import type { Ticket, TicketStatus } from '@barrierrelay/shared/src/schema';
import type { TicketStore } from '../contracts';
import { appCheck, authReady, firestore } from '../firebase';
const tickets = collection(firestore, 'tickets');
export const ticketStore: TicketStore = {
  async create(payload, fixPlan, routing) {
    const user = await authReady;
    await getToken(appCheck);
    const ref = doc(tickets);
    const ticket: Ticket = { id: ref.id, reporterUid: user.uid, createdAt: new Date().toISOString(), status: 'open', site: payload.site, draft: payload.draft, sharedFacts: payload.sharedFacts, fixPlan, routing };
    await setDoc(ref, ticket);
    return { id: ref.id, ownerLink: `${location.origin}/t/${ref.id}` };
  },
  async get(id) { await authReady; const snapshot = await getDoc(doc(tickets, id)); return snapshot.exists() ? snapshot.data() as Ticket : null; },
  async listMine() { const user = await authReady; return (await getDocs(query(tickets, where('reporterUid', '==', user.uid)))).docs.map(row => row.data() as Ticket).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
  async setStatus(id, status) { await authReady; await updateDoc(doc(tickets, id), { status }); },
  async addVerification(id, result, ruleHitsAfter) {
    await authReady;
    await runTransaction(firestore, async tx => {
      const ref = doc(tickets, id);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists() || snapshot.data().status !== 'fixed') throw new Error('Mark the ticket fixed before verifying.');
      const status: TicketStatus = result === 'pass' ? 'verified' : 'open';
      tx.update(ref, { status, verification: { at: new Date().toISOString(), result, ruleHitsAfter } });
    });
  },
};
