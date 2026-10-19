# AI Influencer SaaS — Final Project Brief for Claude Code

**Document purpose:** Product vision, technical direction, validation plan, business assumptions, and implementation priorities for the AI Influencer SaaS project.  
**Prepared:** 18 October 2026  
**Working approach:** Validate in small, measurable steps. Do not assume that a promising prototype is already a production-ready product.

---

## 0. Critical instructions for Claude Code

Before making changes:

1. **Inspect the existing repository and current project state first.**
2. Identify the framework, package manager, existing routes, components, backend, database, environment variables, ComfyUI setup, and any working image-generation workflow.
3. Summarize what already exists and propose the smallest safe next step.
4. **Do not overwrite, delete, or refactor working code unnecessarily.** Preserve the current implementation and make incremental changes.
5. Check the current git status and existing diffs before editing. Do not discard user changes.
6. Do not invent credentials, API keys, model files, endpoints, or capabilities. Use environment variables for secrets and document required setup.
7. Do not claim a feature works until it has been implemented and tested.
8. When something depends on a local model, ComfyUI workflow, cloud GPU, paid API, or external service, clearly label that dependency.
9. Prefer a small, working MVP over a large, unfinished architecture.
10. After each meaningful change, run relevant tests/build/lint checks where available and report what passed, failed, or remains unverified.

**First task:** audit the repository and report the current state. Do not start a broad rewrite before the audit.

---

## 1. Product vision

Build a web-based **AI Influencer Studio** that helps creators, small businesses, e-commerce brands, and marketing agencies create repeatable content using persistent AI personas.

The product should be more than a generic text-to-image page. Its intended value is to help a user create a recognizable virtual character, keep that character consistent across content, and use it for practical marketing and storytelling workflows.

### Intended content types

- Social media ads and short-form campaign creative
- Product-focused marketing images and, later, video
- Lifestyle scenes and virtual-influencer posts
- Vlogs, stories, educational content, and entertainment
- Reusable campaign assets for Instagram Reels, TikTok, YouTube Shorts, and other channels

### Core product promise to validate

> Create a reusable AI persona and produce consistent, useful campaign content without having to manage complex AI workflows.

This is a hypothesis, not a proven market claim. Test whether target users can achieve useful results, whether they will pay, and whether the generation cost leaves a sustainable margin.

### Initial target market

Start with a focused market rather than trying to serve everyone:

1. Small e-commerce businesses that need regular creative variations
2. Small marketing agencies and freelance marketers
3. Businesses in Spain and the wider European market that need repeatable social content

The initial niche may change after interviews and paid pilots. Do not build separate complex products for every customer segment before validating one.

---

## 2. Current state — be precise

The current project has been prototyped locally using ComfyUI on a MacBook Pro with an Apple M5 chip, 16 GB unified memory, and a 1 TB SSD.

### What has been demonstrated so far

- Local text-to-image generation has run on the Mac.
- A tested image was generated at approximately **512 × 768 pixels**.
- The observed generation time was approximately **90 seconds per image** in the tested setup.

These are observations from the current prototype, not guaranteed performance benchmarks for every workflow.

### What has not yet been proven

- Reliable identity consistency across multiple scenes
- Professional-grade, repeatable output quality
- Accurate product representation in generated campaigns
- A robust image-to-video or text-to-video workflow
- Video generation speed and cost
- A production-ready multi-user web application
- Paid customer demand, retention, or profitable unit economics

Earlier attempts at reference conditioning / identity consistency did not yet produce satisfactory results. Video generation has not yet been fully tested. Do not present these features as complete.

### Development hardware

The current MacBook is suitable for initial development, web application work, workflow experiments, and small-scale prototyping. Its 16 GB is unified system memory, not a separate 16 GB NVIDIA GPU VRAM allocation. Large image/video workflows may be slow, memory-constrained, or unsupported.

