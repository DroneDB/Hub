<template>
    <div class="text-editor-wrapper">
        <Window :title="windowTitle" id="textEditorDialog" @onClose="close" modal width="80%" height="80%">
            <div class="text-editor-dialog">
                <Message bindTo="error" />

                <div v-if="loading" class="loading-container">
                    <i class="icon circle notch spin" />
                    <span>Loading file...</span>
                </div>

                <div v-else-if="fileTooLarge" class="error-container">
                    <i class="icon exclamation triangle" />
                    <p>File is too large to edit ({{ formattedSize }})</p>
                    <p class="limit-info">Maximum size: {{ formattedMaxSize }}</p>
                    <div class="buttons">
                        <button @click="close" class="ui button">Close</button>
                        <button @click="downloadFile" class="ui button primary">Download Instead</button>
                    </div>
                </div>

                <template v-else>
                    <div class="toolbar">
                        <div class="file-info">
                            <i :class="['icon', fileIcon]" />
                            <span class="filename">{{ fileName }}</span>
                            <span v-if="isModified" class="modified-indicator">*</span>
                        </div>
                        <div class="actions">
                            <button v-if="!readonly && isModified" @click="save" :disabled="saving"
                                class="ui button primary small">
                                <i class="icon save" />
                                {{ saving ? 'Saving...' : 'Save' }}
                            </button>
                            <button @click="close" class="ui button small">
                                <i class="icon close" />
                                Close
                            </button>
                        </div>
                    </div>

                    <div class="editor-container" ref="editorContainer"></div>

                    <div v-if="!readonly && isModified" class="unsaved-warning">
                        <i class="icon info circle" />
                        You have unsaved changes
                    </div>
                </template>
            </div>
        </Window>
        <ConfirmDialog
            v-if="showConfirmClose"
            title="Unsaved Changes"
            message="You have unsaved changes. Are you sure you want to close?"
            confirmText="Close"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="handleConfirmClose"
        />
    </div>
</template>

<script>
import Window from './Window.vue';
import Message from './Message.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import Keyboard from '../libs/keyboard';
import icons from '../libs/icons';
import { getLanguageMode, formatFileSize, MAX_TEXT_FILE_SIZE } from '../libs/textFileUtils';

// CodeMirror imports
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';

