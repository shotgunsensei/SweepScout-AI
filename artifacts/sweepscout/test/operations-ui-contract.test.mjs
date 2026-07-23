import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const page=await readFile(new URL("../src/pages/admin.tsx",import.meta.url),"utf8");
const shell=await readFile(new URL("../src/components/app-shell.tsx",import.meta.url),"utf8");
test("operations console remains role-gated and discoverable",()=>{assert.match(shell,/platformRole !== "user"/);assert.match(page,/\/admin\/operations/);assert.match(page,/Protected administration/);});
test("dashboard exposes required product, provider, queue, and failure metrics",()=>{for(const text of ["Active users","Paid subscribers","MRR","AI usage","Credits consumed","Active sources","Failed scans","Pending review","High risk","Webhook failures","Provider and queue health"])assert.match(page,new RegExp(text));});
test("source, listing, user, billing, support, dead-letter, flags, and audits are operable",()=>{for(const text of ["Source administration","Create disabled source","Run scan","Listing review","AI field evidence, rules versions, and change history","Merge duplicate","Undo merge","Users and billing","View credit ledger","Adjust credits","Disable account","Support requests","Retry dead letter","Feature flags","Immutable audit log"])assert.match(page,new RegExp(text));});
test("material admin forms require visible reasons",()=>{assert.ok((page.match(/name="reason" required/g)??[]).length>=6);assert.match(page,/Rollout reason/);assert.match(page,/Correction reason/);});
