# Persona Studio (AI Influencer platform)

Web platforma, kurā izveido atkārtoti lietojamu AI personu un ģenerē to dažādās ainās, ar vērtēšanu un izmaksu uzskaiti.
Produkta brīfs: [`docs/BRIEF.md`](docs/BRIEF.md).

## Kā tas ir uzbūvēts

```
 Pārlūks ──► Next.js app ──► Supabase (auth, Postgres + RLS, Storage, Realtime)
                                  ▲
                                  │ paņem rindā esošos darbus, augšupielādē rezultātus
                            worker (npm run worker)
                              ├─► ComfyUI Desktop uz tava Mac  (bezmaksas, lokāli)
                              └─► fal.ai API                    (maksas, mākonis)
```

- **Web app** (`src/`) nekad pati neģenerē attēlus. Tā tikai izveido darbu datubāzē (`enqueue_job`) un noņem kredītus.
- **Worker** (`worker/`) darbojas blakus ComfyUI. Tas paņem darbu, palaiž workflow, augšupielādē attēlu privātajā `outputs` bucket un saglabā laiku, mēģinājumus un izmaksas.
- Ja darbs tehniski neizdodas, kredīti atgriežas automātiski. Ar `PermanentError` (nepareizs workflow, trūkst modeļa) netiek mēģināts atkārtoti.
- Visas tabulas un faili ir aizsargāti ar Row Level Security: lietotājs redz tikai savus datus. Tas ir pārbaudīts testos.

## Palaišana (pirmo reizi)

### 1. Supabase projekts
1. Izveido projektu (free plāns ir pietiekams izstrādei).
2. **SQL Editor** → ielīmē un palaid `supabase/migrations/20261019000000_init.sql`.
   (Vai ar CLI: `supabase link` un tad `supabase db push`.)
3. **Authentication → URL Configuration**: Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/auth/callback`.

### 2. Vides mainīgie
```bash
cp .env.example .env.local
# aizpildi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 3. Web app
```bash
npm install
npm run dev        # http://localhost:3000
```

### 4. ComfyUI + worker (uz Mac)
1. Atver **ComfyUI Desktop**. Tam jābūt vismaz vienam modelim `models/checkpoints`.
2. Otrā terminālī:
```bash
npm run worker:check   # pārbauda Supabase un ComfyUI savienojumu, parāda modeļus
npm run worker         # sāk apstrādāt darbus
```
Ja ComfyUI ir uz cita porta (portable versija bieži izmanto 8188), nomaini `COMFYUI_URL`.

### 4b. Cloudflare Workers AI (bezmaksas teksti un ātri attēli)
1. dash.cloudflare.com → **Workers AI** → **Use REST API**: nokopē **Account ID** un izveido **API token** (Workers AI tiesības).
2. Ieliec `.env.local`: `CLOUDFLARE_ACCOUNT_ID=…`, `CLOUDFLARE_API_TOKEN=…`, `WORKER_PROVIDERS=comfyui,cloudflare`.
3. Restartē `npm run dev` un `npm run worker`.
Bezmaksas kvota: 10 000 "neuronu" dienā, tas ir ~150 FLUX schnell attēli vai simtiem personas tekstu.

### 5. Admin (pēc izvēles)
Lai redzētu visu lietotāju darbus un iegūtu Business limitus testēšanai, SQL Editor:
`update profiles set role='admin', plan_id='business' where id = (select id from auth.users where email = 'tavs@epasts');`

## Workflows

| ID | Kur | Ko dara | Godīgs ierobežojums |
|---|---|---|---|
| `cf_klein_ref` | Cloudflare | **Tā pati seja jaunā ainā**: FLUX.2 klein ar līdz 4 atsauces bildēm | ~$0,016 par bildi, 2 kredīti |
| `cf_klein_text` | Cloudflare | Dabisks foto no apraksta (FLUX.2) | ~$0,015, 2 kredīti |
| `cf_flux_schnell` | Cloudflare | Ātrā skice (FLUX.1 schnell) | tikai kvadrāts, mazāk dabisks; ~$0,0006 |
| `txt2img_basic` | ComfyUI | Teksts → attēls ar jebkuru SD1.5/SDXL modeli | Seja tiek noturēta tikai ar aprakstu. Konsekvence vāja. |
| `img2img_reference` | ComfyUI | Sāk no personas galvenās foto | Notur kompozīciju un krāsas, **ne** uzticamu sejas līdzību |
| `fal_flux_dev` | fal.ai | FLUX dev teksts → attēls | Maksas; cenu pārbaudi fal.ai |
| `fal_instant_character` | fal.ai | Notur seju no 1 atsauces attēla | ~$0.10/MP (pēc fal.ai datiem, okt. 2026) |

**Savs ComfyUI workflow:** ComfyUI → Workflow → *Export (API)* → saglabā kā `worker/workflows/comfyui/<nosaukums>.json`,
aizstāj vērtības ar `{{prompt}}`, `{{negative}}`, `{{seed}}`, `{{width}}`, `{{height}}`, `{{steps}}`, `{{cfg}}`, `{{checkpoint}}`,
`{{reference_image}}`, `{{reference_strength}}` un pievieno ierakstu `src/lib/catalog.ts`.
Piemēram, IP-Adapter/PuLID workflow ar `{{reference_image}}` dod daudz labāku sejas konsekvenci, bet prasa custom nodes.

