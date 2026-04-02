require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;
let OUTPUT_DIR = path.join(__dirname, '..', 'output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── In-memory session store (no cookie size limits) ──
const sessions = new Map();
const SESSION_COOKIE = 'dealdeci_sid';
const SESSION_TTL = 24 * 60 * 60 * 1000;

function sessionMiddleware(req, res, next) {
  let sid = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(SESSION_COOKIE + '='))?.split('=')[1];

  if (!sid || !sessions.has(sid)) {
    sid = crypto.randomBytes(24).toString('hex');
    sessions.set(sid, { _created: Date.now() });
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  }

  req.session = sessions.get(sid);
  req.sessionId = sid;

  // Touch TTL
  req.session._touched = Date.now();
  next();
}

// Cleanup expired sessions every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of sessions) {
    if (now - (sess._touched || sess._created || 0) > SESSION_TTL) sessions.delete(sid);
  }
}, 10 * 60 * 1000);

// ── Middleware ──
app.use(express.json({ limit: '50mb' }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// Serve output files for download
app.use('/output', express.static(OUTPUT_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Anthropic client ──
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ══════════════════════════════════════
// ── Local Auth + User Profiles ──
// ══════════════════════════════════════
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'dealdeci2026';
const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; }
}

function saveUserProfile(user) {
  const users = loadUsers();
  const existing = users.find(u => u.name === user.name);
  if (existing) {
    existing.lastLogin = new Date().toISOString();
    existing.loginCount = (existing.loginCount || 0) + 1;
  } else {
    users.push({ name: user.name, role: user.role, firstLogin: new Date().toISOString(), lastLogin: new Date().toISOString(), loginCount: 1 });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = { name: ADMIN_USER, role: 'admin' };
    saveUserProfile(req.session.user);
    return res.json({ ok: true, user: req.session.user });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/users', (req, res) => {
  res.json({ users: loadUsers() });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionId) sessions.delete(req.sessionId);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
});

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

// ══════════════════════════════════════
// ── File parsing ──
// ══════════════════════════════════════
async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return { text: buffer.toString('utf-8'), isPdf: false };
  }

  if (ext === '.pdf') {
    return { pdfBase64: buffer.toString('base64'), isPdf: true };
  }

  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, isPdf: false };
  }

  if (ext === '.pptx' || ext === '.ppt') {
    const text = await extractPptxText(buffer);
    return { text, isPdf: false };
  }

  return { text: buffer.toString('utf-8'), isPdf: false };
}

async function extractPptxText(buffer) {
  const entries = [];
  let pos = 0;
  const buf = buffer;

  while (pos < buf.length - 4) {
    if (buf.readUInt32LE(pos) !== 0x04034b50) break;
    const compMethod = buf.readUInt16LE(pos + 8);
    const compSize = buf.readUInt32LE(pos + 18);
    const uncompSize = buf.readUInt32LE(pos + 22);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const name = buf.toString('utf-8', pos + 30, pos + 30 + nameLen);
    const dataStart = pos + 30 + nameLen + extraLen;

    if (name.match(/ppt\/slides\/slide\d+\.xml$/)) {
      let data;
      if (compMethod === 0) {
        data = buf.slice(dataStart, dataStart + uncompSize);
      } else {
        try {
          const { inflateRawSync } = require('zlib');
          data = inflateRawSync(buf.slice(dataStart, dataStart + compSize));
        } catch {
          data = Buffer.alloc(0);
        }
      }
      entries.push({ name, data: data.toString('utf-8') });
    }
    pos = dataStart + compSize;
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] || '0');
    const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] || '0');
    return numA - numB;
  });

  const texts = entries.map((e, i) => {
    const clean = e.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return `[Slide ${i + 1}]\n${clean}`;
  });

  return texts.join('\n\n') || '(Could not extract text from presentation)';
}