**Do not recommend buying a new workstation as the first response to performance limitations.** First benchmark a working workflow, then compare local limitations with the cost of renting cloud GPU capacity. Consider new hardware only when measured usage and economics justify it.

---

## 3. Product principles

1. **Persona consistency before feature breadth.** A user should be able to reuse a character reliably.
2. **Useful output before impressive demos.** Prioritize content a business could actually publish.
3. **Measure accepted results, not only generation speed.** Failed generations and retries count toward cost.
4. **One clear workflow at a time.** Do not build a complicated node editor for ordinary users in the first version.
5. **Keep advanced complexity behind the scenes.** ComfyUI can be the workflow engine; the customer-facing UI should be simpler.
6. **Make limitations clear.** Do not promise perfect identity, perfect hands, perfect text, exact product reproduction, or unlimited video.
7. **Build around real usage.** Use the product to create our own marketing assets and record what works and fails.
8. **Use modular integrations.** Models and providers may change; avoid coupling the whole product to one model.
9. **Check commercial licenses before shipping.** A model being downloadable or open source does not automatically mean unrestricted commercial use.
10. **Privacy and consent are core requirements.** Do not allow unauthorized use of real people’s faces or voices.

---

## 4. MVP scope

Build the smallest product that can validate the central promise. The first release should not attempt to reproduce every feature of a mature AI video platform.

### MVP phase A — internal prototype

- One reliable image-generation workflow connected to ComfyUI
- Prompt and basic generation settings
- Generation queue / visible progress and errors
- Output gallery with timestamps and generation metadata
- Save and reuse prompts and settings
- A basic persona profile describing appearance and style
- A documented method for testing whether the persona remains consistent
- Ability to export generated assets

Initially this can be a local/internal tool. Do not add paid subscriptions before the generation path is reliable enough to measure.

### MVP phase B — controlled external pilot

- Simple landing page explaining the value proposition
- User sign-up and authentication
- User-owned projects and persona profiles
- Image generation jobs with status, failure handling, and history
- Credit accounting with clear usage rules
- Safe storage and access control for user assets
- Basic usage and cost monitoring
- Feedback collection and a way to report generation failures
- Admin visibility into job errors and usage
- Clear terms, privacy information, and model/provider disclosures as needed

### MVP phase C — after image workflow validation

- A tested video-generation workflow
- Video job queue and progress states
- Credits reflecting actual video-generation cost
- Output preview and download
- Better persona consistency tools
- Product/reference-image workflow, only after accuracy is tested
- Team/agency features only if pilot customers request and pay for them

### Explicitly out of scope for the first MVP

Unless the repository already contains working pieces, do not start with:

- A fully featured social media scheduler
- Automatic publishing to every social platform
- Complex team permissions
- An elaborate visual node editor
- A large marketplace of models
- A promise of unlimited video generation
- Dozens of half-finished generation modes
- Training custom foundation models from scratch

---

## 5. Recommended technical direction

The exact stack must be based on the repository audit. Do not force a stack change simply because it is fashionable.

### ComfyUI

Use ComfyUI as the initial image-generation/workflow engine where appropriate. Keep workflows versioned and documented. Treat each workflow as a testable configuration with explicit model requirements.

Before selecting a workflow for customer use, record:

- Model and version
- License and commercial-use terms
- Required custom nodes and dependencies
- Input dimensions and settings
- Time per generation
- Peak memory / GPU requirements where available
- Failure rate and retry count
- Visual quality and persona consistency
- Estimated cost per successful, usable result

### Web application

Build the customer-facing experience around the existing repository and working code. Separate the web UI from the generation worker so generation can later move from local execution to a cloud GPU provider without redesigning the entire product.

Potential architectural responsibilities:

