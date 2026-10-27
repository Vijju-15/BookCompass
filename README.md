# BookCompass 🧭
> **AI-Powered Book Recommender for Beginners to Advanced Readers**

BookCompass is a portfolio-grade GenAI web application built to solve a classic reader dilemma: *where do I start?* Instead of vague popularity rankings, BookCompass recommends the best books based on a reader's **genre**, **reading level** (beginner, intermediate, advanced), and optional **mood/preferences**. It writes grounded explanations and constructs an escalating **reading ladder** (read X, then Y, then Z).

---

## 🌟 Core Principle: Zero Hallucination

> **The LLM never invents book facts.**

A primary engineering constraint in BookCompass is avoiding LLM hallucination:
- **LLM role**: Understand user intent (extract structured preferences) and explain *why* the verified books match the user's criteria.
- **Database / API role**: All book facts (titles, authors, genuine page counts, descriptions, and cover imagery) come strictly from our curated database or verified API lookups (Google Books API / Open Library API).
- **Hard drop policy**: Any candidate that cannot be verified against our catalog or external book authority APIs is dropped immediately prior to scoring and presentation.

---

## 🏗️ Architecture

## 🏗️ Architecture (v2 Pipeline)

```mermaid
flowchart TD
    Intake["[1] Guided Intake Form + Note<br/>(6-question profile + free text prompt)"] --> Context["[2] Context Builder & Genre Resolver<br/>(ReaderContext: form choice or transparent inference)"]
    Context --> DualRetrieve["[3] Dual-Source Parallel Retrieval<br/>- Supabase Catalog (SQL + pgvector)<br/>- Google Books API + Open Library API (Parallel Promise.allSettled)"]
    DualRetrieve --> Merge["[4] Deduplication, Merging & Batch Tagging<br/>(title_author_key upsert, Gemini batch tagging)"]
    Merge --> Score["[5] Deterministic 7-Factor Scoring<br/>(Level, Complexity, Genre, Semantic, Tone, Rating, Length)"]
    Score --> MMR["[6] MMR Diversity & Reading Ladder<br/>(Maximal Marginal Relevance lambda=0.7)"]
    MMR --> Facts["[7] matchFacts Generation<br/>(Deterministic factual chips built in pure code)"]
    Facts --> Explain["[8] Grounded Explanation & cleanText<br/>(Gemini structured explanation strictly grounded on matchFacts)"]
    Explain --> Stream["[9] SSE Streaming & UI<br/>(Profile Summary, Cards with Why Matched, Dot Badges)"]
```

---

## 📐 Unified Level Rubric (`lib/scoring/rubric.ts`)

Reading levels are strictly defined in deterministic code as the single source of truth across tagging and scoring:

| Level | Page Window | Typical Complexity | Classification Rule |
| :--- | :--- | :--- | :--- |
| **beginner** | 100–320 | 1–2 | Complexity 1–2 and pages up to 320 |
| **intermediate** | 200–450 | 2–3 | Default middle tier for balanced narrative and length |
| **advanced** | 350–1200 | 4–5 | Complexity 4–5 or pages above 500 |

---

## 🧮 Deterministic 7-Factor Scoring (`lib/scoring/score.ts`)

All candidate scoring is calculated via pure TypeScript functions, completely independent of LLM temperature or variance:

$$\text{Score} = 0.20 \times L + 0.15 \times C + 0.15 \times G + 0.20 \times S + 0.10 \times T + 0.10 \times R + 0.10 \times P$$

### Scoring Factor Breakdown:
- **$L$ (Level Match - 0.20)**: `1.0` for exact level match, `0.5` for adjacent level, `0.1` two levels apart.
- **$C$ (Complexity Match - 0.15)**: `1.0` inside chosen range (simple 1-2, twisty 2-3, layered 4-5), `0.5` one step outside, `0.1` further (`0.7` for no preference).
- **$G$ (Genre Match - 0.15)**: Fraction of requested genres present in the book's verified genres.
- **$S$ (Semantic Similarity - 0.20)**: Cosine similarity of the query taste vector $q$ with book embedding ($q = 0.6 \times \text{embed}(\text{query}) + 0.4 \times \text{mean}(\text{loved reads})$).
- **$T$ (Tone & Sub-Genre Match - 0.10)**: Overlap of requested moods, subgenres, and heat level with book tags (heat level mismatch counts as `0.0`).
- **$R$ (Rating - 0.10)**: Verified average rating divided by 5. Books with no rating score a neutral `0.6` (never penalizing unrated books).
- **$P$ (Length Fit - 0.10)**: `1.0` within the chosen page range, decaying linearly to `0.0` at $1.5\times$ the limit (`0.7` for no preference).