// ══════════════════════════════════════
// ── JSON repair for truncated responses ──
// ══════════════════════════════════════
function repairJSON(str) {
  // Try progressively trimming from the end and closing brackets
  let s = str.trim();
  // Remove trailing incomplete string/value
  // Find last complete property by looking for last "}," or "}]"
  const attempts = [
    () => JSON.parse(s),
    () => JSON.parse(s + ']}]}'),
    () => JSON.parse(s + '"}]}]}'),
    () => JSON.parse(s + '"}]}'),
    () => JSON.parse(s + '"]]}'),
    () => JSON.parse(s + '"}}'),
    () => JSON.parse(s + '}'),
    () => {
      // Truncate to last complete array item
      const lastBrace = s.lastIndexOf('}');
      if (lastBrace > 0) {
        const trimmed = s.substring(0, lastBrace + 1);
        // Close any open arrays/objects
        const opens = (trimmed.match(/[\[{]/g) || []).length;
        const closes = (trimmed.match(/[\]}]/g) || []).length;
        let suffix = '';
        for (let i = 0; i < opens - closes; i++) {
          // Guess whether to close array or object
          suffix += trimmed.lastIndexOf('[') > trimmed.lastIndexOf('{') ? ']' : '}';
        }
        return JSON.parse(trimmed + suffix);
      }
      throw new Error('Cannot repair');
    },
  ];

  for (const attempt of attempts) {
    try {
      const result = attempt();
      // Ensure minimum structure
      if (!result.scores) result.scores = { overall: 0, market: 0, defensibility: 0, traction: 0 };
      if (!result.vulnerabilities) result.vulnerabilities = [];
      if (!result.questions) result.questions = [];
      if (!result.recommendations) result.recommendations = [];
      return result;
    } catch { /* try next */ }
  }

  // Last resort: return a minimal valid result
  console.error('JSON repair failed, returning minimal result. Raw length:', str.length);
  return {
    scores: { overall: 0, market: 0, defensibility: 0, traction: 0 },
    vulnerabilities: [{ severity: 'MEDIUM', title: 'Analysis incomplete', description: 'The AI response was truncated. Try again or reduce the number of agents.' }],
    questions: [],
    recommendations: [],
  };
}

// ══════════════════════════════════════
// ── Persona definitions ──
// ══════════════════════════════════════
const PERSONAS = {
  'silicon-valley': {
    label: 'Silicon Valley VC',
    icon: 'rocket',
    instruction: 'You are a ruthless Silicon Valley VC partner at a top-tier fund (Sequoia/a16z caliber). You care about 10x market size, defensible moats, network effects, and whether this can become a billion-dollar company. You dismiss anything regional or small. You interrupt with sharp questions and have zero patience for hand-waving. You want to see a path to $100M ARR.',
  },
  'southeast-angel': {
    label: 'Southeast Angel',
    icon: 'handshake',
    instruction: 'You are a Southeast US angel investor. You value community impact, conservative financials, real relationships, and sustainable growth. You are skeptical of Silicon Valley buzzwords. You want to know the founder personally and whether the business can survive without constant outside capital.',
  },
  'university-vc': {
    label: 'University Judge',
    icon: 'graduation-cap',
    instruction: 'You are a university business competition judge with a PhD in management. You demand methodological rigor, validated assumptions, cited market data, and evidence of customer discovery. You are polite but forensically precise and will expose every assumption that has not been tested.',
  },
  'traditional-business': {
    label: 'Traditional Businessman',
    icon: 'briefcase',
    instruction: 'You are a 70-year-old self-made businessman who built a company through hard work and no outside funding. You are skeptical of AI, tech jargon, and anything you cannot touch or understand. You want to know: does it work, does anyone pay for it, and why should I trust you.',
  },
  'impact-investor': {
    label: 'Impact Investor',
    icon: 'globe',
    instruction: 'You are an impact investor managing a $500M fund. You care about mission alignment, community benefit, environmental footprint, and whether this business makes the world genuinely better. You will probe hard on whether impact is core to the model or just marketing. You score ESG rigor and theory of change.',
  },
  'serial-founder': {
    label: 'Serial Founder / Operator',
    icon: 'bolt',
    instruction: 'You are a serial founder who has built and exited two companies (one acqui-hire, one $50M+ exit). You care about team strength, operational execution, customer acquisition cost, and what happens when things go wrong. You ask hard questions about the founder\'s ability to execute solo and spot every over-optimistic assumption.',
  },
  'corporate-vc': {
    label: 'Corporate VC (CVC)',
    icon: 'building',
    instruction: 'You are head of corporate venture at a Fortune 500 company. You evaluate deals based on strategic fit with your parent company\'s ecosystem, technology synergies, and partnership potential. You care about IP, integration complexity, and whether this startup could become a vendor, partner, or acquisition target. You are slow-moving and political but write big checks.',
  },
  'pe-growth': {
    label: 'PE / Growth Equity',
    icon: 'chart',
    instruction: 'You are a growth equity partner at a private equity firm. You only invest in companies with proven revenue ($5M+ ARR), positive unit economics, and a clear path to profitability. You scrutinize burn rate, LTV:CAC ratio, gross margins, and customer retention. You have zero tolerance for "we\'ll figure out monetization later." You model every deal to a 5-year exit.',
  },
  'deep-tech': {
    label: 'Deep Tech Investor',
    icon: 'microscope',
    instruction: 'You are a deep tech investor who backs hard science and engineering breakthroughs. You care about technical differentiation, patent portfolio, PhD-level talent, and whether the science actually works. You are patient with timelines but ruthless about technical claims — you will demand evidence for every assertion about novelty or performance. You despise "AI wrapper" companies.',
  },
  'family-office': {
    label: 'Family Office',
    icon: 'shield',
    instruction: 'You represent a multi-generational family office with $2B AUM. You care about capital preservation, downside protection, steady cash flow, and legacy alignment. You are skeptical of high-risk bets and want to understand worst-case scenarios. You ask about governance, founder integrity, and alignment of interests. You invest slowly and relationally.',
  },
  'emerging-market': {
    label: 'Emerging Markets VC',
    icon: 'map',
    instruction: 'You invest in startups targeting emerging markets (Africa, Southeast Asia, Latin America, India). You care about local market dynamics, distribution partnerships, regulatory navigation, and unit economics that work at lower price points. You probe whether the team understands on-the-ground realities or is just projecting Western models onto different markets.',
  },
  'fintech-specialist': {
    label: 'Fintech Specialist',
    icon: 'bank',
    instruction: 'You are a fintech-focused VC partner. You evaluate regulatory risk, compliance frameworks, banking partnerships, and money transmission licensing. You care about trust, security architecture, fraud prevention, and whether the team has financial services experience. You will grill founders on their regulatory strategy and ask about specific compliance requirements.',
  },
};