export default {
    components: {
        Window,
        Message,
        ConfirmDialog
    },

    props: {
        dataset: {
            type: Object,
            required: true
        },
        entry: {
            type: Object,
            required: true
        },
        readonly: {
            type: Boolean,
            default: false
        }
    },

    data() {
        return {
            loading: true,
            saving: false,
            error: '',
            originalContent: '',
            currentContent: '',
            editor: null,
            fileTooLarge: false,
            showConfirmClose: false
        };
    },

    computed: {
        windowTitle() {
            const mode = this.readonly ? 'View' : 'Edit';
            return `${mode}: ${this.fileName}`;
        },

        fileName() {
            if (!this.entry || !this.entry.path) return '';
            const parts = this.entry.path.split('/');
            return parts[parts.length - 1];
        },

        fileIcon() {
            if (!this.entry) return 'file outline';
            return icons.getForType(this.entry.type);
        },

        isModified() {
            return this.currentContent !== this.originalContent;
        },

        formattedSize() {
            return formatFileSize(this.entry?.size || 0);
        },

        formattedMaxSize() {
            return formatFileSize(MAX_TEXT_FILE_SIZE);
        }
    },

    async mounted() {
        Keyboard.onKeyDown(this.handleKeyDown);
        await this.loadFile();
    },

    beforeDestroy() {
        Keyboard.offKeyDown(this.handleKeyDown);
        if (this.editor) {
            this.editor.destroy();
            this.editor = null;
        }
    },

    methods: {
        async loadFile() {
            this.loading = true;
            this.error = '';

            try {
                // Check file size
                if (this.entry.size && this.entry.size > MAX_TEXT_FILE_SIZE) {
                    this.fileTooLarge = true;
                    this.loading = false;
                    return;
                }

                // Fetch file contents
                const content = await this.dataset.getFileContents(this.entry.path);
                this.originalContent = content;
                this.currentContent = content;

                // Set loading to false first so the editor container is rendered
                this.loading = false;

                // Initialize editor after DOM is updated
                this.$nextTick(() => {
                    this.initEditor();
                });

            } catch (e) {
                this.error = `Failed to load file: ${e.message || e}`;
                this.loading = false;
            }
        },

        initEditor() {
            if (!this.$refs.editorContainer) return;

            const languageMode = getLanguageMode(this.entry.path);
            const extensions = [
                lineNumbers(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                history(),
                bracketMatching(),
                syntaxHighlighting(defaultHighlightStyle),
                keymap.of([...defaultKeymap, ...historyKeymap]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        this.currentContent = update.state.doc.toString();
                    }
                }),
                EditorView.theme({
                    "&": {
                        height: "100%",
                        fontSize: "14px"
                    },
                    ".cm-scroller": {
                        overflow: "auto",
                        fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace"
                    },
                    ".cm-content": {
                        caretColor: "#000"
                    },
                    "&.cm-focused .cm-cursor": {
                        borderLeftColor: "#000"
                    },
                    ".cm-gutters": {
                        backgroundColor: "#f5f5f5",
                        borderRight: "1px solid #ddd"
                    }
                })
            ];

            // Add language-specific extensions
            switch (languageMode) {
                case 'json':
                    extensions.push(json());
                    break;
                case 'markdown':
                    extensions.push(markdown());
                    break;
                case 'xml':
                    extensions.push(xml());
                    break;
            }

            // Make readonly if needed
            if (this.readonly) {
                extensions.push(EditorState.readOnly.of(true));
            }

            this.editor = new EditorView({
                state: EditorState.create({
                    doc: this.originalContent,
                    extensions
                }),
                parent: this.$refs.editorContainer
            });
        },

        async save() {
            if (this.readonly || !this.isModified || this.saving) return;

            this.saving = true;
            this.error = '';

            try {
                await this.dataset.writeObj(this.entry.path, this.currentContent);
                this.originalContent = this.currentContent;
                this.$emit('saved', this.entry.path);
            } catch (e) {
                this.error = `Failed to save file: ${e.message || e}`;
            } finally {
                this.saving = false;
            }
        },

        downloadFile() {
            const url = this.dataset.downloadUrl(this.entry.path);
            window.open(url, '_blank');
            this.close();
        },

        close() {
            if (this.isModified) {
                this.showConfirmClose = true;
                return;
            }
            this.$emit('onClose');
        },

        handleConfirmClose(buttonId) {
            this.showConfirmClose = false;
            if (buttonId === 'confirm') {
                this.$emit('onClose');
            }
        },

        handleKeyDown(e) {
            // Ctrl/Cmd + S to save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.save();
            }

            // Escape to close
            if (e.key === 'Escape') {
                this.close();
            }
        }
    }
};
</script>

<style scoped>
.text-editor-dialog {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 400px;
}

.loading-container,
.error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #666;
}

.loading-container i,
.error-container i {
    font-size: 2em;
    margin-bottom: 10px;
}

.error-container i {
    color: #db2828;
}

.error-container .limit-info {
    font-size: 0.9em;
    color: #999;
}

.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f9f9f9;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
}

.file-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-info .filename {
    font-weight: 500;
}

.modified-indicator {
    color: #f2711c;
    font-weight: bold;
    font-size: 1.2em;
}

.actions {
    display: flex;
    gap: 8px;
}

.editor-container {
    flex: 1;
    overflow: hidden;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin: 8px;
}

.unsaved-warning {
    padding: 8px 12px;
    background: #fff3cd;
    border-top: 1px solid #ffc107;
    color: #856404;
    font-size: 0.9em;
    flex-shrink: 0;
}

.unsaved-warning i {
    margin-right: 6px;
}

.buttons {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}
</style>
