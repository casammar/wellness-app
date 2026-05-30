import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const PROVIDER = (process.env.LLM_PROVIDER || 'claude').toLowerCase();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-5';
const LM_MODEL = process.env.LM_STUDIO_MODEL || 'local-model';
const ACTIVE_MODEL = PROVIDER === 'lmstudio' ? LM_MODEL : CLAUDE_MODEL;

const anthropic = new Anthropic();
const lmstudio = new OpenAI({
  baseURL: process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
  apiKey: 'lm-studio',
});

const DATA_DIR        = join(__dirname, 'data');
const PLAN_FILE       = join(DATA_DIR, 'current-plan.json');
const LOGS_FILE       = join(DATA_DIR, 'logs.json');
const PROFILE_FILE    = join(DATA_DIR, 'profile.json');
const CHALLENGES_FILE = join(DATA_DIR, 'challenges.json');

if (!existsSync(DATA_DIR))        mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PLAN_FILE))       writeFileSync(PLAN_FILE,       'null');
if (!existsSync(LOGS_FILE))       writeFileSync(LOGS_FILE,       '[]');
if (!existsSync(PROFILE_FILE))    writeFileSync(PROFILE_FILE,    '{}');
if (!existsSync(CHALLENGES_FILE)) writeFileSync(CHALLENGES_FILE, '[]');

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are a corporate wellness consultant. Create short, scannable wellness challenge plans. Use tables and emoji. No prose paragraphs — every line must be a table row or a single bullet. Strict output: follow the template exactly, nothing extra.`;

const CHAT_SYSTEM = `You are Sage, a compassionate mental health and wellness companion. You provide warm, evidence-based support for stress, anxiety, mood, sleep, motivation, and emotional wellbeing. Keep responses conversational and concise (2–4 sentences). You are supportive but honest that you are an AI, not a licensed therapist.

Guidelines:
- Validate feelings before offering advice
- Offer 1–2 practical, actionable suggestions when helpful
- For crisis situations (self-harm, suicidal thoughts), always provide: 988 Suicide & Crisis Lifeline (call/text 988) and Crisis Text Line (text HOME to 741741)
- Never diagnose or prescribe medication
- Be warm, non-judgmental, and encouraging`;

const NUTRITION_CHAT_SYSTEM = `You are Nori, a knowledgeable and friendly nutrition coach. You provide practical, evidence-based guidance on healthy eating, meal planning, macronutrients, hydration, and sustainable food habits. Keep responses conversational and concise (2–4 sentences). You are helpful but honest that you are an AI, not a registered dietitian.

Guidelines:
- Give practical, actionable food and nutrition advice
- Focus on sustainable, balanced eating rather than fad diets or extreme restrictions
- For medical dietary needs (eating disorders, diabetes, food allergies, medical conditions), recommend consulting a registered dietitian or healthcare professional
- Be encouraging and completely non-judgmental about food choices and eating habits`;

const MARKETPLACE = [
  { id: 'weight-loss',      emoji: '⚖️',  title: 'Weight Loss Challenge',        description: 'A 30-day program combining daily movement, portion awareness, and mindful eating habits.',           tags: ['Fitness', 'Nutrition'],          duration: '30 days' },
  { id: 'stress-relief',    emoji: '🌿',  title: 'Stress Relief & Recovery',     description: 'Daily mindfulness sessions, breathing techniques, and science-backed stress-reduction habits.',    tags: ['Mental Health', 'Mindfulness'],   duration: '3 weeks' },
  { id: 'sleep-boost',      emoji: '😴',  title: 'Sleep Optimization Program',   description: 'Build a powerful sleep routine with proven wind-down rituals and sleep hygiene practices.',       tags: ['Sleep', 'Recovery'],             duration: '2 weeks' },
  { id: 'strength-fit',     emoji: '💪',  title: 'Strength & Endurance Builder', description: 'Progressive workout challenges designed to build strength, stamina, and athletic performance.',    tags: ['Fitness', 'Strength'],           duration: '6 weeks' },
  { id: 'mindfulness',      emoji: '🧘',  title: 'Mindfulness & Mental Clarity', description: 'Daily meditation, journaling, and mindfulness practices for focus and emotional balance.',         tags: ['Mental Health', 'Mindfulness'],   duration: '30 days' },
  { id: 'nutrition-reset',  emoji: '🥗',  title: 'Nutrition Reset',              description: 'Rebuild your relationship with food — clean eating habits, meal planning, and nutrition basics.',  tags: ['Nutrition', 'Health'],           duration: '4 weeks' },
  { id: 'steps-challenge',  emoji: '👟',  title: '10K Steps Daily Challenge',    description: 'A fun daily steps challenge with team leaderboards and weekly milestone rewards.',               tags: ['Fitness', 'Movement'],           duration: '30 days' },
  { id: 'team-connect',     emoji: '🤝',  title: 'Team Connection Challenge',    description: 'Wellness activities to strengthen team bonds, improve communication, and boost morale.',          tags: ['Social', 'Team'],                duration: '2 weeks' },
  { id: 'energy-boost',     emoji: '⚡',  title: 'All-Day Energy Program',       description: 'Optimize energy through better nutrition timing, movement breaks, and sleep hygiene habits.',     tags: ['Energy', 'Nutrition'],           duration: '3 weeks' },
  { id: 'heart-health',     emoji: '❤️', title: 'Heart Health Challenge',       description: 'Cardio habits, heart-healthy nutrition, and stress reduction for cardiovascular wellness.',        tags: ['Fitness', 'Heart Health'],       duration: '4 weeks' },
];

const MARKETPLACE_SYSTEM = `You are a corporate wellness program advisor. Given a user's goal in natural language and a catalog of programs, select the 2–3 best matches and explain why each fits.