- **Frontend:** persona setup, project workspace, prompt form, generation status, gallery, credits, account settings
- **Backend/API:** authentication, project ownership, job creation, usage limits, credit ledger, provider integration
- **Job queue/worker:** dispatch generation jobs, track progress, handle timeouts and failures
- **Storage:** generated assets, reference uploads, workflow metadata, user data
- **Database:** users, projects, personas, jobs, assets, usage and billing records
- **ComfyUI adapter:** submit workflows, monitor job status, retrieve results, normalize errors
- **Provider adapter:** later support cloud GPUs or other generation services without rewriting product logic

This is a target separation of responsibilities, not a command to introduce all these services immediately. Begin with the simplest architecture that the current codebase supports.

### Cloud GPU strategy

Use the local Mac for development and small tests. If video or larger models require more capacity, benchmark a cloud GPU with a fixed test set before committing to a provider.

Track the full cost of a usable result, including:

- GPU runtime
- Model loading and idle time
- Failed runs and retries
- Storage and downloads
- Orchestration / hosting
- Paid third-party APIs, if any
- Support and refunds for failed jobs

Do not equate “open-source model” with “free generation.”

### Security and reliability

- Never expose secret API keys in frontend code.
- Validate file types, file sizes, and upload permissions.
- Ensure one user cannot read another user’s projects or assets.
- Add job timeouts, retry limits, and clear failure states.
- Avoid charging credits for confirmed technical failures; define edge cases explicitly.
- Use rate limits and reasonable generation quotas.
- Keep logs useful but do not log unnecessary sensitive prompts or uploaded personal data.
- Add backups and a documented recovery plan before relying on the service commercially.

---

## 6. Persona consistency and content quality

Persona consistency is a central differentiator and a major technical risk.

### Evaluation protocol

Create a small, repeatable benchmark set for one fictional persona. Generate the same persona in multiple conditions:

- Portrait and full-body
- Indoor and outdoor
- Several camera angles
- Different clothing and poses
- Different lighting conditions
- Lifestyle and product-related scenes

Score each result for:

1. Facial identity similarity
2. Hair, skin, and defining-feature consistency
3. Body and clothing plausibility
4. Hands and anatomy
5. Scene realism
6. Prompt adherence
7. Product accuracy, where applicable
8. Suitability for the intended advertising use

Save the prompt, settings, model version, seed when applicable, output, generation time, and any retry count. Use a fixed benchmark set when comparing workflows.

Do not claim identity consistency is solved merely because a few images look similar. Define an internal acceptance threshold and test it across the whole set.

### Product accuracy

For e-commerce, a visually attractive image is not enough if it changes the product. Test exact product shape, color, packaging, logos, labels, and proportions. If reliable exactness cannot be achieved, describe the workflow honestly and avoid promising exact product replication.

### Video quality

Do not build pricing around video until a real end-to-end test has measured:
- Duration and resolution
- Generation time
- Cost per successful clip
- Retry/failure rate
- Character consistency between frames
- Lip-sync and voice quality, if used
- Whether the clip is commercially usable

---

## 7. Use the product to market the product

We should use the platform ourselves as the first internal customer.

### Internal test campaign

1. Create one original, fictional AI persona with a defined appearance and personality.
2. Use the current workflow to create a small series of campaign images.
3. Once a reliable video workflow is proven, create short promotional videos.
4. Use those assets to promote the product and recruit pilot customers.
5. Record time spent, number of attempts, cost, and which assets are actually published.
6. Track campaign performance: impressions, clicks, landing-page conversion, leads, pilot sign-ups, and paid conversions.
7. Compare generated content with a baseline made using existing tools or conventional production.

This serves two purposes: it tests the product in a real workflow and produces marketing material. However, **our ability to use the product ourselves does not prove that other customers will pay for it**. External interviews and paid pilots remain necessary.

Use fictional or properly consented personas. Do not imply that a fictional AI persona is a real human, or use a real person’s likeness or voice without appropriate authorization.

---

## 8. Positioning and competition

