import { type FC, useState, useEffect, useCallback, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { closeBrackets } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { readText, writeText } from '../api/vfs';

const LANG_BY_EXT: Record<string, () => Extension> = {
  md: () => markdown(),
  json: () => json(),
  js: () => javascript(),
  ts: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  less: () => css(),
  xml: () => xml(),
  svg: () => xml(),
  sql: () => sql(),
  rs: () => rust(),
  py: () => python(),
};

function getLanguageExtension(fileName: string): Extension {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return [];
  const ext = fileName.slice(dot + 1).toLowerCase();
  const factory = LANG_BY_EXT[ext];
  return factory ? factory() : [];
}

interface TextEditorProps {
  filePath: string;
  fileName: string;
  onDirtyChange: (dirty: boolean) => void;
  onCloseRequest: () => void;
}

const TextEditor: FC<TextEditorProps> = ({ filePath, fileName, onDirtyChange, onCloseRequest }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    onDirtyChange(d);
  }, [onDirtyChange]);

  const doSave = useCallback(async () => {
    if (!viewRef.current) return;
    setSaveStatus('saving');
    try {
      const content = viewRef.current.state.doc.toString();
      await writeText(filePath, content);
      setDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.warn('[TextEditor] save failed:', e);
      setSaveStatus('failed');
    }
  }, [filePath, setDirty]);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const { content: text } = await readText(filePath);
        setLoading(false);

        if (!editorRef.current) return;

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setDirty(true);
          }
        });

        const saveKeymap = keymap.of([{
          key: 'Mod-s',
          run: () => { doSave(); return true; },
          preventDefault: true,
        }]);

        const state = EditorState.create({
          doc: text,
          extensions: [
            lineNumbers(),
            highlightActiveLine(),
            bracketMatching(),
            closeBrackets(),
            history(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            oneDark,
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
            saveKeymap,
            getLanguageExtension(fileName),
            updateListener,
            EditorView.lineWrapping,
          ],
        });

        const view = new EditorView({ state, parent: editorRef.current });
        viewRef.current = view;
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    };
    loadContent();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="text-editor-container">
        <div className="text-editor-statusbar">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-editor-container">
        <div className="text-editor-error">
          <p>加载文件失败</p>
          <p className="text-editor-error-detail">{error}</p>
          <button onClick={onCloseRequest} className="text-editor-error-btn">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-editor-container">
      <div ref={editorRef} className="text-editor-cm" />
      <div className="text-editor-statusbar">
        <span className="text-editor-filepath">{filePath}</span>
        <span className="text-editor-save-status">
          {saveStatus === 'saving' && '保存中...'}
          {saveStatus === 'saved' && '已保存'}
          {saveStatus === 'failed' && '保存失败'}
        </span>
      </div>
    </div>
  );
};

export default TextEditor;