Respond ONLY with valid JSON — no prose before or after:
{
  "intro": "1–2 warm sentences acknowledging the user's goals",
  "matches": [
    { "id": "<program-id>", "reason": "1 sentence explaining why this program fits their specific goal" }
  ]
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readLogs() {
  try { return JSON.parse(readFileSync(LOGS_FILE, 'utf8')); }
  catch { return []; }
}

function writeLogs(logs) {
  writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

function readChallenges() {
  try { return JSON.parse(readFileSync(CHALLENGES_FILE, 'utf8')); }
  catch { return []; }
}

function writeChallenges(challenges) {
  writeFileSync(CHALLENGES_FILE, JSON.stringify(challenges, null, 2));
}

function parseGoals(planText) {
  const goals = [];
  const sectionMatch = planText.match(/(?:Challenge Tracker|Daily Habit Tracker)([\s\S]*?)(?=\n## |$)/i);
  if (!sectionMatch) return goals;
  const section = sectionMatch[1];
  const rows = section.split('\n').filter(l =>
    l.startsWith('|') && !l.includes('---') && !/\|\s*#\s*\|/i.test(l)
  );
  rows.forEach((row, i) => {
    const cols = row.split('|').filter(c => c.trim()).map(c => c.trim());
    if (cols.length >= 3) {
      goals.push({
        id: i + 1,
        habit: cols[1].replace(/\*+/g, '').trim() || '',
        target: cols[2] || '',
        points: parseInt(cols[3].match(/\d+/)?.[0]) || 5,
      });
    }
  });
  return goals;
}

function parseChallengeName(planText) {
  const nameSection = planText.match(/##\s+[^\n]*Challenge Name[^\n]*\n+([^\n]+)/i);
  if (nameSection) {
    const line = nameSection[1].replace(/\*+/g, '').replace(/^One line:\s*/i, '').trim();
    const name = line.split(/\s*[—–-]\s*/)[0].trim();
    if (name.length >= 3 && name.length <= 80) return name;
  }
  const h1 = planText.match(/^#\s+(.+)$/m);
  if (h1) {
    const name = h1[1].replace(/[*_`#]/g, '').trim();
    if (name.length >= 3 && name.length <= 80) return name;
  }
  return planText.match(/\*\*([^*\n]{3,60})\*\*/)?.[1] || 'Wellness Challenge';
}

function durationToDays(duration) {
  if (/3\s*day/i.test(duration)) return 3;
  if (/2\s*week/i.test(duration)) return 14;
  return 7;
}

function computeLogTotals(logs) {
  return {
    water:   logs.filter(l=>l.type==='water').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
    steps:   logs.filter(l=>l.type==='steps').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
    active:  logs.filter(l=>l.cat==='physical'&&l.type!=='steps').reduce((s,l)=>s+(parseFloat(l.duration||l.value)||0),0),
    mindful: logs.filter(l=>['meditate','breathe','stretch'].includes(l.type)).reduce((s,l)=>s+(parseFloat(l.duration||l.value)||0),0),
    meals:   logs.filter(l=>['meal','snack'].includes(l.type)).length,
    sleep:   logs.filter(l=>l.type==='sleep').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
  };
}

function matchGoalToTotals(goal, totals) {
  const h = (goal.habit + ' ' + goal.target).toLowerCase();
  const targetNum = parseFloat(goal.target.replace(/,/g, '').match(/[\d.]+/)?.[0] || '0');
  if (/step|10[,.]?000/.test(h))                                             return { logged: totals.steps,   targetNum };
  if (/water|cup|glass|hydrat/.test(h))                                      return { logged: totals.water,   targetNum };
  if (/stretch|meditat|mindful|breath|yoga/.test(h))                         return { logged: totals.mindful, targetNum };
  if (/sleep|rest/.test(h))                                                  return { logged: totals.sleep,   targetNum };
  if (/meal|eat|food|healthy/.test(h))                                       return { logged: totals.meals,   targetNum };
  if (/walk|run|exercise|workout|active|physical|gym|commute|minute|min/.test(h)) return { logged: totals.active,  targetNum };
  return { logged: 0, targetNum };
}

function parseWeeklyMilestones(planText) {
  const weeks = [];
  const sectionMatch = planText.match(/Weekly Milestones([\s\S]*?)(?=\n## |$)/i);
  if (!sectionMatch) return weeks;
  const section = sectionMatch[1];
  const rows = section.split('\n').filter(l =>
    l.startsWith('|') && !l.includes('---') && !/\|\s*week\s*\|/i.test(l)
  );
  rows.forEach((row, i) => {
    const cols = row.split('|').filter(c => c.trim()).map(c => c.trim());
    if (cols.length >= 2) {
      weeks.push({ week: i + 1, theme: cols[1] || `Week ${i + 1}`, description: cols.slice(2).filter(Boolean).join(' · ') });
    }
  });
  return weeks;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json({ provider: PROVIDER, model: ACTIVE_MODEL });
});

app.post('/api/generate', async (req, res) => {
  const { teamSize, duration, wellnessFocus, engagementGoal } = req.body;
  if (!teamSize || !duration || !wellnessFocus || !engagementGoal) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const userPrompt = `Create a wellness challenge plan for:
- **Team:** ${teamSize} people · **Duration:** ${duration}
- **Focus:** ${wellnessFocus} · **Goal:** ${engagementGoal}

Output exactly these four sections. No extra sections, no prose paragraphs. Use plain text only — no LaTeX, no math notation, no $\text{...}$ or similar.

## 🏆 Challenge Name & Tagline
**Name** — *Tagline* (one line only)

## 📅 Weekly Milestones
| Week/Day | Theme | Key Activity | Team Challenge |
|----------|-------|--------------|----------------|
(one row per week or day; match the duration)

## ✅ Challenge Tracker
Exactly these 5 rows in order. Fill in a numeric target and plain numeric points (no emoji in Points column) suited to the challenge context.
| # | Habit | Daily Goal | Points |
|---|-------|------------|--------|
| 1 | Steps | [number] steps | [number] pts |
| 2 | Fitness | [number] min of activity | [number] pts |
| 3 | Hydration | [number] glasses of water | [number] pts |
| 4 | Sleep | [number] hrs of sleep | [number] pts |
| 5 | Calories | Log [number] meals | [number] pts |

## 🎁 Rewards
| 🥉 Bronze | 🥈 Silver | 🥇 Gold |
|-----------|----------|--------|
(one row — short reward ideas for each tier)`;

  try {
    if (PROVIDER === 'lmstudio') {
      const stream = await lmstudio.chat.completions.create({
        model: LM_MODEL, max_tokens: 1200, stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    } else {
      const stream = anthropic.messages.stream({
        model: CLAUDE_MODEL, max_tokens: 1200,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('Generation error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

app.post('/api/save-plan', (req, res) => {
  const { planText, startDate, duration, teamSize, wellnessFocus, engagementGoal } = req.body;
  if (!planText) return res.status(400).json({ error: 'Missing planText' });
  const goals = parseGoals(planText);
  const challengeName = parseChallengeName(planText);
  const sd   = startDate || new Date().toISOString().slice(0, 10);
  const days = durationToDays(duration || '1 week');
  const endD = new Date(sd + 'T00:00:00');
  endD.setDate(endD.getDate() + days - 1);
  const endDate = endD.toISOString().slice(0, 10);
  const now = new Date().toISOString();
  writeFileSync(PLAN_FILE, JSON.stringify({
    planText, goals, challengeName, savedAt: now,
    startDate: sd, duration: duration || '1 week', endDate,
  }, null, 2));

  const challenges = readChallenges();
  challenges.unshift({
    id: Date.now().toString(),
    createdAt: now,
    challengeName,
    planText,
    startDate: sd,
    duration: duration || '1 week',
    endDate,
    goals,
    teamSize: teamSize || null,
    wellnessFocus: wellnessFocus || null,
    engagementGoal: engagementGoal || null,
  });
  writeChallenges(challenges);

  res.json({ ok: true, goals });
});

app.get('/api/challenge-goals', (req, res) => {
  try {
    const plan = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
    res.json({
      goals: plan.goals || [],
      challengeName: plan.challengeName || 'Wellness Challenge',
      startDate: plan.startDate || null,
      endDate:   plan.endDate   || null,
      duration:  plan.duration  || null,
    });
  } catch {
    res.json({ goals: [], challengeName: null, startDate: null, endDate: null, duration: null });
  }
});

app.get('/api/challenge-progress', (req, res) => {
  try {
    const plan = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
    if (!plan.startDate || !plan.endDate) return res.json({ enrolled: false });

    const { startDate, endDate, goals = [], challengeName, duration } = plan;
    const allLogs = readLogs();
    const today   = new Date().toISOString().slice(0, 10);
    const start   = new Date(startDate + 'T00:00:00');
    const end     = new Date(endDate   + 'T00:00:00');
    const totalDays    = Math.round((end - start) / 86400000) + 1;
    const todayD       = new Date(today + 'T00:00:00');
    const daysElapsed  = Math.min(Math.max(Math.round((todayD - start) / 86400000) + 1, 0), totalDays);
    const daysRemaining = Math.max(totalDays - daysElapsed, 0);

    const challengeLogs = allLogs.filter(l => l.date >= startDate && l.date <= endDate);
    const goalDaysMet   = Object.fromEntries(goals.map(g => [g.id, 0]));
    let totalPoints = 0;
    const dayResults = [];

    for (let d = 0; d < Math.min(daysElapsed, totalDays); d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + d);
      const dateStr  = dt.toISOString().slice(0, 10);
      const dayLogs  = challengeLogs.filter(l => l.date === dateStr);
      const totals   = computeLogTotals(dayLogs);
      let dayPoints  = 0;
      const goalResults = goals.map(g => {
        const { logged, targetNum } = matchGoalToTotals(g, totals);
        const met = targetNum > 0 && logged >= targetNum;
        if (met) { dayPoints += g.points || 5; goalDaysMet[g.id]++; }
        return { id: g.id, met };
      });
      totalPoints += dayPoints;
      dayResults.push({ date: dateStr, points: dayPoints, goalResults });
    }

    const maxPointsPerDay       = goals.reduce((s, g) => s + (g.points || 5), 0);
    const totalPossibleGoalDays = goals.length * daysElapsed;
    const completedGoalDays     = Object.values(goalDaysMet).reduce((s, n) => s + n, 0);

    res.json({
      enrolled: true,
      challengeName, startDate, endDate, duration,
      totalDays, daysElapsed, daysRemaining,
      isActive:   today >= startDate && today <= endDate,
      isComplete: today > endDate,
      totalPoints,
      maxPoints: maxPointsPerDay * totalDays,
      completionPct: totalPossibleGoalDays > 0
        ? Math.round(completedGoalDays / totalPossibleGoalDays * 100)
        : 0,
      goalProgress: goals.map(g => ({
        id: g.id, daysMet: goalDaysMet[g.id] || 0, daysTracked: daysElapsed,
      })),
    });
  } catch (e) {
    console.error(e);
    res.json({ enrolled: false });
  }
});

app.post('/api/log', (req, res) => {
  const entry = {
    ...req.body,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
  };
  if (!entry.type || !entry.label) return res.status(400).json({ error: 'Missing type or label' });
  const logs = readLogs();
  logs.push(entry);
  writeLogs(logs);
  res.json({ ok: true, entry });
});

app.delete('/api/log/:id', (req, res) => {
  writeLogs(readLogs().filter(l => l.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/logs/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json({ logs: readLogs().filter(l => l.date === today) });
});

app.get('/api/logs/yesterday', (req, res) => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  res.json({ logs: readLogs().filter(l => l.date === yesterday) });
});

app.get('/api/profile', (req, res) => {
  try { res.json(JSON.parse(readFileSync(PROFILE_FILE, 'utf8'))); }
  catch { res.json({}); }
});

app.post('/api/profile', (req, res) => {
  const { name, age, height, weight } = req.body;
  writeFileSync(PROFILE_FILE, JSON.stringify({ name, age, height, weight, updatedAt: new Date().toISOString() }, null, 2));
  res.json({ ok: true });
});

app.get('/api/challenges', (req, res) => {
  const challenges = readChallenges();
  res.json({ challenges: challenges.map(({ planText, ...rest }) => rest) });
});

app.get('/api/challenges/:id', (req, res) => {
  const challenge = readChallenges().find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  res.json(challenge);
});

app.delete('/api/challenges/:id', (req, res) => {
  writeChallenges(readChallenges().filter(c => c.id !== req.params.id));
  res.json({ ok: true });
});

app.post('/api/challenges/:id/activate', (req, res) => {
  const challenge = readChallenges().find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  const sd = req.body.startDate || new Date().toISOString().slice(0, 10);
  const days = durationToDays(challenge.duration || '1 week');
  const endD = new Date(sd + 'T00:00:00');
  endD.setDate(endD.getDate() + days - 1);
  writeFileSync(PLAN_FILE, JSON.stringify({
    planText: challenge.planText,
    goals: challenge.goals,
    challengeName: challenge.challengeName,
    savedAt: new Date().toISOString(),
    startDate: sd,
    duration: challenge.duration || '1 week',
    endDate: endD.toISOString().slice(0, 10),
  }, null, 2));
  res.json({ ok: true });
});

app.post('/api/export-calendar', (req, res) => {
  const { planText, startDate, challengeName } = req.body;
  if (!planText || !startDate) return res.status(400).json({ error: 'Missing planText or startDate' });
  const weeks = parseWeeklyMilestones(planText);
  if (weeks.length === 0) return res.status(422).json({ error: 'Could not find weekly milestones in the plan.' });
  const ics = generateICS(weeks, startDate, challengeName || 'Wellness Challenge');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wellness-challenge.ics"');
  res.send(ics);
});

app.get('/api/marketplace', (req, res) => {
  res.json({ offerings: MARKETPLACE });
});

app.post('/api/marketplace-match', async (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'Missing goal' });

  const catalog = MARKETPLACE.map(p =>
    `ID: ${p.id} | ${p.title}: ${p.description} Tags: ${p.tags.join(', ')}`
  ).join('\n');
  const userMessage = `User goal: "${goal}"\n\nProgram catalog:\n${catalog}`;

  try {
    let text = '';
    if (PROVIDER === 'lmstudio') {
      const result = await lmstudio.chat.completions.create({
        model: LM_MODEL, max_tokens: 1024, stream: false,
        messages: [{ role: 'system', content: MARKETPLACE_SYSTEM }, { role: 'user', content: userMessage }],
      });
      text = result.choices[0]?.message?.content || '';
    } else {
      const result = await anthropic.messages.create({
        model: CLAUDE_MODEL, max_tokens: 1024,
        system: MARKETPLACE_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      });
      text = result.content[0]?.text || '';
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response');
    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      intro: parsed.intro || '',
      matches: (parsed.matches || [])
        .map(m => ({ ...MARKETPLACE.find(p => p.id === m.id), reason: m.reason }))
        .filter(m => m.id),
    });
  } catch (err) {
    console.error('Marketplace match error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages, chatType } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Missing messages' });
  const systemPrompt = chatType === 'nutrition' ? NUTRITION_CHAT_SYSTEM : CHAT_SYSTEM;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  try {
    if (PROVIDER === 'lmstudio') {
      const stream = await lmstudio.chat.completions.create({
        model: LM_MODEL, max_tokens: 1024, stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    } else {
      const stream = anthropic.messages.stream({
        model: CLAUDE_MODEL, max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('Chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

function generateICS(weeks, startDateStr, challengeName) {
  const [year, month, day] = startDateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const fmt = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('');
  const events = weeks.map(({ week, theme, description }) => {
    const s = new Date(start); s.setDate(start.getDate() + (week - 1) * 7);
    const e = new Date(s); e.setDate(s.getDate() + 7);
    const desc = (description || '').replace(/[,;\\]/g, ' ');
    return ['BEGIN:VEVENT', `DTSTART;VALUE=DATE:${fmt(s)}`, `DTEND;VALUE=DATE:${fmt(e)}`,
      `SUMMARY:${challengeName} – Week ${week}: ${theme}`, desc ? `DESCRIPTION:${desc}` : null,
      `UID:wellness-w${week}-${Date.now()}@wellness-builder`, 'END:VEVENT'].filter(Boolean).join('\r\n');
  });
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wellness Challenge Builder//EN',
    'CALSCALE:GREGORIAN','X-WR-CALNAME:Wellness Challenge',...events,'END:VCALENDAR'].join('\r\n');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌿 Wellness Challenge Builder`);
  console.log(`   Provider : ${PROVIDER}`);
  console.log(`   Model    : ${ACTIVE_MODEL}`);
  console.log(`   Running at http://localhost:${PORT}\n`);
});