// ══════════════════════════════════════
// ── Analyze: run personas in parallel ──
// ══════════════════════════════════════
app.post('/api/analyze', requireAuth, upload.single('deck'), async (req, res) => {
  try {
    const file = req.file;
    const context = req.body.context || '';

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    let clientSettings = {};
    try { clientSettings = JSON.parse(req.body.settings || '{}'); } catch {}
    const model = clientSettings.model || 'claude-haiku-4-5-20251001';
    const depth = clientSettings.depth || 'standard';
    const strictness = clientSettings.strictness || 'balanced';
    const enabledPersonas = clientSettings.enabledPersonas || Object.keys(PERSONAS);

    const depthConfig = {
      light: { vulns: '3-4', questions: '3-4', recs: 3, maxTokens: 4000 },
      standard: { vulns: '4-6', questions: '5-7', recs: 5, maxTokens: 6000 },
      deep: { vulns: '6-8', questions: '8-10', recs: 5, maxTokens: 8000 },
    }[depth] || { vulns: '4-6', questions: '5-7', recs: 5, maxTokens: 6000 };

    const strictnessNote = {
      lenient: 'Be encouraging and constructive. Give credit for potential. Score generously where intent is clear even if execution is weak.',
      balanced: 'Score ruthlessly but fairly.',
      brutal: 'Be extremely harsh. Assume everything will fail. Give no benefit of the doubt. Score as if your own money is at stake.',
    }[strictness] || 'Score ruthlessly but fairly.';

    const parsed = await extractText(file.buffer, file.originalname);

    function buildMessages(personaKey) {
      const persona = PERSONAS[personaKey];
      const systemPrompt = `You are The Conductor — an adversarial AI simulation engine for DealDeci Pitch Decimator. Your role is to brutally but constructively stress-test startup pitches.

Investor Persona: ${persona.label}
Persona Instructions: ${persona.instruction}

Scoring approach: ${strictnessNote}

Return ONLY valid JSON — no preamble, no explanation, no markdown fences:
{
  "scores": { "overall": <0-100>, "market": <0-100>, "defensibility": <0-100>, "traction": <0-100> },
  "vulnerabilities": [{ "severity": "CRITICAL"|"HIGH"|"MEDIUM", "title": "<short>", "description": "<2-3 sentences from this investor's perspective>" }],
  "questions": [{ "question": "<adversarial question>", "response": "<suggested 3-5 sentence response>" }],
  "recommendations": [{ "title": "<short slide/section change>", "description": "<specific change to make IN THE PITCH DECK — which slide to edit, what text to rewrite, what data to add, what visual to include. Must be about the deck content itself, NOT general business advice like hiring or strategy.>" }]
}

Return exactly ${depthConfig.vulns} vulnerabilities, ${depthConfig.questions} questions, and exactly ${depthConfig.recs} recommendations.
CRITICAL: Recommendations MUST be about improving the PITCH DECK MATERIAL ONLY — which slide to edit, what text to rewrite, what data/chart to add, how to restructure the narrative. Do NOT give general business advice like "hire a lawyer" or "build partnerships".
CRITICAL: Your entire response must be valid JSON. Do not truncate. Keep descriptions concise (1-2 sentences max) to fit within limits.`;

      const userContent = [];
      if (parsed.isPdf) {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: parsed.pdfBase64 },
        });
      }
      userContent.push({
        type: 'text',
        text: `Analyze this pitch and return the JSON decimation report.

${!parsed.isPdf ? 'PITCH CONTENT:\n' + (parsed.text || '(No text extracted)') : '(Pitch deck attached as PDF above)'}

${context ? 'ADDITIONAL CONTEXT FROM FOUNDER:\n' + context : ''}

Remember: respond ONLY with valid JSON.`,
      });

      return { system: systemPrompt, messages: [{ role: 'user', content: userContent }] };
    }

    const personaKeys = enabledPersonas.filter(k => PERSONAS[k]);
    const results = await Promise.allSettled(
      personaKeys.map(async (key) => {
        const { system, messages } = buildMessages(key);
        const response = await anthropic.messages.create({
          model,
          max_tokens: depthConfig.maxTokens,
          system,
          messages,
        });

        const raw = response.content.find((b) => b.type === 'text')?.text || '';
        const clean = raw.replace(/```json|```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(clean);
        } catch {
          // Attempt to repair truncated JSON
          parsed = repairJSON(clean);
        }
        return { persona: key, label: PERSONAS[key].label, icon: PERSONAS[key].icon, data: parsed };
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.filter((r) => r.status === 'rejected').map((r, i) => ({ persona: personaKeys[i], error: r.reason?.message }));

    if (req.session) {
      req.session.lastPitchText = parsed.isPdf ? '(PDF document)' : (parsed.text || '').slice(0, 15000);
      req.session.lastResults = successful;
      req.session.originalFileName = file.originalname;
      req.session.originalFileExt = path.extname(file.originalname).toLowerCase();
    }

    // Persist run to history
    const avgScore = successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + (r.data?.scores?.overall || 0), 0) / successful.length)
      : 0;
    saveRun({
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: new Date().toISOString(),
      user: req.session?.user?.name || 'unknown',
      fileName: file.originalname,
      agents: successful.length,
      agentsFailed: failed.length,
      avgScore,
      scores: successful.length > 0 ? {
        overall: avgScore,
        market: Math.round(successful.reduce((s, r) => s + (r.data?.scores?.market || 0), 0) / successful.length),
        defensibility: Math.round(successful.reduce((s, r) => s + (r.data?.scores?.defensibility || 0), 0) / successful.length),
        traction: Math.round(successful.reduce((s, r) => s + (r.data?.scores?.traction || 0), 0) / successful.length),
      } : null,
    });

    res.json({ results: successful, errors: failed });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// ── Enhance pitch ──
// ══════════════════════════════════════
app.post('/api/enhance', requireAuth, async (req, res) => {
  try {
    const { pitchText, feedback } = req.body;
    const lastResults = req.session?.lastResults || [];
    if (lastResults.length === 0) return res.status(400).json({ error: 'No analysis results yet. Run an analysis first.' });

    const feedbackSummary = lastResults.map((r) => {
      const vulns = (r.data.vulnerabilities || []).map((v) => `- [${v.severity}] ${v.title}: ${v.description}`).join('\n');
      return `## ${r.label} (Score: ${r.data.scores.overall}/100)\nVulnerabilities:\n${vulns}`;
    }).join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: `You are a pitch deck strategist for DealDeci. Your job is to take investor feedback and produce an improved version of the pitch narrative. Be specific, actionable, and maintain the founder's voice. Return a JSON object:
{
  "summary": "<2-3 sentence overview of changes>",
  "sections": [
    { "title": "<section name>", "original": "<what was weak>", "improved": "<improved text>", "rationale": "<why this is better>" }
  ],
  "enhancedPitch": "<the full improved pitch narrative, formatted with markdown>"
}
Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Here is the original pitch:\n\n${pitchText || req.session?.lastPitchText || '(not available)'}\n\nHere is the combined feedback from all investor personas:\n\n${feedbackSummary}\n\n${feedback ? 'Additional founder notes: ' + feedback : ''}\n\nGenerate the enhanced pitch.`,
      }],
    });

    const raw = response.content.find((b) => b.type === 'text')?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (req.session) {
      req.session.enhancedPitch = parsed.enhancedPitch;
    }

    res.json(parsed);
  } catch (err) {
    console.error('Enhance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// ── Apply recommendations → versioned slide/page ──
// ══════════════════════════════════════
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');

app.post('/api/apply-recommendation', requireAuth, async (req, res) => {
  try {
    const { recommendation, persona } = req.body;
    const pitchText = req.session?.lastPitchText || '';
    if (!pitchText || pitchText === '(PDF document)') {
      return res.status(400).json({ error: 'Original pitch text not available for rewriting.' });
    }
    if (!recommendation) return res.status(400).json({ error: 'No recommendation provided.' });

    const originalExt = req.session?.originalFileExt || '.pptx';
    const originalName = req.session?.originalFileName || 'pitch';
    const isPptx = ['.pptx', '.ppt'].includes(originalExt);
    const isDocx = ['.docx', '.doc'].includes(originalExt);

    // Prompt: generate ONLY the single affected slide or page content
    const formatInstruction = isPptx
      ? `Generate ONLY the content for ONE replacement slide. Format as:
SLIDE TITLE: <title>
BULLET 1: <point>
BULLET 2: <point>
BULLET 3: <point>
BULLET 4: <point>
SPEAKER NOTES: <brief notes>

Do NOT rewrite the full deck. Output ONLY this one slide.`
      : `Generate ONLY the content for ONE replacement page/section. Format as:
SECTION HEADING: <heading>
BODY: <1-2 paragraphs of improved content for this specific section>

Do NOT rewrite the full document. Output ONLY this one section.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: `You are a pitch deck content editor for DealDeci. You apply a single recommendation by generating ONLY the specific slide or page that needs to change. Do NOT rewrite the full pitch.\n\n${formatInstruction}`,
      messages: [{
        role: 'user',
        content: `Original pitch content:\n\n${pitchText}\n\nRecommendation from ${persona}:\n${recommendation.title}: ${recommendation.description}\n\nGenerate ONLY the single updated slide/page.`,
      }],
    });

    const revised = response.content.find((b) => b.type === 'text')?.text || '';

    // Determine version number
    const versionFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.match(/DealDeci_Revised_V\d+/));
    const version = Math.floor(versionFiles.length / 1) + 1; // count unique versions
    const baseName = `DealDeci_Revised_V${version}`;
    const savedFiles = [];

    if (isPptx) {
      // Save as PPTX (single slide)
      const pptxFile = await generatePptxSlide(revised, recommendation, persona, version);
      const pptxPath = path.join(OUTPUT_DIR, `${baseName}.pptx`);
      fs.writeFileSync(pptxPath, pptxFile);
      savedFiles.push({ name: `${baseName}.pptx`, url: `/output/${baseName}.pptx` });
    }

    if (isDocx || !isPptx) {
      // Save as DOCX (single page)
      const docxFile = await generateDocxPage(revised, recommendation, persona, version);
      const docxPath = path.join(OUTPUT_DIR, `${baseName}.docx`);
      fs.writeFileSync(docxPath, docxFile);
      savedFiles.push({ name: `${baseName}.docx`, url: `/output/${baseName}.docx` });
    }

    res.json({
      ok: true,
      version,
      folder: OUTPUT_DIR,
      format: isPptx ? 'pptx' : 'docx',
      files: savedFiles,
    });
  } catch (err) {
    console.error('Apply recommendation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate a single PPTX slide
async function generatePptxSlide(content, recommendation, persona, version) {
  // Use a minimal PPTX structure via the docx-like approach
  // Since 'pptx' npm packages are heavy, generate a clean DOCX labeled as a slide
  // For true PPTX, we'd need pptxgenjs — let's use a lightweight approach
  // Actually let's install and use a simple PPTX builder inline

  // Parse the AI output
  const lines = content.split('\n').filter(l => l.trim());
  let title = `Revised Slide — V${version}`;
  const bullets = [];
  let notes = '';

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('SLIDE TITLE:')) title = l.replace('SLIDE TITLE:', '').trim();
    else if (l.match(/^BULLET\s*\d*:/i)) bullets.push(l.replace(/^BULLET\s*\d*:/i, '').trim());
    else if (l.startsWith('SPEAKER NOTES:')) notes = l.replace('SPEAKER NOTES:', '').trim();
    else if (l && !l.startsWith('---')) bullets.push(l);
  }

  // Generate as DOCX with slide-like formatting (1 page, large title, bullets)
  const doc = new Document({
    sections: [{
      properties: {
        page: { size: { width: 13.33 * 72 * 20, height: 7.5 * 72 * 20, orientation: 'landscape' } },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 56, color: 'CE1126', font: 'Calibri' })],
          spacing: { after: 400 },
          alignment: AlignmentType.LEFT,
        }),
        new Paragraph({
          children: [new TextRun({ text: `${persona} — Recommendation Applied`, size: 20, color: '666666', italics: true, font: 'Calibri' })],
          spacing: { after: 300 },
        }),
        ...bullets.map(b => new Paragraph({
          children: [new TextRun({ text: `\u2022  ${b}`, size: 28, color: '14213D', font: 'Calibri' })],
          spacing: { after: 200 },
          indent: { left: 400 },
        })),
        ...(notes ? [
          new Paragraph({ spacing: { before: 600 } }),
          new Paragraph({
            children: [new TextRun({ text: 'Speaker Notes: ', bold: true, size: 18, color: '999999', font: 'Calibri' }), new TextRun({ text: notes, size: 18, color: '999999', font: 'Calibri' })],
            border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
            spacing: { before: 200 },
          }),
        ] : []),
        new Paragraph({
          children: [new TextRun({ text: `Copyright \u00A9 ${new Date().getFullYear()} DealDeci LLC`, size: 14, color: 'AAAAAA', font: 'Calibri' })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 600 },
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// Generate a single DOCX page
async function generateDocxPage(content, recommendation, persona, version) {
  const lines = content.split('\n').filter(l => l.trim());
  let heading = `Revised Section — V${version}`;
  const bodyLines = [];

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('SECTION HEADING:')) heading = l.replace('SECTION HEADING:', '').trim();
    else if (l.startsWith('BODY:')) bodyLines.push(l.replace('BODY:', '').trim());
    else if (l && !l.startsWith('---')) bodyLines.push(l);
  }

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: heading, bold: true, size: 36, color: 'CE1126', font: 'Calibri' })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Applied recommendation from ${persona}`, size: 20, color: '666666', italics: true, font: 'Calibri' })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `"${recommendation.title}: ${recommendation.description}"`, size: 20, color: '14213D', font: 'Calibri' })],
          spacing: { after: 400 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'CE1126', space: 10 } },
          indent: { left: 200 },
        }),
        ...bodyLines.map(line => new Paragraph({
          children: [new TextRun({ text: line, size: 24, color: '333333', font: 'Calibri' })],
          spacing: { after: 200 },
        })),
        new Paragraph({
          children: [new TextRun({ text: `Copyright \u00A9 ${new Date().getFullYear()} DealDeci LLC. Confidential.`, size: 16, color: 'AAAAAA', font: 'Calibri' })],
          alignment: AlignmentType.RIGHT,
          spacing: { before: 800 },
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}

// ══════════════════════════════════════
// ── Save to local output folder ──
// ══════════════════════════════════════
app.post('/api/save', requireAuth, (req, res) => {
  try {
    const content = req.body.content || req.session?.enhancedPitch || '';
    if (!content) return res.status(400).json({ error: 'No enhanced pitch to save.' });

    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const baseName = `DealDeci_Enhanced_Pitch_${date}`;

    // Save HTML version
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${baseName}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a2e; line-height: 1.7; }
  h1 { color: #E8523A; border-bottom: 2px solid #E8523A; padding-bottom: 10px; }
  h2 { color: #1E2761; margin-top: 24px; }
  p { margin: 8px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
</style></head><body>
<h1>Enhanced Pitch Deck</h1>
<p style="color:#666;font-size:14px;">Generated by DealDeci Pitch Decimator AI &mdash; ${date}</p>
${content.replace(/\n/g, '<br>')}
<div class="footer">&copy; ${new Date().getFullYear()} DealDeci LLC. Confidential.</div>
</body></html>`;

    const htmlPath = path.join(OUTPUT_DIR, `${baseName}.html`);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    // Save TXT version
    const plain = content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
    const txtPath = path.join(OUTPUT_DIR, `${baseName}.txt`);
    fs.writeFileSync(txtPath, `DealDeci Enhanced Pitch\n${'='.repeat(40)}\n\n${plain}\n\n---\n(c) ${new Date().getFullYear()} DealDeci LLC. Confidential.`, 'utf-8');

    res.json({
      ok: true,
      files: [
        { name: `${baseName}.html`, url: `/output/${baseName}.html` },
        { name: `${baseName}.txt`,  url: `/output/${baseName}.txt` },
      ],
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── List saved files ──
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('DealDeci_'))
      .sort()
      .reverse()
      .map(f => ({
        name: f,
        url: `/output/${f}`,
        size: fs.statSync(path.join(OUTPUT_DIR, f)).size,
        created: fs.statSync(path.join(OUTPUT_DIR, f)).birthtime,
      }));
    res.json({ files });
  } catch (err) {
    res.json({ files: [] });
  }
});

// ── Download enhanced pitch ──
app.get('/api/download', requireAuth, (req, res) => {
  const content = req.session?.enhancedPitch || '';
  if (!content) return res.status(404).json({ error: 'No enhanced pitch available. Run enhancement first.' });

  const format = req.query.format || 'html';
  const date = new Date().toISOString().split('T')[0];

  if (format === 'html') {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DealDeci Enhanced Pitch - ${date}</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a2e; line-height: 1.7; }
  h1 { color: #E8523A; border-bottom: 2px solid #E8523A; padding-bottom: 10px; }
  h2 { color: #1E2761; margin-top: 24px; }
  p { margin: 8px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
</style></head><body>
<h1>Enhanced Pitch Deck</h1>
<p style="color:#666;font-size:14px;">Generated by DealDeci Pitch Decimator AI &mdash; ${date}</p>
${content.replace(/\n/g, '<br>')}
<div class="footer">&copy; ${new Date().getFullYear()} DealDeci LLC. Confidential.</div>
</body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="DealDeci_Enhanced_Pitch_${date}.html"`);
    res.send(html);
  } else if (format === 'txt') {
    const plain = content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="DealDeci_Enhanced_Pitch_${date}.txt"`);
    res.send(`DealDeci Enhanced Pitch - ${date}\n${'='.repeat(40)}\n\n${plain}\n\n---\n(c) ${new Date().getFullYear()} DealDeci LLC. Confidential.`);
  } else {
    res.status(400).json({ error: 'Supported formats: html, txt' });
  }
});

// ── Save folder management ──
app.get('/api/save-folder', (req, res) => {
  res.json({ folder: OUTPUT_DIR });
});

app.post('/api/save-folder', requireAuth, (req, res) => {
  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'No folder path provided.' });

  const resolved = path.resolve(folder);
  try {
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
    // Verify it's writable
    const testFile = path.join(resolved, '.dealdeci-test');
    fs.writeFileSync(testFile, 'test', 'utf-8');
    fs.unlinkSync(testFile);

    OUTPUT_DIR = resolved;
    // Re-mount static serving for new folder
    app.use('/output', express.static(OUTPUT_DIR));
    res.json({ folder: OUTPUT_DIR });
  } catch (err) {
    res.status(400).json({ error: `Cannot write to folder: ${err.message}` });
  }
});

// ══════════════════════════════════════
// ── Run history (persisted to JSON file) ──
// ══════════════════════════════════════
const RUNS_FILE = path.join(__dirname, '..', 'runs.json');

function loadRuns() {
  try { return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf-8')); } catch { return []; }
}

function saveRun(run) {
  const runs = loadRuns();
  runs.unshift(run);
  // Keep last 100 runs
  if (runs.length > 100) runs.length = 100;
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2), 'utf-8');
}

app.get('/api/runs', (req, res) => {
  res.json({ runs: loadRuns() });
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── SPA fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DealDeci server running on http://localhost:${PORT}`);
});
