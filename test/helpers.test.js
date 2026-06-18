import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGoals, parseChallengeName, durationToDays,
  computeLogTotals, matchGoalToTotals, parseWeeklyMilestones, generateICS,
  redactPII, maskMessages,
} from '../helpers.js';

const SAMPLE_PLAN = `
# 💪 30-Day Team Fit Challenge

## 🏆 Challenge Name & Tagline
**30-Day Team Fit** — *Move, Hydrate, Thrive*

## 📅 Weekly Milestones
| Week | Theme | Key Activity | Team Challenge |
|------|-------|--------------|----------------|
| Week 1 | Foundation | Daily walks | Step counting |
| Week 2 | Build | Strength training | Workout pairs |

## ✅ Challenge Tracker
| # | Habit | Daily Goal | Points |
|---|-------|------------|--------|
| 1 | Steps | 10000 steps | 10 pts |
| 2 | Fitness | 30 min of activity | 5 pts |
| 3 | Hydration | 8 glasses of water | 5 pts |
| 4 | Sleep | 7 hrs of sleep | 5 pts |
| 5 | Calories | Log 3 meals | 5 pts |

## 🎁 Rewards
| 🥉 Bronze | 🥈 Silver | 🥇 Gold |
|-----------|----------|--------|
| Water bottle | Gift card | Fitness tracker |
`;

describe('parseGoals', () => {
  it('extracts all 5 habit rows', () => {
    const goals = parseGoals(SAMPLE_PLAN);
    assert.equal(goals.length, 5);
  });

  it('parses habit name, target, and points', () => {
    const goals = parseGoals(SAMPLE_PLAN);
    assert.equal(goals[0].habit, 'Steps');
    assert.equal(goals[0].target, '10000 steps');
    assert.equal(goals[0].points, 10);
  });

  it('assigns sequential ids starting at 1', () => {
    const goals = parseGoals(SAMPLE_PLAN);
    assert.deepEqual(goals.map(g => g.id), [1, 2, 3, 4, 5]);
  });

  it('defaults points to 5 when not parseable', () => {
    const plan = `## Challenge Tracker\n| # | Habit | Daily Goal | Points |\n|---|-------|------------|--------|\n| 1 | Walk | 30 min | pts |\n`;
    const goals = parseGoals(plan);
    assert.equal(goals[0].points, 5);
  });

  it('returns empty array when section is missing', () => {
    assert.deepEqual(parseGoals('No tracker here'), []);
  });
});

describe('parseChallengeName', () => {
  it('extracts name from Challenge Name section', () => {
    const plan = '## Challenge Name\nFitness Journey - Build strength daily\nmore content';
    assert.equal(parseChallengeName(plan), 'Fitness Journey');
  });

  it('falls back to H1 heading', () => {
    const plan = '# My Wellness Plan\nsome content';
    assert.equal(parseChallengeName(plan), 'My Wellness Plan');
  });

  it('falls back to bold text', () => {
    const plan = 'Intro text\n**Team Health Challenge**\nmore content';
    assert.equal(parseChallengeName(plan), 'Team Health Challenge');
  });

  it('returns default when nothing matches', () => {
    assert.equal(parseChallengeName('no headings or bold'), 'Wellness Challenge');
  });
});

describe('durationToDays', () => {
  it('maps 3 day to 3', () => assert.equal(durationToDays('3 day challenge'), 3));
  it('maps 2 week to 14', () => assert.equal(durationToDays('2 week program'), 14));
  it('maps 1 week to 7', () => assert.equal(durationToDays('1 week'), 7));
  it('defaults unknown durations to 7', () => assert.equal(durationToDays('30 days'), 7));
  it('is case-insensitive', () => assert.equal(durationToDays('3 Day'), 3));
});

