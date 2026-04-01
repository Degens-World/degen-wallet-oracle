/* ──────────────────────────────────────────────
   Degen Wallet Oracle — App Logic
   Queries Ergo Explorer API, scores the wallet,
   and generates a deterministic oracle prophecy.
   ────────────────────────────────────────────── */

const EXPLORER_BASE = 'https://api.ergoplatform.com/api/v1';

// ── Star field ────────────────────────────────
(function spawnStars() {
  const container = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      top:${Math.random() * 100}%; left:${Math.random() * 100}%;
      --d:${(Math.random() * 4 + 2).toFixed(1)}s;
      animation-delay:${(Math.random() * 5).toFixed(1)}s;
      opacity:${Math.random() * 0.5 + 0.1};
    `;
    container.appendChild(s);
  }
})();

// ── UI helpers ────────────────────────────────
function show(id)  { document.getElementById(id).classList.remove('hidden'); }
function hide(id)  { document.getElementById(id).classList.add('hidden'); }
function setText(id, txt) { document.getElementById(id).textContent = txt; }
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError() { document.getElementById('errorMsg').classList.add('hidden'); }

// ── Keyboard submit ───────────────────────────
document.getElementById('walletInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyzeWallet();
});

// ── Main entry ────────────────────────────────
async function analyzeWallet() {
  const addr = document.getElementById('walletInput').value.trim();
  clearError();
  hide('resultSection');

  if (!addr) { showError('Please enter an Ergo wallet address.'); return; }
  if (addr.length < 40) { showError('That doesn\'t look like a valid Ergo address.'); return; }

  document.getElementById('analyzeBtn').disabled = true;
  show('loadingSection');

  try {
    const [balanceData, txData] = await Promise.all([
      fetchJSON(`${EXPLORER_BASE}/addresses/${addr}/balance/confirmed`),
      fetchJSON(`${EXPLORER_BASE}/addresses/${addr}/transactions?limit=50&offset=0`)
    ]);

    const result = score(addr, balanceData, txData);
    render(result);
  } catch (err) {
    hide('loadingSection');
    showError(`Oracle failed to connect: ${err.message}`);
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
  }
}

// ── Fetch wrapper ─────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer API returned ${res.status}`);
  return res.json();
}

// ── Scoring engine ────────────────────────────
function score(addr, balance, txData) {
  const nanoErg     = balance?.nanoErgs ?? 0;
  const ergBalance  = nanoErg / 1e9;
  const tokens      = balance?.tokens ?? [];
  const txItems     = txData?.items ?? [];
  const txCount     = txData?.total ?? txItems.length;

  // Raw signals
  const signals = {
    ergBalance,
    tokenCount:  tokens.length,
    txCount,
    hasNFTs:     tokens.some(t => t.decimals === 0 && (t.amount ?? 0) === 1),
    hasManyTokens: tokens.length >= 10,
    isWhale:     ergBalance >= 10000,
    isMidBag:    ergBalance >= 500 && ergBalance < 10000,
    isPoor:      ergBalance < 10,
    isFrenzied:  txCount >= 200,
    isActive:    txCount >= 30,
    isDormant:   txCount < 5,
    // Micro randomness seeded by address chars for determinism
    seed:        addrSeed(addr),
  };

  // Score formula (0–100)
  let pts = 0;
  pts += Math.min(txCount / 5, 20);           // up to 20 pts for activity
  pts += Math.min(tokens.length * 1.5, 20);   // up to 20 pts for token diversity
  if (signals.hasNFTs)       pts += 10;
  if (signals.isWhale)       pts += 15;
  else if (signals.isMidBag) pts += 8;
  if (signals.isFrenzied)    pts += 10;
  if (signals.hasManyTokens) pts += 5;
  pts += (signals.seed % 10);                 // 0–9 pts of "chaos"

  const degenScore = Math.round(Math.min(pts, 100));

  // Rank
  let rank, rankEmoji;
  if (degenScore >= 85)      { rank = 'Ultra Degen';   rankEmoji = '💀'; }
  else if (degenScore >= 65) { rank = 'Full Degen';    rankEmoji = '🎰'; }
  else if (degenScore >= 45) { rank = 'Mid Degen';     rankEmoji = '🦍'; }
  else if (degenScore >= 25) { rank = 'Normie Degen';  rankEmoji = '🐸'; }
  else                       { rank = 'Paper Hands';   rankEmoji = '🧻'; }

  // Traits
  const traits = buildTraits(signals, degenScore);

  // Oracle prophecy (deterministic from score + seed)
  const prophecy = buildProphecy(degenScore, signals);

  return { ergBalance, tokenCount: tokens.length, txCount, degenScore, rank, rankEmoji, traits, prophecy };
}

