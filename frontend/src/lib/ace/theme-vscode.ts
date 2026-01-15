// src/lib/ace/theme-vscode.ts
import ace from 'ace-builds';

const theme: any = {
  isDark: true,
  cssClass: 'ace-vscode',
  cssText: `
    .ace-vscode .ace_gutter {
      background: #1e1e1e;
      color: #858585;
    }
    .ace-vscode .ace_print-margin {
      width: 1px;
      background: #555555;
    }
    .ace-vscode {
      background-color: #1e1e1e;
      color: #d4d4d4;
    }
    .ace-vscode .ace_cursor {
      color: #aeafad;
    }
    .ace-vscode .ace_invisible {
      color: #404040;
    }
    .ace-vscode .ace_constant.ace_numeric {
      color: #b5cea8;
    }
    .ace-vscode .ace_constant.ace_language,
    .ace-vscode .ace_keyword {
      color: #569cd6;
    }
    .ace-vscode .ace_support.ace_function {
      color: #dcdcaa;
    }
    .ace-vscode .ace_string {
      color: #ce9178;
    }
    .ace-vscode .ace_variable {
      color: #9cdcfe;
    }
    .ace-vscode .ace_comment {
      color: #6a9955;
      font-style: italic;
    }
    .ace-vscode .ace_identifier {
      color: #d4d4d4;
    }
    .ace-vscode .ace_gutter-active-line {
      background-color: #2a2d2e;
    }
    .ace-vscode .ace_marker-layer .ace_active-line {
      background-color: #2a2d2e;
    }
    .ace-vscode .ace_selection {
      background: #264f78;
    }
    .ace-vscode.ace_multiselect .ace_selection.ace_start {
      box-shadow: 0 0 3px 0px #1e1e1e;
    }
    .ace-vscode .ace_keyword.ace_operator {
      color: #d4d4d4;
    }
    .ace-vscode .ace_fold {
      background-color: #569cd6;
      border-color: #d4d4d4;
    }
  `
};

ace.define('ace/theme/vscode', ['require', 'exports', 'module', 'ace/lib/dom'], function (require, exports) {
  exports.isDark = theme.isDark;
  exports.cssClass = theme.cssClass;
  exports.cssText = theme.cssText;

  const dom = require('ace/lib/dom');
  dom.importCssString(exports.cssText, exports.cssClass);
});

export default theme;
