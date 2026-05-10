import { motion } from 'motion/react';

const RECIPES = [
  {
    label: 'When CI ships',
    title: 'ping me on green deploys',
    body: 'GitHub Actions or your CI of choice POSTs to /notify when main goes live.',
    tint: 'var(--color-signal)',
    glyph: '✦'
  },
  {
    label: 'When money moves',
    title: 'wake me on big charges',
    body: 'Stripe webhooks → priority 9 — banner + sound. Skip the dashboard refresh.',
    tint: 'var(--color-amber)',
    glyph: '$'
  },
  {
    label: 'When the doorbell rings',
    title: 'lock-screen my front door',
    body: 'Home Assistant fires a Live Activity. Watch the clip play out without unlocking.',
    tint: 'var(--color-wire-bright)',
    glyph: '◉'
  },
  {
    label: 'When the bot trades',
    title: 'trail my positions',
    body: 'Live Activity progress = unrealized PnL. Glance at the Dynamic Island to check.',
    tint: 'var(--color-rose)',
    glyph: '⌁'
  }
];

export function Recipe() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0 -z-20 bg-blueprint opacity-30" />

      <div className="mx-auto max-w-[1280px] px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
              Field notes
            </div>
            <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />
            <h3 className="mt-4 max-w-[680px] font-display text-[clamp(36px,5vw,64px)] leading-[0.95] tracking-[-0.01em] text-bone">
              Things people <span className="text-[var(--color-wire-bright)]">actually</span> wire
              up.
            </h3>
          </div>
          <p className="max-w-[360px] text-[14.5px] leading-relaxed text-bone/55">
            Four recipes from real developers. The pattern is the same — it's the verbs that change.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {RECIPES.map((r, i) => (
            <motion.div
              key={r.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/20"
            >
              <div className="flex items-center justify-between">
                <span
                  className="grid h-9 w-9 place-items-center rounded-lg text-[16px] font-semibold"
                  style={{
                    background: `linear-gradient(135deg, ${r.tint}, color-mix(in oklab, ${r.tint} 50%, #0a0f1c))`,
                    color: '#0a0f1c',
                    boxShadow: `0 6px 20px -8px ${r.tint}`
                  }}
                >
                  {r.glyph}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/40">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/55">
                {r.label}
              </div>
              <h4 className="font-display text-[26px] leading-[1.05] tracking-tight text-bone">
                {r.title}
              </h4>
              <p className="text-[13.5px] leading-relaxed text-bone/60">{r.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
