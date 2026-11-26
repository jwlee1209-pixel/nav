// ───────────────────────── 음성 안내(브라우저 내장 음성) ─────────────────────────
const Voice = {
  ok: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  voices: [],
  listeners: [],
  unlocked: false,

  init() {
    if (!this.ok) return;
    const load = () => {
      try { this.voices = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)); } catch (e) { this.voices = []; }
      this.listeners.forEach(f => f('voices'));
    };
    load();
    try { speechSynthesis.addEventListener('voiceschanged', load); } catch (e) { speechSynthesis.onvoiceschanged = load; }
  },

  pick() {
    const want = store.settings.voiceName;
    return this.voices.find(v => v.name === want) || this.voices.find(v => /google|yuna|heami|sunhi|injoon/i.test(v.name)) || this.voices[0] || null;
  },

  // 휴대폰 브라우저는 사용자가 누른 순간에 한 번 말해 둬야 이후 안내가 나온다
  unlock() {
    if (!this.ok || this.unlocked) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'ko-KR'; speechSynthesis.speak(u); this.unlocked = true; } catch (e) { /* 무시 */ }
  },

  say(text, { urgent = false, force = false } = {}) {
    this.listeners.forEach(f => f('say', text));
    if (!this.ok || (!store.settings.voice && !force)) return;
    try {
      if (urgent) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      const v = this.pick();
      if (v) u.voice = v;
      u.rate = clamp(+store.settings.voiceRate || 1, 0.7, 1.6);
      u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* 무시 */ }
  },

  stop() { if (this.ok) try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ } },
  on(f) { this.listeners.push(f); },
};
