<!-- The map's colour key (§6.3, §7, #114): the intensity ramp from 0 to 10, each step in its colour with its number, so a colour never stands alone, and its ends in words (#112). -->
<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { intensityColor, intensityInk } from '../lib/color'

  const LEVELS = Array.from({ length: 11 }, (_, i) => i)
</script>

<div class="key" role="img" aria-label={t('trends.rampKey', { min: t('scale.min'), max: t('scale.max') })}>
  <div class="ramp">
    {#each LEVELS as i (i)}<span aria-hidden="true" style="background: {intensityColor(i)}; color: {intensityInk(i)}">{i}</span>{/each}
  </div>
  <div class="ends" aria-hidden="true"><span>{t('scale.min')}</span><span>{t('scale.max')}</span></div>
</div>

<style>
  .key { margin: 8px 0 4px; }
  .ramp { display: flex; gap: 2px; }
  /* The ends in words (#112), as under every slider. */
  .ends { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; line-height: 14px; margin-top: 2px; color: var(--ink-2); }
  .ramp span { flex: 1; min-width: 0; text-align: center; font-size: 11px; font-weight: 600; line-height: 18px; border-radius: 3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