The market already contains capable AI image/video and avatar tools. Competitors such as Higgsfield and HeyGen demonstrate that character creation, AI video, and avatar production are established categories.

Therefore, the product should not rely solely on claims such as “we generate AI influencers” or “we are cheaper.” Those claims are easy to copy and may be difficult to defend.

### Potential differentiation to test

- A simple workflow for repeatable campaign production
- A persistent persona library and reusable brand style
- A workflow aimed at small e-commerce brands and agencies
- A practical campaign process: brief → persona → variations → export
- Transparent credit costs and predictable usage
- A focused Spanish / European customer experience
- Useful output and repeatability rather than a huge collection of tools

These are positioning hypotheses. Test them in customer interviews and pilots.

### Competitor review

Before launch, update a competitor matrix from current public product and pricing pages. Include at least:

- Target customer
- Persona/character consistency
- Image and video capabilities
- Product-reference accuracy
- Workflow simplicity
- Commercial usage rights
- Credit limits and effective price
- Export quality and formats
- Team / agency support
- Known limitations

Do not copy competitor branding, UI, proprietary assets, or claims. Re-check prices before using them in marketing because they change frequently.

---

## 9. Pricing hypothesis

Initial subscription ideas discussed for testing:

| Plan | Proposed price shown to customer | Intended use |
|---|---:|---|
| Starter | €29.99/month | Individual / light use |
| Creator | €69.99/month | Regular content creation |
| Studio | €109.99/month | Higher-volume creator or small studio |

These prices are **unvalidated hypotheses**, not confirmed optimal prices. They were discussed as consumer-facing prices including Spain’s 21% VAT. Revenue calculations below use revenue excluding VAT.

### Pricing rules

- Define credits by generation type and actual cost.
- Avoid “unlimited video” until real usage distribution and cost are known.
- Explain what happens when a generation fails.
- Consider separate credit costs for images, upscaling, and video.
- Track gross margin by plan and by generation type.
- Validate willingness to pay with real pilots, not only surveys.
- Revisit pricing after seeing actual usage and retention.

Do not hard-code credit values across the application. Keep plan limits and credit costs configurable.

---

## 10. Metrics to track from the beginning

### Product quality

- Successful job rate
- Median and 90th-percentile generation time
- Retry count per usable result
- Percentage of outputs accepted by users
- Persona consistency score on the benchmark set
- Video completion and failure rate once video is tested

### Unit economics

- Compute cost per successful output
- Total variable cost per active customer
- Gross margin by plan
- Credit consumption per customer
- Refunds and support time
- Storage and bandwidth cost

### Business

- Landing-page conversion rate
- Trial-to-paid conversion
- Number of paying customers
- Monthly recurring revenue (MRR)
- Monthly churn
- Customer acquisition cost (CAC)
- Average revenue per paying customer
- Customer lifetime value (LTV), only after enough retention data exists
- Payback period for marketing spend

Do not scale paid advertising until the funnel and gross margin are measured. A high number of generated videos or social views is not itself evidence of a profitable business.

---

## 11. Three-year financial scenarios

The figures below are **illustrative planning scenarios**, not forecasts or guarantees. They are included to help make decisions and should be updated using real customer, pricing, and cost data.

### Assumptions

- “Average paying customers” means average across the entire year, not the number at year end.
- Revenue is shown **excluding VAT**.
- Expenses are estimated operating expenses for hosting/compute, software, marketing, and other business costs.
- Operating result is before founder compensation, corporate/personal taxes, financing, and any exceptional costs.
- No assumption is made that growth will happen automatically.
- Founder time may be unpaid in these scenarios; actual economic profitability would be lower if market-rate founder compensation were included.

### Conservative scenario

| Metric | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Average paying customers | 10 | 40 | 100 |
| Average net revenue/customer/month | €30 | €30 | €32 |
| Annual revenue (ex VAT) | €3,600 | €14,400 | €38,400 |
| Estimated operating expenses | €20,000 | €35,000 | €55,000 |
| Operating result | **−€16,400** | **−€20,600** | **−€16,600** |

