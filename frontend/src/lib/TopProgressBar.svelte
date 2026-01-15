<script lang="ts">
  import { globalLoading } from '$lib/stores/progress';
</script>

{#if $globalLoading}
  <div class="fixed inset-x-0 top-0 z-50 h-[2px]">
    <div class="h-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-progress-bar"></div>
  </div>
{/if}

<style>
  @keyframes progress-bar-move {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  .animate-progress-bar {
    animation: progress-bar-move 1.3s linear infinite;
  }
</style>