describe('computeLogTotals', () => {
  const logs = [
    { type: 'water', value: '3' },
    { type: 'water', value: '5' },
    { type: 'steps', value: '8000' },
    { type: 'steps', value: '2000' },
    { type: 'meditate', duration: '15', cat: 'mindful' },
    { type: 'breathe', duration: '5', cat: 'mindful' },
    { type: 'sleep', value: '7' },
    { type: 'meal' },
    { type: 'snack' },
    { type: 'walk', cat: 'physical', duration: '30' },
  ];

  it('sums water', () => assert.equal(computeLogTotals(logs).water, 8));
  it('sums steps', () => assert.equal(computeLogTotals(logs).steps, 10000));
  it('sums mindful minutes', () => assert.equal(computeLogTotals(logs).mindful, 20));
  it('sums sleep hours', () => assert.equal(computeLogTotals(logs).sleep, 7));
  it('counts meals and snacks', () => assert.equal(computeLogTotals(logs).meals, 2));
  it('sums active minutes (non-steps physical)', () => assert.equal(computeLogTotals(logs).active, 30));

  it('returns zeros for empty log array', () => {
    const totals = computeLogTotals([]);
    assert.deepEqual(totals, { water: 0, steps: 0, active: 0, mindful: 0, meals: 0, sleep: 0 });
  });
});

describe('matchGoalToTotals', () => {
  const totals = { water: 8, steps: 10000, active: 30, mindful: 20, meals: 3, sleep: 7 };

  it('matches step goals', () => {
    const r = matchGoalToTotals({ habit: 'Steps', target: '10000 steps' }, totals);
    assert.equal(r.logged, 10000);
    assert.equal(r.targetNum, 10000);
  });

  it('matches water goals', () => {
    const r = matchGoalToTotals({ habit: 'Hydration', target: '8 glasses of water' }, totals);
    assert.equal(r.logged, 8);
    assert.equal(r.targetNum, 8);
  });

  it('matches sleep goals', () => {
    const r = matchGoalToTotals({ habit: 'Sleep', target: '7 hrs of sleep' }, totals);
    assert.equal(r.logged, 7);
    assert.equal(r.targetNum, 7);
  });

  it('matches meal goals', () => {
    const r = matchGoalToTotals({ habit: 'Calories', target: 'Log 3 meals' }, totals);
    assert.equal(r.logged, 3);
    assert.equal(r.targetNum, 3);
  });

  it('matches meditation/mindful goals', () => {
    const r = matchGoalToTotals({ habit: 'Mindfulness', target: '10 min meditate' }, totals);
    assert.equal(r.logged, 20);
  });

  it('matches exercise/activity goals', () => {
    const r = matchGoalToTotals({ habit: 'Fitness', target: '30 min of activity' }, totals);
    assert.equal(r.logged, 30);
  });

  it('returns 0 for unrecognized goals', () => {
    const r = matchGoalToTotals({ habit: 'Journaling', target: '1 entry' }, totals);
    assert.equal(r.logged, 0);
  });
});

describe('parseWeeklyMilestones', () => {
  it('extracts weekly milestone rows', () => {
    const weeks = parseWeeklyMilestones(SAMPLE_PLAN);
    assert.equal(weeks.length, 2);
    assert.equal(weeks[0].week, 1);
    assert.equal(weeks[0].theme, 'Foundation');
  });

  it('joins extra columns as description', () => {
    const weeks = parseWeeklyMilestones(SAMPLE_PLAN);
    assert.ok(weeks[0].description.includes('Daily walks'));
  });

  it('returns empty array when section is missing', () => {
    assert.deepEqual(parseWeeklyMilestones('No milestones here'), []);
  });
});

describe('generateICS', () => {
  const weeks = [
    { week: 1, theme: 'Foundation', description: 'Build habits' },
    { week: 2, theme: 'Build', description: 'Go harder' },
  ];

  it('generates valid VCALENDAR wrapper', () => {
    const ics = generateICS(weeks, '2025-01-06', 'Team Fit');
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.endsWith('END:VCALENDAR'));
  });

  it('includes one VEVENT per week', () => {
    const ics = generateICS(weeks, '2025-01-06', 'Team Fit');
    const matches = ics.match(/BEGIN:VEVENT/g);
    assert.equal(matches?.length, 2);
  });

  it('sets DTSTART to the correct date for week 1', () => {
    const ics = generateICS(weeks, '2025-01-06', 'Team Fit');
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20250106'));
  });

  it('sets DTSTART for week 2 to 7 days after start', () => {
    const ics = generateICS(weeks, '2025-01-06', 'Team Fit');
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20250113'));
  });

  it('includes challenge name and week theme in SUMMARY', () => {
    const ics = generateICS(weeks, '2025-01-06', 'Team Fit');
    assert.ok(ics.includes('SUMMARY:Team Fit'));
    assert.ok(ics.includes('Foundation'));
  });
});

