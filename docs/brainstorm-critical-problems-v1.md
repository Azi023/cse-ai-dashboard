# Module 1: AI-Powered Shariah-Compliant CSE Intelligence Platform
## Critical Problems Analysis & Solutions — Brainstorming Document v1

**Date:** March 6, 2026  
**Approach:** Option C (Intelligence Layer) + Option A (Shariah Screener) Hybrid  
**Status:** Pre-Architecture Brainstorming

---

## EXECUTIVE SUMMARY

Before we write a single line of code or pick a tech stack, five critical problems can kill this product. This document attacks each one with research, multi-perspective analysis, and proposed solutions.

---

## CRITICAL PROBLEM #1: DATA ACCESS (CSE Data Pipeline)

### The Problem
The Colombo Stock Exchange does not offer an official public API for developers. Without reliable data, there is no product.

### What We Found

**Option A — Reverse-Engineered CSE Web API (FREE)**
A GitHub repository by GH0STH4CKER documents unofficial CSE API endpoints that power the cse.lk website. These include:
- `companyInfoSummery` — real-time price, market cap, change %
- `tradeSummary` — all traded stocks with prices
- `dailyMarketSummery` — market-wide volume and turnover
- `detailedTrades` — granular trade-level data
- `allSectors` — sector indices (S&P/CSE indices)
- `chartData` — historical price data per symbol

All endpoints use POST requests to `https://www.cse.lk/api/`. This is essentially the same data that powers the CSE website itself.

**Option B — ICE Consolidated Feed (PAID, ENTERPRISE)**
ICE (Intercontinental Exchange) offers official CSE data feeds including Level 1 market pricing and end-of-day data. Available via ICE Connect Desktop, ICE XL (spreadsheet), and APIs. This is enterprise-grade but likely expensive and designed for institutional clients.

**Option C — Third-Party Data Providers**
- EOD Historical Data (eodhd.com) lists CM exchange data for CSE
- Marketaux provides news data for 302 CSE financial entities
- TradingView/TradingEconomics have CSE index data

