<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as ace from 'ace-builds';

  // Тема
  import 'ace-builds/src-noconflict/theme-monokai';

  // Режимы, которые будем использовать
  import 'ace-builds/src-noconflict/mode-text';
  import 'ace-builds/src-noconflict/mode-json';
  import 'ace-builds/src-noconflict/mode-yaml';
  import 'ace-builds/src-noconflict/mode-sh';
  import 'ace-builds/src-noconflict/mode-ini';
  import 'ace-builds/src-noconflict/mode-properties';
  import 'ace-builds/src-noconflict/mode-xml';
  import 'ace-builds/src-noconflict/mode-html';
  import 'ace-builds/src-noconflict/mode-css';
  import 'ace-builds/src-noconflict/mode-javascript';
  import 'ace-builds/src-noconflict/mode-typescript';
  // Подсказки (не обязательно, но полезно)
  import 'ace-builds/src-noconflict/ext-language_tools';  
  import 'ace-builds/src-noconflict/ext-searchbox';  

  export let value: string = '';
  // если явно передать language — используем его, иначе определяем по filePath
  export let language: string | undefined;
  export let filePath: string | undefined;
  export let readOnly: boolean = false;
  export let onChange: (v: string) => void;
  // будет дергаться по Ctrl+S / Cmd+S
  export let onSave: (() => void) | undefined;

  let editorEl: HTMLDivElement;
  let editor: ace.Ace.Editor | null = null;
  let resolvedLanguage = 'ini';

  function detectLanguage(path?: string, explicit?: string): string {
    if (explicit && explicit.trim().length > 0) {
      return explicit;
    }

    if (!path) {
      return 'ini';
    }

    const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = m?.[1];

    switch (ext) {
      case 'json':
        return 'json';

      case 'yml':
      case 'yaml':
        return 'yaml';

      case 'sh':
      case 'bash':
        return 'sh';

      case 'env':
      case 'ini':
      case 'cfg':
      case 'conf':
      case 'properties':
        return 'ini';

      case 'xml':
        return 'xml';

      case 'html':
      case 'htm':
        return 'html';

      case 'css':
      case 'scss':
        return 'css';

      case 'js':
      case 'mjs':
      case 'cjs':
        return 'javascript';

      case 'ts':
      case 'mts':
      case 'cts':
        return 'typescript';

      case 'log':
      case 'txt':
        return 'text';

      default:
        // Fallback — ini, как ты просил
        return 'ini';
    }
  }

  onMount(() => {
    editor = ace.edit(editorEl);

    editor.setTheme('ace/theme/monokai');

    resolvedLanguage = detectLanguage(filePath, language);
    editor.session.setMode(`ace/mode/${resolvedLanguage}`);

    editor.setShowPrintMargin(false);

    editor.setOptions({
      fontSize: '13px',
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      showLineNumbers: true,
      showGutter: true,
      highlightActiveLine: true,
      readOnly,
      wrap: false,
      useSoftTabs: true,
      tabSize: 4,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false,
      enableSnippets: false
    });

    editor.session.setValue(value ?? '');

    editor.session.on('change', () => {
      const val = editor?.getValue() ?? '';
      onChange && onChange(val);
    });

    // Ctrl+S / Cmd+S → onSave, если задан
    editor.commands.addCommand({
      name: 'saveFileCommand',
      bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' },
      exec: () => {
        if (onSave) {
          onSave();
        }
      }
    });

    // Ctrl+F / Cmd+F: поиск в Ace есть по умолчанию (exec 'find'),
    // поэтому отдельно не переопределяем, чтобы не сломать стандартный UI.
  });

  // синхронизация value -> редактор
  $: if (editor && value !== editor.getValue()) {
    const pos = editor.getCursorPosition();
    editor.session.setValue(value ?? '');
    editor.moveCursorToPosition(pos);
    editor.clearSelection();
  }

  // синхронизация readOnly
  $: if (editor) {
    editor.setReadOnly(readOnly);
  }

  // смена языка при изменении filePath или language
  $: if (editor) {
    const newLang = detectLanguage(filePath, language);
    if (newLang !== resolvedLanguage) {
      resolvedLanguage = newLang;
      editor.session.setMode(`ace/mode/${resolvedLanguage}`);
    }
  }

  onDestroy(() => {
    if (editor) {
      editor.destroy();
      editor = null;
    }
  });
</script>

<div
  bind:this={editorEl}
  class="w-full h-full rounded-md overflow-hidden border border-slate-800"
></div>
