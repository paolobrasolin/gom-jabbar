<!-- The icon of a message (#94, §10): the kind in a shape as well as a colour. The words say it, so it is hidden from screen readers. -->
<script lang="ts">
  import { ICONS } from '../lib/icons'

  let { name }: { name: 'done' | 'needs' | 'failed' } = $props()
</script>

<svg class="icon" data-icon={name} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each ICONS[name] as d, i (i)}<path {d} />{/each}
</svg>
