import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const app=await readFile(new URL("../src/App.tsx",import.meta.url),"utf8");
const page=await readFile(new URL("../src/pages/alerts.tsx",import.meta.url),"utf8");
const shell=await readFile(new URL("../src/components/app-shell.tsx",import.meta.url),"utf8");
test("alerts console is protected and discoverable in aviation navigation",()=>{assert.match(app,/dashboard\/alerts/);assert.match(app,/ProtectedRoute><AlertsPage/);assert.match(shell,/Alerts & Scans/);});
test("alerts UI covers unread, empty, error, preferences, unsubscribe, custom scans, costs, limits, and run history",()=>{for(const text of ["Unread alerts","Radar is quiet","Alerts unavailable","Briefing preferences","Email notifications","Custom scanner profiles","Pilot Credits","Recent scan runs","approved sources"])assert.match(page,new RegExp(text,"i"));});
test("custom scan upgrade and sponsor-control boundaries remain visible",()=>{assert.match(page,/Ace Pilot or Squadron required/);assert.match(page,/never enter promotions/);assert.match(page,/Verify sponsor rules/);});