Interpretation: the business does not reach operating profitability within three years under this set of assumptions. Spending would need to be reduced, pricing or retention improved, or growth accelerated.

### Base scenario

| Metric | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Average paying customers | 25 | 120 | 350 |
| Average net revenue/customer/month | €33 | €35 | €37 |
| Annual revenue (ex VAT) | €9,900 | €50,400 | €155,400 |
| Estimated operating expenses | €30,000 | €65,000 | €130,000 |
| Operating result | **−€20,100** | **−€14,600** | **+€25,400** |

Interpretation: this scenario reaches modest operating profitability in Year 3, before founder compensation and taxes. It requires meaningful acquisition and retention progress.

### Optimistic scenario

| Metric | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Average paying customers | 80 | 300 | 900 |
| Average net revenue/customer/month | €35 | €38 | €40 |
| Annual revenue (ex VAT) | €33,600 | €136,800 | €432,000 |
| Estimated operating expenses | €45,000 | €110,000 | €300,000 |
| Operating result | **−€11,400** | **+€26,800** | **+€132,000** |

Interpretation: this scenario assumes stronger customer acquisition and sufficient operational capacity. It is an upside case, not a default expectation.

### What these scenarios do not tell us yet

The biggest unknowns are:
- How consistently the product can produce usable content
- The actual cost per accepted image/video
- Whether customers will pay the proposed prices
- How often customers return and renew
- How expensive it will be to acquire customers
- How much support and manual intervention customers need

Update the model quarterly, and sooner when pilot data materially changes the assumptions.

---

## 12. Potential company value after three years

A company’s valuation cannot be calculated reliably from an idea alone. Any multiple is illustrative and depends on growth, churn, gross margin, defensibility, revenue quality, profitability, and market conditions.

Examples of end-of-Year-3 annual recurring revenue (ARR) run-rate:

| Illustrative customer count at that point | Average net revenue/customer/month | ARR run-rate |
|---:|---:|---:|
| 100 | €32 | €38,400 |
| 500 | €37 | €222,000 |
| 1,500 | €40 | €720,000 |

If one uses a purely illustrative **2×–4× ARR** range:

| ARR run-rate | 2× ARR | 4× ARR |
|---:|---:|---:|
| €38,400 | €76,800 | €153,600 |
| €222,000 | €444,000 | €888,000 |
| €720,000 | €1,440,000 | €2,880,000 |

This is a scenario exercise, not a promise of market value. A small SaaS business with high churn, low margins, weak growth, or heavy founder dependence may receive a lower multiple or may not attract a buyer at all. Company valuation is also not the same as cash available to the founder.

---

## 13. Legal, safety, and trust requirements

Before accepting paying customers, review requirements with appropriate professional advice for the intended jurisdictions and use cases.

- **Model licenses:** document commercial-use rights for every shipped model and dependency.
- **Face and voice consent:** require appropriate rights/consent for identifiable real people and their likenesses or voices.
- **Privacy / GDPR:** minimize personal data, secure uploads, provide appropriate privacy information, and define retention/deletion procedures.
- **AI transparency:** review applicable EU AI Act transparency requirements, including rules that may apply to AI-generated or manipulated content and deepfakes. Do not assume every output has identical disclosure obligations; applicability depends on the content and use case.
- **Advertising rules:** ensure customers do not use generated content for deceptive claims or misleading product depictions.
- **Copyright / trademarks:** do not promise that every generated output is free of third-party rights issues.
- **User terms:** explain permitted use, prohibited use, content ownership/licensing, credit handling, failed jobs, refunds, and account termination.
- **Security:** protect private uploads and generated content from other users.
- **Abuse prevention:** define reporting and response processes for non-consensual or deceptive likeness use.

Potential official reference for EU AI Act transparency:  
https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50  
European Commission FAQ:  
https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50

