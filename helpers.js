export function parseGoals(planText) {
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
        points: parseInt(cols[3]?.match(/\d+/)?.[0]) || 5,
      });
    }
  });
  return goals;
}

export function parseChallengeName(planText) {
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

export function durationToDays(duration) {
  if (/3\s*day/i.test(duration)) return 3;
  if (/2\s*week/i.test(duration)) return 14;
  return 7;
}

export function computeLogTotals(logs) {
  return {
    water:   logs.filter(l=>l.type==='water').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
    steps:   logs.filter(l=>l.type==='steps').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
    active:  logs.filter(l=>l.cat==='physical'&&l.type!=='steps').reduce((s,l)=>s+(parseFloat(l.duration||l.value)||0),0),
    mindful: logs.filter(l=>['meditate','breathe','stretch'].includes(l.type)).reduce((s,l)=>s+(parseFloat(l.duration||l.value)||0),0),
    meals:   logs.filter(l=>['meal','snack'].includes(l.type)).length,
    sleep:   logs.filter(l=>l.type==='sleep').reduce((s,l)=>s+(parseFloat(l.value)||0),0),
  };
}

export function matchGoalToTotals(goal, totals) {
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

export function parseWeeklyMilestones(planText) {
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

function luhnCheck(numStr) {
  let sum = 0;
  let double = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let digit = Number(numStr[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isValidIPv4(ip) {
  return ip.split('.').every(o => Number(o) <= 255);
}

function redactCreditCards(text) {
  return text.replace(/\b(?:\d[ -]?){13,19}\b/g, match =>
    luhnCheck(match.replace(/[ -]/g, '')) ? '[REDACTED_CC]' : match
  );
}

function redactIPAddresses(text) {
  return text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, match =>
    isValidIPv4(match) ? '[REDACTED_IP]' : match
  );
}

export function redactPII(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  result = result.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
  result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
  result = result.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '[REDACTED_PHONE]');
  result = redactCreditCards(result);
  result = redactIPAddresses(result);
  result = result.replace(/\b(?:my name is|i'm|i am|this is|call me)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/gi,
    (m, name) => m.replace(name, '[REDACTED_NAME]'));
  return result;
}

export function maskMessages(messages) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
  return messages.map(m => {
    if (!m || typeof m !== 'object') throw new TypeError('invalid message entry');
    if (typeof m.content === 'string') {
      return { ...m, content: redactPII(m.content) };
    }
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map(block =>
          block?.type === 'text' ? { ...block, text: redactPII(block.text) } : block
        ),
      };
    }
    return m;
  });
}

export function generateICS(weeks, startDateStr, challengeName) {
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
