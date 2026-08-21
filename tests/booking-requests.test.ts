import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeEmail,normalizePhone,validatePublicBooking } from "../app/lib/booking-request-rules";

const now=Date.parse("2026-08-13T12:00:00Z");
const valid={name:"Maria Silva",companyName:"Eventos MS",phone:"(11) 99999-9999",email:"MARIA@EXAMPLE.COM",eventDate:"2026-09-20",city:"Campinas",state:"sp",venue:"Arena",eventType:"Festival",estimatedAudience:"3500",budget:"R$ 80 mil",notes:"Evento corporativo",submittedAt:now-3000,website:""};

test("valida e normaliza solicitação pública",()=>{const result=validatePublicBooking(valid,now);assert.equal(result.email,"maria@example.com");assert.equal(result.state,"SP");assert.equal(result.estimatedAudience,3500);assert.equal(normalizePhone(result.phone),"11999999999")});
test("proteções rejeitam honeypot, envio rápido e dados inválidos",()=>{assert.throws(()=>validatePublicBooking({...valid,website:"spam"},now));assert.throws(()=>validatePublicBooking({...valid,submittedAt:now-500},now),/Atualize/);assert.throws(()=>validatePublicBooking({...valid,email:"inválido"},now),/e-mail/);assert.throws(()=>validatePublicBooking({...valid,eventDate:"2025-01-01"},now),/data/)});
test("deduplicação usa e-mail e telefone normalizados",()=>{assert.equal(normalizeEmail(" Maria@Example.COM "),"maria@example.com");assert.equal(normalizePhone("+55 (11) 99999-9999"),"5511999999999")});
test("migration garante tenant em cliente, artista e responsável",async()=>{const sql=await readFile(new URL("../drizzle/0005_sweet_plazm.sql",import.meta.url),"utf8");assert.match(sql,/FOREIGN KEY \(`customer_id`,`organization_id`\)/);assert.match(sql,/FOREIGN KEY \(`artist_id`,`organization_id`\)/);assert.match(sql,/FOREIGN KEY \(`organization_id`,`assigned_to`\)/);assert.match(sql,/idx_customers_organization_email/);assert.match(sql,/idx_customers_organization_phone/)});
test("fluxo público atribui responsável e registra origem",async()=>{const route=await readFile(new URL("../app/api/public/catalog/[organizationSlug]/[artistSlug]/requests/route.ts",import.meta.url),"utf8");assert.match(route,/getArtistPrimaryCommercial/);assert.match(route,/PUBLIC_CATALOG|DEFAULT 'PUBLIC_CATALOG'/);assert.match(route,/public_request_attempts/);assert.match(route,/organization\.slug=\?/);assert.match(route,/artist\.slug=\?/)});
test("inbox legado continua lendo oportunidades com escopo da organização e do SALES",async()=>{const route=await readFile(new URL("../app/api/booking-requests/route.ts",import.meta.url),"utf8");assert.match(route,/opportunity\.organization_id=\?/);assert.match(route,/opportunity\.assigned_user_id=\?/);assert.match(route,/context\.membership\.role==="SALES"/)});
