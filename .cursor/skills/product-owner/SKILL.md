---
name: product-owner
description: >-
  Help decide whether a proposed feature aligns with the OmniconnectPRO
  product vision, prioritize the backlog, or evaluate trade-offs between
  features. Use when the user asks "should we build X?", asks for a prioriti-
  zation, wants a feature filter, or is unsure how a request fits the
  product roadmap.
---

# Product Owner

OmniconnectPRO is a **Growth Operations platform** for high-volume sales operations (initial focus: real estate). The product transforms conversations into opportunities and opportunities into predictable sales.

## The filter (apply every time)

A feature is worth building **only if** it helps with at least one of:

1. **Qualify leads** before they reach a human seller
2. **Analyze conversations** to extract commercial signal
3. **Detect lost opportunities** that can be recovered
4. **Improve seller performance** via feedback / coaching signals
5. **Improve marketing attribution** (campaign → conversation → sale)
6. **Reduce commercial waste** (time, follow-ups, ad spend)
7. **Improve CRM reliability** (data that managers can trust)
8. **Support multi-client scalability** (works for 1 or 1000 tenants)
9. **Support analyst-led service** (humans optimizing growth on top of the platform)
10. **Generate CEO/CFO dashboards** with conversion leakage insights

If a feature doesn't fit any of these, reconsider scope or push to "someday".

## Reject when

- ❌ Generic CRM feature with no link to conversion intelligence
- ❌ Duplicates existing module's capability
- ❌ Increases complexity without measurable customer outcome
- ❌ Breaks multi-tenant or security architecture
- ❌ Requires manual work that could be a workflow automation
- ❌ Optimizes a path that has zero data showing it matters

## Decision framework

For each proposed feature, ask:

```
1. Which of the 10 product goals does it serve? (must be at least 1)
2. Which user benefits? (admin, manager, seller, analyst, integration)
3. What's the smallest version that proves the value? (MVP scope)
4. What does success look like in 4 weeks? (measurable)
5. What's the cost? (build + maintenance + AI inference if applicable)
6. What does it block / depend on?
7. Can the analyst service deliver this manually for 1-2 quarters before automating?
```

## MVP-first path (the official ordering)

1. **InsightAI in OmniConnect** ← we're here
2. **CRM integration** (push InsightAI insights into lead/deal)
3. **Botify triage** (qualify before seller handoff)
4. **Executive dashboard** (CEO/CFO leakage view)
5. **Omnichannel expansion** (beyond WhatsApp)

Don't jump phases. Every step unlocks the next.

## Tech-enabled service mindset

The product is initially delivered as **tech + analyst**:
- Platform handles 80% (conversations, AI analysis, dashboards)
- Analyst handles 20% (interpreting, recommending, intervening)
- Repeated analyst patterns → become product features over time

This shapes priorities:
- ✅ Features that give the analyst leverage (dashboards, alerts, exports)
- ✅ Features that the analyst would otherwise do manually
- ❌ "Pure product" features the analyst doesn't need yet

## Trade-off heuristics

| Tension | Lean toward |
|---|---|
| Build vs buy (LLM, monitoring) | Buy unless we own the data/IP |
| Speed vs scalability | Scalability — refactor later costs more |
| Generic vs vertical (real estate first) | Vertical — go deep before broad |
| Feature richness vs reliability | Reliability — broken trust kills sales |
| Cost of feature vs cost of inaction | Often inaction is cheaper than guessed |

## Saying no

When rejecting:
1. Acknowledge the underlying problem
2. Show how an existing module already addresses it (or partially)
3. Propose what would change that decision (data, customer count, MRR threshold)
4. File the idea in `docs/adr/` if it might come back

## See also

- `docs/01-product-vision.md`
- `docs/09-roadmap.md`
- `docs/migration/00-context-and-decisions.md`
