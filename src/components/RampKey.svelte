<!-- The map's colour key (§6.3, §7, #114): the intensity ramp from 0 to 10, each step in its colour with its number, so a colour never stands alone. -->
<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { intensityColor, intensityInk } from '../lib/color'

  const LEVELS = Array.from({ length: 11 }, (_, i) => i)
</script>

<div class="ramp" role="img" aria-label={t('trends.rampKey')}>
  {#each LEVELS as i (i)}<span aria-hidden="true" style="background: {intensityColor(i)}; color: {intensityInk(i)}">{i}</span>{/each}
</div>

<style>
  .ramp { display: flex; gap: 2px; margin: 8px 0 4px; }
  .ramp span { flex: 1; min-width: 0; text-align: center; font-size: 11px; font-weight: 600; line-height: 18px; border-radius: 3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
