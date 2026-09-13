<script lang="ts">
  import { t, tl } from '../i18n/index.svelte'
  import type { TagComparison } from '../lib/stats'

  let { rows }: { rows: TagComparison[] } = $props()
  const pct = (v: number) => `${(v / 10) * 100}%`
</script>

<div class="cmp">
  <div class="legend small muted">
    <span><i class="key with"></i>{t('trends.withTag')}</span>
    <span><i class="key without"></i>{t('trends.withoutTag')}</span>
  </div>
  {#each rows as r (r.tag.id)}
    <div class="row">
      <div class="name">{tl(r.tag.label)} <span class="small muted">({r.withN}/{r.withoutN} {t('trends.days')})</span></div>
      <div class="bars">
        <div class="bar with" style="width: {pct(r.withMean)}"></div><span class="val small">{r.withMean.toFixed(1)}</span>
      </div>
      <div class="bars">
        <div class="bar without" style="width: {pct(r.withoutMean)}"></div><span class="val small">{r.withoutMean.toFixed(1)}</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .cmp { display: flex; flex-direction: column; gap: 12px; }
  .legend { display: flex; gap: 14px; }
  .key { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px; border-radius: 2px; }
  .key.with, .bar.with { background: var(--accent); }
  .key.without, .bar.without { background: var(--ink-3); }
  .row { display: flex; flex-direction: column; gap: 3px; }
  .name { font-weight: 600; }
  .bars { display: flex; align-items: center; gap: 8px; }
  .bar { height: 10px; border-radius: 0 4px 4px 0; min-width: 2px; }
  .val { font-variant-numeric: tabular-nums; color: var(--ink-2); }
</style>