## Plāni (hipotēze)
| Plāns | Cena ar PVN | Personāži | Kredīti/mēn |
|---|---|---|---|
| Free | €0 | 1 | 30 reģistrējoties |
| Starter | €29,99 | 1 | 400 |
| Pro | €69,99 | 5 | 1 200 |
| Business | €109,99 | 10 | 1 800 |

Personāžu limitu nodrošina datubāzes trigeris. Kredītus noņem `enqueue_job` (attēli) un `spend_credits` (AI teksti), un tehniskas kļūdas gadījumā tos atgriež.
Papildu pakas ir tabulā `credit_packs`.

### Kā kredīti strādā (kā Claude limiti)
- **Mēneša kredīti:** perioda sākumā plāns piešķir `monthly_credits` (`plan_credits:<plāns>`). Tos tērē pirmos, un neizlietotie perioda beigās sadeg (`plan_expire`).
- **Papildu kredīti:** reģistrācijas bonuss, nopirktās pakas (`pack:<id>`) un admin piešķirtie kredīti. Tie paliek, līdz tos izlieto.
- Admin piešķirtam plānam (`plan_status = manual`) worker pats atjauno periodu ik mēnesi (`renew_due_plans`). Stripe plānu atjauno `invoice.paid` webhook.
- Klients visu redz lapā **Plan & credits** (`/app/billing`): plānu, atjaunošanas datumu, mēneša un papildu kredītus un pilnu vēsturi.

## Stripe maksājumi (testa režīmā)
1. Izveido kontu [dashboard.stripe.com](https://dashboard.stripe.com) un atstāj ieslēgtu **Test mode**.
2. Atver Developers → API keys un iekopē **Secret key** (`sk_test_…`) savā `.env.local` kā `STRIPE_SECRET_KEY`. Čatā to nesūti.
3. Webhook lokāli: `brew install stripe/stripe-cli/stripe`, `stripe login`, pēc tam
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Nokopē izdrukāto `whsec_…` uz `.env.local` kā `STRIPE_WEBHOOK_SECRET` un pārstartē `npm run dev`. `stripe listen` atstāj atvērtu atsevišķā terminālī.
4. Stripe produktus nav jāveido ar roku. Plāna cena tiek izveidota pirmajā pirkumā (lookup key `persona_<plāns>_<centi>_eur_month`), un pakām cena tiek padota maksājuma brīdī.
5. Klienta portālam (kartes maiņa, rēķini, atcelšana) vienreiz atver Settings → Billing → Customer portal un spied **Save**.
6. Testa karte: `4242 4242 4242 4242`, jebkurš nākotnes datums, jebkurš CVC.

Apstrādātie notikumi ir `checkout.session.completed`, `invoice.paid` (`subscription_cycle`), `customer.subscription.updated` un `customer.subscription.deleted`. Katrs tiek apstrādāts tikai vienreiz (tabula `billing_events`).

## Digitālais dvīnis
Personas → New → **Make one of me**: klients augšupielādē 1–4 savas bildes un apstiprina trīs punktus (bildes ir viņa, ir 18+, marķēs saturu kā AI).
Piekrišana tiek saglabāta tabulā `likeness_consents`. Dvīnis ir pieejams tikai maksas plāniem (`plans.allow_twin`), viens katram kontam (DB trigeris).

## Reālisma slānis
Katram foto promptam automātiski pievieno `REALISM` un `REALISM_AVOID` (`src/lib/catalog.ts`). Studio → Advanced to var izslēgt.

## Kredīti un cenas
Cenas un kredīti dzīvo datubāzē, ne kodā: tabulas `generation_costs`, `plans`, `app_settings` (`signup_bonus_credits`).
Plānu cenas ir **nevalidētas hipotēzes** no brīfa.

## Konsekvences benchmark
Personas lapā: *Run 12-scene benchmark*. Tas ģenerē 12 fiksētas ainas ar fiksētiem seed. Kontaktlapā katru kadru novērtē 1–5 pēc 8 kritērijiem.
Vidējie rezultāti katram workflow parādās personas lapā, un tā var godīgi salīdzināt modeļus.
Metrikas (veiksmes %, mediānais/p90 laiks, atkārtojumi, akceptētie %, cena par akceptētu kadru) ir sadaļā *Jobs & metrics*.

## Testi
```bash
npm test            # DB migrācija + kredīti + RLS (PGlite) un worker pret ComfyUI imitāciju
npm run typecheck
npm run lint
npm run build
```

## Kas vēl NAV gatavs (apzināti)
- Stripe produkcijas režīms: PVN pēc klienta valsts (Stripe Tax), rēķinu rekvizīti uzņēmumiem, produkcijas webhook pēc hostinga.
- Video ģenerēšana. Vispirms jāizmēra cena par derīgu klipu.
- Sejas konsekvence ar LoRA treniņu (fal `flux-lora-fast-training`) vai IP-Adapter/PuLID ComfyUI workflow.
- Hostings (Cloudflare) un e-pasta veidnes.
