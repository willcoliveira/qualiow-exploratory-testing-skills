import { describe, it, expect } from 'vitest';
import {
  TargetConfigSchema,
  KnowledgeEntrySchema,
  KnowledgeManifestSchema,
  DomainConfigSchema,
  SessionMetricsSchema,
} from '../../src/schemas/index.js';

describe('TargetConfigSchema', () => {
  const validTarget = {
    id: 'saucedemo',
    name: 'Sauce Demo',
    base_url: 'https://www.saucedemo.com/',
    domain: 'ecommerce',
    auth: { strategy: 'none' as const },
    browser: { headless: false, viewport: { width: 1280, height: 720 } },
    scope: { start_pages: ['/'], max_depth: 3 },
  };

  it('should accept a valid target config', () => {
    expect(() => TargetConfigSchema.parse(validTarget)).not.toThrow();
  });

  it('should accept a target config with optional fields', () => {
    const withOptionals = {
      ...validTarget,
      safety: { read_only: true, no_form_submit: false },
      notes: 'Some notes here',
    };
    expect(() => TargetConfigSchema.parse(withOptionals)).not.toThrow();
  });

  it('should reject missing id', () => {
    const { id, ...noId } = validTarget;
    const result = TargetConfigSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('should reject invalid URL', () => {
    const badUrl = { ...validTarget, base_url: 'not-a-url' };
    const result = TargetConfigSchema.safeParse(badUrl);
    expect(result.success).toBe(false);
  });

  it('should reject invalid auth strategy', () => {
    const badAuth = {
      ...validTarget,
      auth: { strategy: 'magic_link' },
    };
    const result = TargetConfigSchema.safeParse(badAuth);
    expect(result.success).toBe(false);
  });

  it('should reject negative viewport width', () => {
    const bad = {
      ...validTarget,
      browser: { headless: true, viewport: { width: -100, height: 720 } },
    };
    const result = TargetConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe('KnowledgeEntrySchema', () => {
  const validEntry = {
    id: 'heuristic-sfdipot',
    version: '0.1.0',
    type: 'heuristic' as const,
    name: 'SFDIPOT',
    description: 'A mnemonic for product elements.',
    author: 'James Bach',
    source: 'RST',
    tags: ['exploration'],
    domains: ['all'],
    priority: 'high' as const,
    added: '2026-03-28',
    content: { summary: 'SFDIPOT stands for ...' },
  };

  it('should accept a valid knowledge entry', () => {
    expect(() => KnowledgeEntrySchema.parse(validEntry)).not.toThrow();
  });

  it('should accept entry with extra content fields (passthrough)', () => {
    const withExtra = {
      ...validEntry,
      content: {
        summary: 'A summary.',
        dimensions: [{ name: 'Structure' }],
        gotchas: ['Watch out'],
      },
    };
    expect(() => KnowledgeEntrySchema.parse(withExtra)).not.toThrow();
  });

  it('should reject missing tags', () => {
    const { tags, ...noTags } = validEntry;
    const result = KnowledgeEntrySchema.safeParse(noTags);
    expect(result.success).toBe(false);
  });

  it('should reject empty tags array', () => {
    const emptyTags = { ...validEntry, tags: [] };
    const result = KnowledgeEntrySchema.safeParse(emptyTags);
    expect(result.success).toBe(false);
  });

  it('should reject invalid type', () => {
    const badType = { ...validEntry, type: 'tutorial' };
    const result = KnowledgeEntrySchema.safeParse(badType);
    expect(result.success).toBe(false);
  });

  it('should reject invalid priority', () => {
    const badPriority = { ...validEntry, priority: 'urgent' };
    const result = KnowledgeEntrySchema.safeParse(badPriority);
    expect(result.success).toBe(false);
  });

  it('should reject missing content summary', () => {
    const noSummary = { ...validEntry, content: {} };
    const result = KnowledgeEntrySchema.safeParse(noSummary);
    expect(result.success).toBe(false);
  });
});

describe('KnowledgeManifestSchema', () => {
  const validManifest = {
    version: '0.1.0',
    last_updated: '2026-03-28',
    active_releases: ['v0.1.0'],
    stats: {
      total_entries: 13,
      heuristics: 5,
      techniques: 5,
      checklists: 1,
      references: 2,
      domain_profiles: 0,
      custom_entries: 0,
    },
    loading_strategy: {
      always: ['heuristic-sfdipot'],
      by_domain: { ecommerce: [] },
      by_tag: { security: ['technique-error-guessing'] },
    },
    entries: [
      {
        id: 'heuristic-sfdipot',
        file: 'releases/v0.1.0/entries/heuristic-sfdipot.yml',
        type: 'heuristic',
        priority: 'high' as const,
        tags: ['exploration'],
        domains: ['all'],
      },
    ],
  };

  it('should accept a valid manifest', () => {
    expect(() => KnowledgeManifestSchema.parse(validManifest)).not.toThrow();
  });

  it('should reject missing version', () => {
    const { version, ...noVersion } = validManifest;
    const result = KnowledgeManifestSchema.safeParse(noVersion);
    expect(result.success).toBe(false);
  });

  it('should reject empty entries array', () => {
    const noEntries = { ...validManifest, entries: [] };
    const result = KnowledgeManifestSchema.safeParse(noEntries);
    expect(result.success).toBe(false);
  });

  it('should reject empty active_releases', () => {
    const noReleases = { ...validManifest, active_releases: [] };
    const result = KnowledgeManifestSchema.safeParse(noReleases);
    expect(result.success).toBe(false);
  });
});

describe('DomainConfigSchema', () => {
  const validDomain = {
    id: 'ecommerce',
    name: 'E-commerce',
    risk_ranking: ['Payment processing', 'Cart management'],
    completeness_checklist: ['Test checkout flow', 'Verify pricing'],
    data_integrity_checks: ['Order totals match', 'Stock updates'],
    journeys: [
      {
        id: 'checkout',
        name: 'Checkout Flow',
        description: 'Complete purchase flow',
        steps: ['Add item', 'Go to cart', 'Checkout'],
        risk: 'high' as const,
      },
    ],
    guidance: ['Focus on payment edge cases'],
  };

  it('should accept a valid domain config', () => {
    expect(() => DomainConfigSchema.parse(validDomain)).not.toThrow();
  });

  it('should reject missing journeys', () => {
    const { journeys, ...noJourneys } = validDomain;
    const result = DomainConfigSchema.safeParse(noJourneys);
    expect(result.success).toBe(false);
  });

  it('should reject empty risk_ranking', () => {
    const empty = { ...validDomain, risk_ranking: [] };
    const result = DomainConfigSchema.safeParse(empty);
    expect(result.success).toBe(false);
  });

  it('should reject journey with invalid risk level', () => {
    const badJourney = {
      ...validDomain,
      journeys: [
        {
          id: 'j1',
          name: 'J1',
          description: 'D',
          steps: ['step1'],
          risk: 'extreme',
        },
      ],
    };
    const result = DomainConfigSchema.safeParse(badJourney);
    expect(result.success).toBe(false);
  });
});

describe('SessionMetricsSchema', () => {
  const validMetrics = {
    session_id: 'sess-001',
    target: 'saucedemo',
    date: '2026-03-28',
    duration_min: 45,
    bugs_found: 3,
    severity_counts: { critical: 0, high: 1, medium: 1, low: 1 },
    pages_explored: 12,
  };

  it('should accept valid session metrics', () => {
    expect(() => SessionMetricsSchema.parse(validMetrics)).not.toThrow();
  });

  it('should reject negative duration', () => {
    const bad = { ...validMetrics, duration_min: -5 };
    const result = SessionMetricsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('should reject negative bugs_found', () => {
    const bad = { ...validMetrics, bugs_found: -1 };
    const result = SessionMetricsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('should reject missing severity_counts', () => {
    const { severity_counts, ...noSeverity } = validMetrics;
    const result = SessionMetricsSchema.safeParse(noSeverity);
    expect(result.success).toBe(false);
  });

  it('should reject non-integer pages_explored', () => {
    const bad = { ...validMetrics, pages_explored: 3.5 };
    const result = SessionMetricsSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