// ── Trait generator ───────────────────────────
function buildTraits(s, score) {
  const t = [];
  if (s.isFrenzied)    t.push({ label: '🔥 TX Fiend',      cls: 'pink'   });
  if (s.isActive)      t.push({ label: '⚡ Chain Surfer',   cls: ''       });
  if (s.isDormant)     t.push({ label: '💤 Diamond Hands',  cls: 'green'  });
  if (s.isWhale)       t.push({ label: '🐳 Whale Alert',    cls: 'gold'   });
  if (s.isMidBag)      t.push({ label: '💼 Mid-Tier Bag',   cls: 'gold'   });
  if (s.isPoor)        t.push({ label: '💸 Running on Fumes', cls: ''     });
  if (s.hasNFTs)       t.push({ label: '🖼️ NFT Goblin',     cls: 'purple' });
  if (s.hasManyTokens) t.push({ label: '🎲 Token Hoarder',  cls: 'pink'   });
  if (score >= 85)     t.push({ label: '👑 Certified Degen', cls: 'gold'  });
  if (s.seed % 3 === 0) t.push({ label: '🌀 Chaos Agent',   cls: 'pink'  });
  if (t.length === 0)  t.push({ label: '🥚 Lurker',         cls: ''       });
  return t;
}

// ── Oracle prophecy ───────────────────────────
const PROPHECIES_HIGH = [
  "The blockchain spirits see you buying the dip at 3 AM again. This time it actually pumps.",
  "Your wallet shall multiply — but only after one more absolutely savage rug pull. Stay strong.",
  "Ergo is just getting started. Your chaos energy is perfectly aligned with the protocol's destiny.",
  "The oracle sees green candles in your future, though the path is paved with rekt noobs.",
  "You will hodl through the storm. The rewards will be legendary. The losses will be a story you tell.",
];
const PROPHECIES_MID = [
  "You are neither fully cooked nor fully raw. The degen path awaits — if you dare accumulate.",
  "The oracle senses potential, but also a suspicious amount of normie behavior. Commit harder.",
  "Your wallet whispers 'more tokens' while your portfolio screams 'diversify.' Classic.",
  "Mid-tier energy detected. The next bull cycle will either make you a whale or a meme.",
  "The oracle sees you refreshing the price chart every 4 minutes. This is not a judgment. This is a diagnosis.",
];
const PROPHECIES_LOW = [
  "Paper hands have been detected. The spirits weep, but also kind of understand.",
  "You hold barely enough ERG to pay transaction fees. The oracle respects the commitment.",
  "Few transactions. Few tokens. Much potential. Or much cope. The oracle cannot tell.",
  "The blockchain remembers everyone who sold at the bottom. Your name is not yet among them. Keep it that way.",
  "A dormant wallet is just a sleeping giant. Or a forgotten seed phrase. The oracle prays for the former.",
];

function buildProphecy(score, s) {
  const pool = score >= 60 ? PROPHECIES_HIGH : score >= 30 ? PROPHECIES_MID : PROPHECIES_LOW;
  return pool[s.seed % pool.length];
}

// ── Address seed (simple hash) ────────────────
function addrSeed(addr) {
  let h = 0;
  for (let i = 0; i < addr.length; i++) {
    h = (Math.imul(31, h) + addr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Render ────────────────────────────────────
function render(r) {
  hide('loadingSection');

  // Score
  setText('scoreValue', r.degenScore);
  setText('scoreRank', `${r.rankEmoji} ${r.rank}`);
  setTimeout(() => {
    document.getElementById('scoreBar').style.width = `${r.degenScore}%`;
  }, 80);

  // Stats
  const statsGrid = document.getElementById('statsGrid');
  statsGrid.innerHTML = '';
  const stats = [
    { label: 'ERG Balance', value: formatErg(r.ergBalance), cls: 'gold'   },
    { label: 'Tokens',      value: r.tokenCount,            cls: 'purple' },
    { label: 'Transactions', value: r.txCount.toLocaleString(), cls: 'green' },
    { label: 'Degen Score', value: `${r.degenScore} / 100`, cls: 'pink'  },
  ];
  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-label">${s.label}</div><div class="stat-value ${s.cls}">${s.value}</div>`;
    statsGrid.appendChild(card);
  });

  // Oracle
  setText('oracleText', `"${r.prophecy}"`);

  // Traits
  const traitsBox = document.getElementById('traitsBox');
  traitsBox.innerHTML = `
    <div class="traits-title">Wallet Traits</div>
    <div class="traits-list">
      ${r.traits.map(t => `<span class="trait-badge ${t.cls}">${t.label}</span>`).join('')}
    </div>
  `;

  show('resultSection');
}

function formatErg(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1)    return n.toFixed(2);
  return n.toFixed(4);
}