**Option D — Direct CSE Partnership**
The CSE has been actively digitalizing (CDS e-Connect, mobile app). A formal data partnership would give you legitimate, reliable access and potentially preferential treatment as a platform that helps grow their retail investor base (aligned with CSE's goals).

### The Multi-Perspective Debate

**Builder says:** "Start with Option A (reverse-engineered API) for the MVP. It's free, it gives us real-time data, and Stockflow almost certainly uses the same approach. We can validate the product without spending on data licenses."

**Skeptic says:** "Reverse-engineered APIs break without warning. CSE changes their website, your entire product goes down. You're building a financial product on an unofficial, undocumented API with zero SLA. That's reckless."

**Investor says:** "Use Option A to build and validate the MVP, but simultaneously pursue Option D (CSE partnership). Your pitch to CSE is compelling: 'We're trying to bring millions of new retail investors to YOUR exchange.' That's aligned with their stated digitalization goals. They WANT more CDS accounts. You're offering to do their user acquisition for free."

### RECOMMENDED APPROACH

**Phase 1 (MVP, Months 1-4):** Use the reverse-engineered API with a robust abstraction layer. Build a data service that wraps these endpoints so that if/when they change, you only fix one module. Cache aggressively with Redis (market data updates every few seconds during trading hours, but you don't need sub-second updates for an intelligence platform). Store historical data in PostgreSQL so you build your own historical database over time.

**Phase 2 (Months 3-6, parallel):** Approach CSE for a formal data partnership. Your value proposition: "We've built a platform with X thousand users who are learning about the stock market through our tool. We want to do this properly with official data access." Come to the table with user traction, not just a pitch deck.

**Phase 3 (Months 6+):** Consider supplementary data from EOD Historical Data or similar for international market comparisons (useful if you expand beyond CSE).

### Technical Architecture for Data Pipeline

```
CSE Website API (unofficial) ──► Data Ingestion Service (Node.js/Python)
                                        │
                                        ▼
                                  Redis Cache (hot data: current prices, today's trades)
                                        │
                                        ▼
                                  PostgreSQL (cold data: historical prices, financials, dividends)
                                        │
                                        ▼
                                  Shariah Screening Engine (applies SEC methodology)
                                        │
                                        ▼
                                  AI Intelligence Layer (Claude API / RAG pipeline)
                                        │
                                        ▼
                                  Frontend Dashboard (Next.js)
```

### Key Risk: Annual Reports & Financial Statements
Price data is only half the story. Your AI needs to read and analyze company financial statements (balance sheets, income statements, cash flows) for both investment intelligence AND Shariah screening (debt ratios, interest income %). These are published as PDFs on the CSE website. You'll need a document ingestion pipeline:
1. Scrape/download quarterly and annual reports from CSE
2. Parse PDFs (use tools like `pdf-parse` or `pdfplumber`)
3. Extract structured financial data
4. Feed into both the Shariah screening engine and the AI analysis layer

This is a significant engineering effort but becomes a major data moat once built.

---

## CRITICAL PROBLEM #2: REGULATORY CLASSIFICATION

### The Problem
At what point does your AI cross from "information provider" to "investment advisor"? The SEC Sri Lanka regulates investment advisors, and getting this wrong could mean operating illegally.

### What We Found

The SEC Sri Lanka (under Act No. 19 of 2021) regulates several categories of market intermediaries:
- **Stock Brokers** — licensed to execute trades (NOT what you're doing)
- **Investment Managers** — registered to manage client portfolios (NOT what you're doing)
- **Corporate Finance Advisors** — licensed to advise on listings, takeovers, etc. (NOT what you're doing)
- **Registered Investment Advisors (RIAs)** — registered to advise clients on buying/selling securities

The critical question: Does providing AI-generated analysis and Shariah screening constitute "advising clients on sale or purchase of securities"?

The SEC's Capital Market Education arm offers a Certificate in Capital Markets (CCM) as a prerequisite for becoming an RIA. This suggests that investment advisory is a regulated, licensed activity.

### The Multi-Perspective Debate

**Builder says:** "We're an information platform, not an advisor. We present data, analysis, and Shariah compliance status. We never say 'buy this' or 'sell that.' The user makes their own decisions. Bloomberg provides analysis. SimplyWall.St provides analysis. Neither is registered as an investment advisor in every jurisdiction they operate in."

**Skeptic says:** "The line between 'analysis' and 'advice' is legally blurry. If your AI says 'Stock X has strong fundamentals, low debt, and is Shariah-compliant' — how is a retail investor supposed to interpret that as anything OTHER than a buy recommendation? When that user loses money, their lawyer will argue your platform gave advice. The SEC could agree."

**Investor says:** "The regulatory risk is real but manageable. The solution is product design, not avoidance. Frame everything as educational content and analysis, never as recommendations. Include disclaimers, but more importantly, design the UX so the AI explicitly states 'This is analysis, not advice. Consult a registered investment advisor before making decisions.' Many fintech platforms globally operate in this gray area successfully."

### RECOMMENDED APPROACH

**1. Classify yourself as an Information/Education platform, NOT an advisory platform.**
Your product provides:
- Market data and analysis (educational)
- Shariah compliance screening (religious/ethical filtering)
- AI-generated explanations of financial concepts (educational)
- Portfolio tracking and alerts (informational)

Your product does NOT provide:
- Buy/sell recommendations
- Personalized investment advice
- Portfolio management services
- Trade execution

**2. Design the AI's language carefully.**
Instead of: "LOLC looks like a strong buy based on its P/E ratio."
Use: "LOLC's P/E ratio of 8.5x is below the sector average of 12.3x. Here's what P/E ratio means and why some investors consider this metric important..."

The AI should EDUCATE, not DIRECT. It explains what metrics mean, how to interpret them, and what different investment philosophies would say. It doesn't tell you what to do.

**3. Engage a securities lawyer early.**
Before launch, get a formal legal opinion from a Sri Lankan securities law firm on your product classification. This costs LKR 50,000-200,000 but saves you from a potential SEC enforcement action. Some firms to consider: Julius & Creasy, Nithya Partners, F J & G de Saram.

**4. Consider voluntary SEC engagement.**
The SEC's stated mission includes "encouraging and promoting the development of securities markets in Sri Lanka including research and training." Your platform aligns with this mission. A proactive conversation with the SEC — "here's what we're building, here's how it helps grow retail participation, here's how we're ensuring we stay within regulatory boundaries" — can get you informal guidance and potentially a regulatory ally.

**5. Build a "Regulatory Compliance" module into the product.**
Every AI response includes: a clear disclaimer, the date/time of the analysis, a note that this is not personalized advice, and a suggestion to consult a registered advisor. This isn't just legal protection — it's trust-building with users.

---

## CRITICAL PROBLEM #3: SHARIAH CREDIBILITY

### The Problem
If you claim Shariah compliance, the Muslim community (and Islamic finance institutions) will demand proof. Self-certification won't cut it.

### What We Found

**Sri Lanka's Existing Shariah Infrastructure:**
- The SEC has published a formal Shariah Compliant Securities Screening Methodology
- Lanka Securities (LSL) maintains a Shariah-compliant securities list for the CSE, designed based on industry best practices and AAOIFI guidance
- The screening methodology includes both business screens (prohibited activities) and financial screens (debt ratios, interest income thresholds)
- Several Islamic Financial Institutions (IFIs) in Sri Lanka have established Shariah Supervisory Boards (SSBs) — research shows that IFIs like Amana Bank have both external SSBs (Shariah Advisory Councils) and internal Shariah departments
- Senfin Asset Management runs the Senfin Shariah Balanced Fund with its own Shariah oversight
- CAL just launched an Islamic Money Market Fund (March 2026)

**Global Standards:**
- AAOIFI (Accounting and Auditing Organization for Islamic Financial Institutions) is considered the gold standard
- AAOIFI's Governance Standard No. 1 requires every IFI to have a Shariah Supervisory Board
- AAOIFI offers the CSAA (Certified Shariah Adviser and Auditor) qualification — costs USD 800 for developing markets
- Islamicly.com provides Shariah screening for 30,000+ global stocks including Sri Lankan stocks — they have 20+ years of screening experience
- Ethica Institute offers AAOIFI-recognized Islamic finance certifications

### The Multi-Perspective Debate

**Builder says:** "We can implement the SEC's published screening methodology programmatically. The business screens and financial ratio thresholds are clearly defined. We automate what Lanka Securities does manually with their PDF list."

**Skeptic says:** "Automating the methodology is necessary but not sufficient. Who CERTIFIES that your automation is correct? If your algorithm incorrectly labels a haram stock as halal and someone invests based on that, you have a religious AND legal liability. The Muslim community is (rightly) skeptical of tech platforms claiming Shariah compliance without scholarly oversight."

**Investor says:** "Shariah credibility is your competitive moat. Invest in it properly. The cost of a Shariah advisory arrangement is tiny compared to the credibility it provides. And it's a feature your competitors (Stockflow, generic brokers) simply cannot replicate quickly."

### RECOMMENDED APPROACH

**Tiered credibility strategy:**

**Tier 1 — MVP Launch (LOW COST):**
- Implement the SEC's published screening methodology programmatically
- Clearly state on the platform: "Screening based on SEC Sri Lanka's published Shariah Compliant Securities Screening Methodology"
- Cross-reference your results against Lanka Securities' published Shariah list as validation
- Cross-reference against Islamicly.com's screening of Sri Lankan stocks
- Disclaimer: "This screening is algorithmic and based on publicly available methodologies. Users should consult qualified Shariah scholars for personal guidance."

**Tier 2 — Post-Validation (MODERATE COST):**
- Engage 2-3 recognized Shariah scholars in Sri Lanka as a Shariah Advisory Board
- Amana Bank and other Sri Lankan IFIs have existing relationships with scholars — you could potentially engage some of the same scholars
- Have them formally review and certify your screening methodology and algorithm
- This gives you: "Shariah screening certified by [Scholar Names], following AAOIFI standards"
- Cost estimate: LKR 200,000 - 500,000/year for advisory arrangements

**Tier 3 — Scale (HIGHER COST):**
- Pursue AAOIFI compliance certification for your platform
- Partner with established Shariah screening providers (like Islamicly or IdealRatings) for secondary validation
- This opens doors to institutional Islamic finance investors and international expansion

**The Purification Calculator — A Killer Feature:**
One thing that most platforms miss: even Shariah-compliant stocks may have minor impermissible income that investors need to "purify" (donate to charity). The SEC's methodology includes purification ratio formulas. Building an automatic purification calculator that tells users "Based on your portfolio of X shares in Company Y, your purification amount this quarter is LKR Z" is:
1. Genuinely useful to Muslim investors
2. A feature no competitor offers
3. A strong signal of Shariah credibility (you're not just screening, you're helping with the complete compliance lifecycle)

---

## CRITICAL PROBLEM #4: LIABILITY & AI GUARDRAILS

### The Problem
Your AI says something that leads to a financial loss. What's your legal exposure?

### The Reality Check

This is not hypothetical. You said it yourself: "when someone goes broke by a misinterpretation then it's a big burden for us." This is the single most important product design challenge.

### The Multi-Perspective Debate

**Builder says:** "Disclaimers solve this. Every financial platform has them. 'Past performance is not indicative of future results. This is not financial advice.' We're not liable for user decisions."

**Skeptic says:** "Disclaimers provide some legal protection but zero product protection. If a user's first experience with your platform leads to a loss, they don't care about your disclaimer — they'll tell 50 friends your app lost them money. In a market where you're trying to convince skeptical first-time investors to trust the stock market, even one bad viral story can kill you. Remember: your target audience has NEVER invested before. They don't have the emotional training to handle a loss. A disclaimer won't undo the damage."

**Investor says:** "This is actually your biggest opportunity for differentiation. Don't just disclaim liability — actively PREVENT bad outcomes through product design. If your platform helps people avoid the worst mistakes, word-of-mouth will be your best marketing."

### RECOMMENDED APPROACH: "Guardrails-First" AI Design

**1. The AI Never Says Buy or Sell**
Hard-code this into the system prompt. The AI can say:
- "Here's what this metric means..."
- "Investors who use this strategy typically look for..."
- "Here's what happened when similar market conditions occurred historically..."
- "This stock's Shariah compliance status changed because..."

The AI CANNOT say:
- "You should buy/sell this stock"
- "This is a good/bad investment"
- "I recommend..."
- "Based on your situation, you should..."

**2. Risk Education Before Action**
Before a user can access any analysis, require them to complete a brief "Investment Basics" module (5-10 minutes). This isn't just legal protection — it genuinely helps users. Topics:
- "What is a stock?"
- "Why do stock prices go up AND down?"
- "What does it mean to lose money on a stock?"
- "How much should you invest?" (Never more than you can afford to lose)
- "What is diversification and why does it matter?"

**3. The "Affordability Check" (Psychological Safety)**
When a user sets up their profile, ask: "What percentage of your savings are you considering investing?" If they say more than 20%, show a gentle warning: "Most financial experts recommend keeping an emergency fund before investing. Here's why..." This positions your platform as genuinely caring about user welfare.

**4. Portfolio Concentration Alerts**
If a user is tracking a portfolio that's heavily concentrated in one stock or sector, the AI proactively warns: "Your tracked portfolio has 80% in one company. Here's what concentration risk means and why diversification is important."

**5. Market Volatility Warnings**
During market downturns, proactively communicate: "The market dropped 5% today. Here's context: [historical examples of recoveries]. Remember: short-term drops are normal. Here's what 'panic selling' means and why it often hurts investors."

**6. Formal Legal Protections**
- Terms of Service with clear liability limitations
- "For informational and educational purposes only" framing throughout
- No personalized advice (the AI doesn't know the user's financial situation)
- Clear attribution of data sources
- Timestamp on all analysis ("This analysis was generated on [date] using data available at that time")

**7. The "Ethical AI" Commitment**
Make this a public part of your brand: "Our AI is designed to educate, not direct. We never tell you what to buy or sell. We give you the tools to make your own informed decisions." This turns a limitation into a brand strength.

---

## CRITICAL PROBLEM #5: LANGUAGE — SINHALA/TAMIL AI CAPABILITIES

### The Problem
~75% of Sri Lankans speak Sinhala as their primary language, ~25% speak Tamil. Most financial content is in English. If you want to reach the 95% who don't invest, you need to work in their language.

### The Reality

Modern LLMs (including Claude) have some Sinhala and Tamil capabilities but they're not as strong as English. Financial terminology in Sinhala/Tamil is not well-standardized — there are often English loanwords used for concepts like "dividend," "P/E ratio," etc.

### The Multi-Perspective Debate

**Builder says:** "Start in English for the MVP. The initial target audience (tech-savvy, already somewhat financially aware) likely reads English. Add Sinhala/Tamil in Phase 2."

**Skeptic says:** "If your mission is to bring stock market access to the masses, English-only is a non-starter. The people who most need financial education are the ones least likely to be comfortable in English. You're building for the 8% who already invest, not the 92% who don't."

**Investor says:** "English MVP is pragmatically correct for validating the product. But the multilingual roadmap needs to be in the architecture from Day 1 — not bolted on later."

### RECOMMENDED APPROACH

**Phase 1 — English-First MVP with Multilingual Architecture:**
- All user-facing text in a localization system (i18n) from Day 1
- Database schema supports multilingual content
- AI responses in English initially
- UI in English with language selector (even if only English works initially — it signals intent)

**Phase 2 — Sinhala/Tamil UI:**
- Translate all static UI text (menus, buttons, labels) into Sinhala and Tamil
- Use professional translators, not machine translation, for financial terminology
- Create a Sinhala/Tamil financial glossary as part of the educational content

**Phase 3 — Multilingual AI:**
- Build a translation layer between the user and the AI
- User writes in Sinhala → translated to English → Claude processes → response translated back to Sinhala
- For critical financial terms, maintain a curated dictionary of approved translations
- Alternative: Fine-tune or use a prompt engineering approach where Claude responds in Sinhala/Tamil directly (test quality carefully)

**The Glossary as Content Marketing:**
Create "The Sri Lankan Investor's Dictionary" — a free, open-source Sinhala/Tamil/English financial glossary. This becomes:
1. Valuable content that drives organic traffic
2. A trust signal (you're educating, not just selling)
3. A data asset for your AI's multilingual capabilities
4. Shareable on social media for virality

---

## SYNTHESIS: THE PRODUCT ARCHITECTURE EMERGES

After stress-testing all five problems, here's what the product looks like:

### What It IS:
An **educational investment intelligence platform** for the CSE that happens to have the most sophisticated Shariah compliance engine in Sri Lanka.

### What It Is NOT:
A broker, an advisor, or a trading platform.

### The Core Loop:
1. **Learn** — Educational content about investing (multilingual, beginner-friendly)
2. **Discover** — AI-powered analysis of CSE stocks (with Shariah filter toggle)
3. **Track** — Portfolio monitoring with automatic purification calculations
4. **Alert** — Real-time notifications on price movements and compliance status changes

### Revenue Model (Revised):
1. **Freemium** — Basic screening, education, and limited analysis: FREE
2. **Premium** — Full AI analysis, portfolio tracking, purification calculator, advanced alerts: LKR 500-1,000/month (~$1.50-$3.00)
3. **Institutional** — API access for brokers/fund managers who want Shariah screening: custom pricing
4. **Affiliate** — Referral partnerships with brokers (CAL, LOLC, etc.) for CDS account opening: commission per account

### Competitive Positioning vs. Stockflow:
| Feature | Stockflow | Your Platform |
|---------|-----------|---------------|
| Portfolio tracking | ✅ (retrospective) | ✅ (real-time + forward) |
| Realized P&L | ✅ | ✅ |
| AI analysis | ❌ | ✅ |
| Shariah screening | ❌ | ✅ |
| Purification calculator | ❌ | ✅ |
| Educational content | ❌ | ✅ |
| Multilingual | ❌ | ✅ (roadmap) |
| Trade execution | ❌ | ❌ (by design) |

### Immediate Next Steps:
1. **Name the product** — we need a brand identity
2. **Validate the data pipeline** — build a proof of concept that ingests CSE data via the unofficial API
3. **Define the Shariah screening algorithm** — translate the SEC's methodology into code
4. **Design the AI agent's system prompt** — the guardrails, persona, and knowledge base
5. **Wireframe the core screens** — the dashboard, stock analysis view, Shariah filter, and educational module
6. **Consult a securities lawyer** — get a formal opinion on regulatory classification

---

*This document is a living brainstorming artifact. It will be updated as we make decisions and discover new information.*