describe('redactPII', () => {
  it('redacts an email address', () => {
    assert.equal(redactPII('contact me at jane@example.com'), 'contact me at [REDACTED_EMAIL]');
  });

  it('redacts an SSN in ###-##-#### format', () => {
    assert.equal(redactPII('SSN: 123-45-6789'), 'SSN: [REDACTED_SSN]');
  });

  it('redacts a phone number with dashes', () => {
    assert.equal(redactPII('call 555-123-4567'), 'call [REDACTED_PHONE]');
  });

  it('redacts a phone number in (xxx) xxx-xxxx format', () => {
    assert.equal(redactPII('call (555) 123-4567'), 'call [REDACTED_PHONE]');
  });

  it('does NOT redact a bare step-count number with no separators', () => {
    assert.equal(redactPII('I hit 10000 steps today'), 'I hit 10000 steps today');
  });

  it('redacts a valid credit card number (Luhn-valid)', () => {
    assert.equal(redactPII('card 4532015112830366'), 'card [REDACTED_CC]');
  });

  it('does NOT redact a long numeric sequence that fails Luhn', () => {
    assert.equal(redactPII('order id 1234567890123456'), 'order id 1234567890123456');
  });

  it('redacts a valid IPv4 address', () => {
    assert.equal(redactPII('connect to 192.168.1.1'), 'connect to [REDACTED_IP]');
  });

  it('does NOT redact an invalid IPv4-shaped number (octet > 255)', () => {
    assert.equal(redactPII('ratio 999.999.999.999'), 'ratio 999.999.999.999');
  });

  it('redacts a name following a self-introduction phrase', () => {
    assert.equal(redactPII('Hi, my name is Sarah Connor'), 'Hi, my name is [REDACTED_NAME]');
  });

  it('does not redact capitalized words outside intro phrasing', () => {
    assert.equal(redactPII('I love Mondays and Tuesdays'), 'I love Mondays and Tuesdays');
  });

  it('redacts multiple PII types in one string', () => {
    const input = 'Email jane@example.com or call 555-123-4567';
    const out = redactPII(input);
    assert.match(out, /\[REDACTED_EMAIL\]/);
    assert.match(out, /\[REDACTED_PHONE\]/);
  });

  it('returns non-string input unchanged', () => {
    assert.equal(redactPII(42), 42);
  });
});

describe('maskMessages', () => {
  it('masks PII across every message in the array, not just the last', () => {
    const messages = [
      { role: 'user', content: 'my email is a@b.com' },
      { role: 'assistant', content: 'got it' },
      { role: 'user', content: 'call 555-123-4567' },
    ];
    const masked = maskMessages(messages);
    assert.match(masked[0].content, /\[REDACTED_EMAIL\]/);
    assert.match(masked[2].content, /\[REDACTED_PHONE\]/);
  });

  it('does not mutate the original messages array or its objects', () => {
    const original = [{ role: 'user', content: 'a@b.com' }];
    const copy = JSON.parse(JSON.stringify(original));
    maskMessages(original);
    assert.deepEqual(original, copy);
  });

  it('preserves message role and shape', () => {
    const masked = maskMessages([{ role: 'user', content: 'hello' }]);
    assert.equal(masked[0].role, 'user');
  });

  it('handles content-block array format (Anthropic style)', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'a@b.com' }] }];
    const masked = maskMessages(messages);
    assert.match(masked[0].content[0].text, /\[REDACTED_EMAIL\]/);
  });

  it('throws on non-array input (fail-closed contract)', () => {
    assert.throws(() => maskMessages('not an array'));
  });

  it('throws on a malformed message entry', () => {
    assert.throws(() => maskMessages([null]));
  });

  it('returns an empty array for an empty input array', () => {
    assert.deepEqual(maskMessages([]), []);
  });
});
