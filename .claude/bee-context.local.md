## Discovery Context

- Greenfield project: architecture patterns comparison
- Domain: Banking/Money Transfer (Account + Transfer entities)
- Business rules: Insufficient funds check + Transfer atomicity
- Tech: NestJS, TypeScript, Drizzle ORM, PostgreSQL, Vitest
- 6 fully independent projects in one repo
- Build order: N-tier → Hexagonal → Onion → Clean → DDD → CQRS/ES
- Testing: Behavioral unit tests (unit = group of behaviors, not class) + Integration tests (full HTTP round-trip)
- Each project has own docker-compose.yml, package.json, everything
- API: ~5 endpoints, similar across projects, natural variation allowed
- Goal: Personal learning exercise

See full discovery: docs/specs/architecture-comparison-discovery.md
