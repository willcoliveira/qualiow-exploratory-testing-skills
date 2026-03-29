import { describe, it, expect } from 'vitest';
import { redact, containsSecrets } from '../../src/utils/redact.js';

describe('redact', () => {
  it('should redact JWT tokens', () => {
    const input =
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = redact(input);

    expect(result.text).toBe('Authorization: Bearer [JWT_REDACTED]');
    expect(result.redactions).toContain('JWT token');
    expect(result.text).not.toContain('eyJ');
  });

  it('should redact API keys with equals sign', () => {
    const input = 'api_key=fake_key_abc123def456ghi789jkl012';
    const result = redact(input);

    expect(result.text).toBe('api_key=[API_KEY_REDACTED]');
    expect(result.redactions).toContain('API key');
  });

  it('should redact API keys with colon separator', () => {
    const input = 'api-key: fake_key_abc123def456ghi789jkl012';
    const result = redact(input);

    expect(result.text).toBe('api_key=[API_KEY_REDACTED]');
    expect(result.redactions).toContain('API key');
  });

  it('should redact passwords with equals sign', () => {
    const input = 'password=SuperSecret123!';
    const result = redact(input);

    expect(result.text).toBe('password=[REDACTED]');
    expect(result.redactions).toContain('Password');
    expect(result.text).not.toContain('SuperSecret');
  });

  it('should redact passwords with colon separator', () => {
    const input = 'password: my_secret_pass';
    const result = redact(input);

    expect(result.text).toBe('password=[REDACTED]');
    expect(result.redactions).toContain('Password');
  });

  it('should redact tokens', () => {
    const input = 'token=abcdef1234567890abcdef1234567890';
    const result = redact(input);

    expect(result.text).toBe('token=[TOKEN_REDACTED]');
    expect(result.redactions).toContain('Token');
  });

  it('should redact secrets', () => {
    const input = 'secret=my_very_secret_value_123';
    const result = redact(input);

    expect(result.text).toBe('secret=[REDACTED]');
    expect(result.redactions).toContain('Secret');
  });

  it('should redact SSNs', () => {
    const input = 'The SSN is 123-45-6789 and belongs to John';
    const result = redact(input);

    expect(result.text).toBe(
      'The SSN is [SSN_REDACTED] and belongs to John',
    );
    expect(result.redactions).toContain('SSN');
  });

  it('should redact credit card numbers', () => {
    const input = 'Card: 4111111111111111 exp 12/25';
    const result = redact(input);

    expect(result.text).toBe('Card: [CARD_NUMBER_REDACTED] exp 12/25');
    expect(result.redactions).toContain('Credit card number');
  });

  it('should redact 13-digit card numbers', () => {
    const input = 'Number: 4222222222225';
    const result = redact(input);

    expect(result.text).toContain('[CARD_NUMBER_REDACTED]');
  });

  it('should redact 19-digit card numbers', () => {
    const input = 'Card: 1234567890123456789';
    const result = redact(input);

    expect(result.text).toContain('[CARD_NUMBER_REDACTED]');
  });

  it('should handle mixed content with multiple secret types', () => {
    const input = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456ghi789',
      'password=Secret123!',
      'SSN: 111-22-3333',
      'Card number: 4111111111111111',
    ].join('\n');
    const result = redact(input);

    expect(result.text).not.toContain('eyJ');
    expect(result.text).not.toContain('Secret123');
    expect(result.text).not.toContain('111-22-3333');
    expect(result.text).not.toContain('4111111111111111');
    expect(result.redactions).toContain('JWT token');
    expect(result.redactions).toContain('Password');
    expect(result.redactions).toContain('SSN');
    expect(result.redactions).toContain('Credit card number');
  });

  it('should NOT redact normal text', () => {
    const input =
      'This is a normal report about a login page with some test data.';
    const result = redact(input);

    expect(result.text).toBe(input);
    expect(result.redactions).toHaveLength(0);
  });

  it('should NOT redact short numbers that are not card numbers', () => {
    const input = 'Page has 42 items and error code 12345';
    const result = redact(input);

    expect(result.text).toBe(input);
    expect(result.redactions).toHaveLength(0);
  });

  it('should NOT redact regular URLs', () => {
    const input = 'Visit https://www.example.com/page?ref=abc';
    const result = redact(input);

    expect(result.text).toBe(input);
    expect(result.redactions).toHaveLength(0);
  });
});

describe('containsSecrets', () => {
  it('should return true when JWT token is present', () => {
    expect(
      containsSecrets(
        'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoiMSJ9.abcdefghijklmnop',
      ),
    ).toBe(true);
  });

  it('should return true when password is present', () => {
    expect(containsSecrets('password=hunter2')).toBe(true);
  });

  it('should return true when SSN is present', () => {
    expect(containsSecrets('SSN: 123-45-6789')).toBe(true);
  });

  it('should return true when credit card number is present', () => {
    expect(containsSecrets('4111111111111111')).toBe(true);
  });

  it('should return false for clean text', () => {
    expect(containsSecrets('Hello world, this is safe text.')).toBe(false);
  });

  it('should return false for short numbers', () => {
    expect(containsSecrets('Error code: 404')).toBe(false);
  });
});