Verify the current legal text and applicability before launch; this brief is not legal advice.

---

## 14. 90-day validation roadmap

### Days 1–30: prove the generation workflow

- Audit the existing codebase and preserve working parts.
- Document the current ComfyUI installation and working workflow.
- Build a repeatable benchmark for one fictional persona.
- Compare a small number of candidate workflows/models.
- Measure time, failure rate, retries, quality, and cost.
- Confirm the commercial license for the selected model and required nodes.
- Produce a small set of real internal marketing assets.
- Do not add complex billing or video promises before the image workflow is understood.

**Exit gate:** one documented workflow produces a repeatable, useful set of images with measured performance and known limitations.

### Days 31–60: validate the customer problem

- Publish a simple landing page and clear demo.
- Prepare a short demo showing the actual workflow and its current limitations.
- Contact 30–50 relevant potential customers in Spain / Europe.
- Interview small e-commerce businesses, creators, and agencies.
- Offer a limited pilot with clearly defined deliverables.
- Ask for payment where appropriate; compliments and sign-ups alone are weak evidence.
- Track which outputs customers actually use and what they would pay to repeat.

**Exit gate:** evidence from real target customers that the workflow solves a recurring problem and at least some are willing to pay.

### Days 61–90: ship a narrow MVP

- Add authentication and user-owned projects if not already present.
- Add generation job status, history, and clear error handling.
- Implement configurable credits and usage accounting.
- Add secure asset storage and basic admin monitoring.
- Measure cost per accepted output and gross margin.
- Test video separately before selling it as a feature.
- Review privacy, model license, terms, and AI-transparency obligations.
- Decide whether to continue, narrow the niche, change the workflow, or pause.

**Exit gate:** a small number of external users can complete the core workflow reliably, and the team understands the cost of serving them.

The milestones are goals, not guaranteed outcomes. If a gate fails, fix the underlying issue rather than moving forward just to meet the calendar.

---

## 15. Immediate next steps for Claude Code

Perform these in order, based on the actual repository:

1. **Repository audit**
   - Identify stack, routes, core components, scripts, dependencies, tests, and current git status.
   - Identify any existing ComfyUI workflow integration or generated output path.
   - Report working features, broken features, and unknowns.
2. **Safe local run**
   - Explain how to run the current app and how to verify it.
   - Fix only clear blockers, keeping changes minimal.
3. **Generation integration proof**
   - If the repository is ready, create a minimal, isolated ComfyUI integration proof.
   - Do not build a full SaaS abstraction before a real job can be submitted, completed, and retrieved.
4. **Workflow measurement**
   - Add or document basic measurements for generation duration, status, errors, and retries.
5. **Persona benchmark**
   - Establish a repeatable set of prompts and an output-review process.
6. **Only then expand**
   - Implement the next smallest MVP feature based on the results and current repository architecture.

At each stage, return:
- What you inspected
- What you changed
- Why the change was necessary
- Files changed
- Commands/tests run and their results
- Remaining limitations
- The single recommended next step

---

## 16. Final strategic recommendation

Proceed, but treat this as a measured product experiment rather than assuming the business is already validated.

The most important sequence is:

1. Prove that a persona can be reused with acceptable consistency.
2. Prove that generated assets are useful in real marketing work.
3. Measure the cost of an accepted result.
4. Get feedback and paid pilot evidence from external customers.
5. Build subscriptions and scale only when quality, demand, and unit economics support them.

Use the platform internally to create and test its own marketing assets, but do not mistake internal usage for market validation. Keep the current Mac for development, use cloud GPU capacity only when benchmarks justify it, and avoid large hardware or infrastructure commitments until real usage supports them.

**The goal of the first 90 days is not to build the biggest possible AI platform. It is to find out, with evidence, whether we can build a reliable product that customers will pay for and that can serve them at a sustainable cost.**