### Post-Score Rules & Penalties:
- **Past reads**: Hard excluded from recommendation pool.
- **Seen earlier in chat**: $-0.50$ penalty.
- **Disliked author**: $0.50\times$ penalty multiplier.
- **Avoid list match**: $0.10\times$ penalty multiplier.
- **Dual API confirmation**: $+0.03$ bonus when book is confirmed by both Google Books and Open Library.
- **Direct title inquiry**: Boosted to $0.98$ max score.

---

## 🛠️ Tech Stack & Decision Record

| Layer | Technology | Decision Record |
| :--- | :--- | :--- |
| **Framework** | Next.js 16 (App Router) | React Server Components, Route Handlers, and Partial Prefetching. |
| **Styling & UI** | Tailwind CSS v4, Lucide Icons, Framer Motion | Modern mobile-first responsive design, light/dark mode support, smooth animations. |
| **LLM & Embeddings** | Google Gemini (`gemini-2.5-flash` & `text-embedding-004`) | High instruction-following performance, low latency, native structured output, 768-dim embeddings. |
| **Orchestration** | LangChain JS (`@langchain/google-genai`, `@langchain/core`) | Clean prompts, structured output integration, and token streaming. |
| **Database** | Supabase (Postgres + pgvector) | Relational database + vector search in one engine. Hosted, high performance, and supports HNSW vector indexing. |
| **Book APIs** | Google Books API & Open Library API | Real page counts, official ISBNs, cover art, and authoritative descriptions. |
| **Rate Limiting** | Upstash Redis + `@upstash/ratelimit` | Sliding window rate limiting (10 req/min/IP and 50 req/day/IP) to prevent abuse and API exhaustion. |
| **Testing** | Vitest | Lightning-fast TypeScript unit tests covering scoring and schema parsing. |
| **Hosting** | Vercel | Seamless Next.js deployment with Edge/Node.js runtime support. |

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- A Google AI Studio API key ([aistudio.google.com](https://aistudio.google.com/))
- A Supabase project ([supabase.com](https://supabase.com/))
- An Upstash Redis database ([upstash.com](https://upstash.com/))

### 2. Clone and Install
```bash
git clone https://github.com/your-username/bookcompass.git
cd bookcompass
npm install --legacy-peer-deps
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your secrets:
```env
GOOGLE_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

GOOGLE_BOOKS_API_KEY=your_optional_google_books_key

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 4. Database Setup
Run the SQL schema located in `lib/db/schema.sql` inside your Supabase SQL Editor. This sets up:
- The `vector` extension
- The `books`, `reading_ladders`, and `queries_log` tables
- Cosine vector index (`hnsw`)
- The `match_books` SQL search function
- Row Level Security (RLS) policies

### 5. Seed Catalog Data
Enrich, embed, and insert the curated books catalog:
```bash
npm run seed
```

### 6. Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

Run the full automated test suite and type check:
```bash
# Run unit tests
npm test

# Run ESLint
npm run lint

# Run production build
npm run build
```

---

## 📡 API Contract

### `POST /api/recommend`
Streams recommendations using Server-Sent Events (SSE).

**Request:**
```json
{
  "message": "Something scary and atmospheric, but I'm new to reading horror",
  "genre": "horror",
  "level": "beginner"
}
```

**SSE Events Stream:**
1. `event: books` — Array of top verified `Book` objects with match scores.
2. `event: ladder` — Step-by-step reading progression (steps 1–3).
3. `event: text` — Streamed AI explanation chunks grounded strictly on the book data.
4. `event: done` — Stream completion signal.

### `GET /api/health`
Health check endpoint reporting service status.

---

## 🔮 Future Work (Out of Scope for v1)
- User accounts & saved book lists / reading histories
- Amazon / Goodreads account synchronization
- Multi-language recommendation models
- Direct library checkout integration (OverDrive / Libby)

---

## 📄 License
MIT &bull; Portfolio project by Antigravity
