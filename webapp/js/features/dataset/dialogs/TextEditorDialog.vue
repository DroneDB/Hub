<template>
    <div class="text-editor-wrapper">
        <Window :title="windowTitle" id="textEditorDialog" @onClose="close" modal width="80%" height="80%">
            <div class="text-editor-dialog">
                <Message bindTo="error" />

                <div v-if="loading" class="loading-container">
                    <i class="fa-solid fa-circle-notch fa-spin" />
                    <span>Loading file...</span>
                </div>

                <PrimeMessage v-else-if="fileTooLarge" severity="warn" :closable="false" icon="fa-solid fa-triangle-exclamation">
                    <p>File is too large to edit ({{ formattedSize }})</p>
                    <p class="text-muted">Maximum size: {{ formattedMaxSize }}</p>
                    <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                        <Button @click="close" severity="secondary" label="Close" />
                        <Button @click="downloadFile" severity="primary" icon="fa-solid fa-download" label="Download Instead" />
                    </div>
                </PrimeMessage>

                <template v-else>
                    <div class="editor-container" ref="editorContainer"></div>

                    <PrimeMessage v-if="!readonly && isModified" severity="info" :closable="false" icon="fa-solid fa-circle-info">
                        You have unsaved changes
                    </PrimeMessage>

                    <div class="footer-actions">
                        <div class="footer-left">
                            <Button v-if="!readonly && canFormatFile" @click="formatDocument" :disabled="saving"
                                severity="secondary" title="Format document (Shift+Alt+F)"
                                icon="fa-solid fa-code" label="Format" />
                        </div>
                        <div class="footer-right">
                            <Button v-if="!readonly && isModified" @click="save" :disabled="saving"
                                severity="info"
                                icon="fa-solid fa-floppy-disk" :label="saving ? 'Saving...' : 'Save'" />
                            <Button @click="close" severity="secondary" label="Close" />
                        </div>
                    </div>
                </template>
            </div>
        </Window>
        <ConfirmDialog
            v-if="showConfirmClose"
            title="Unsaved Changes"
            message="You have unsaved changes. Are you sure you want to close?"
            confirmText="Discard and Close"
            cancelText="Cancel"
            confirmButtonClass="danger"
            secondaryText="Save and Close"
            secondaryButtonClass="success"
            @onClose="handleConfirmClose"
        />
    </div>
</template>

<script>
import Window from '@/components/Window.vue';
import Message from '@/components/Message.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Keyboard from '@/libs/keyboard';
import { getLanguageMode, MAX_TEXT_FILE_SIZE, canFormat, formatContent } from '@/libs/textFileUtils';
import { bytesToSize } from '@/libs/utils';

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
        ConfirmDialog,
        Button,
        PrimeMessage
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
    emits: ['onClose'],

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

        isModified() {
            return this.currentContent !== this.originalContent;
        },

        formattedSize() {
            return bytesToSize(this.entry?.size || 0);
        },

        formattedMaxSize() {
            return bytesToSize(MAX_TEXT_FILE_SIZE);
        },

        canFormatFile() {
            return canFormat(this.entry?.path);
        }
    },

    async mounted() {
        Keyboard.onKeyDown(this.handleKeyDown);
        await this.loadFile();
    },

    beforeUnmount() {
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
                        fontSize: "1rem"
                    },
                    ".cm-scroller": {
                        overflow: "auto",
                        fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace"
                    },
                    ".cm-content": {
                        caretColor: "var(--ddb-text)"
                    },
                    "&.cm-focused .cm-cursor": {
                        borderLeftColor: "var(--ddb-text)"
                    },
                    ".cm-gutters": {
                        backgroundColor: "var(--ddb-bg-subtle)",
                        borderRight: "var(--ddb-border-width) solid var(--ddb-border)"
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

        async handleConfirmClose(buttonId) {
            this.showConfirmClose = false;
            if (buttonId === 'secondary') {
                // Save and close
                await this.save();
                if (!this.error) {
                    this.$emit('onClose');
                }
            } else if (buttonId === 'confirm') {
                this.$emit('onClose');
            }
        },

        handleKeyDown(e) {
            // Ctrl/Cmd + S to save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.save();
            }

            // Shift + Alt + F to format
            if (e.shiftKey && e.altKey && e.key === 'F') {
                e.preventDefault();
                this.formatDocument();
            }

            // Escape to close
            if (e.key === 'Escape') {
                this.close();
            }
        },

        formatDocument() {
            if (this.readonly || !this.canFormatFile || !this.editor) return;

            const mode = getLanguageMode(this.entry.path);
            const result = formatContent(this.currentContent, mode);

            if (result.success) {
                // Update editor content
                this.editor.dispatch({
                    changes: {
                        from: 0,
                        to: this.editor.state.doc.length,
                        insert: result.content
                    }
                });
                this.currentContent = result.content;
            } else {
                this.error = `Format failed: ${result.error}`;
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
    min-height: 25rem;
}

.loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 12.5rem;
    color: var(--ddb-text-secondary);
}

.loading-container i {
    font-size: 2rem;
    margin-bottom: var(--ddb-spacing-sm);
}

.footer-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-top: var(--ddb-border-width) solid var(--ddb-border);
    flex-shrink: 0;
}

.footer-right {
    display: flex;
    gap: 0.5rem;
}

.editor-container {
    flex: 1;
    overflow: hidden;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    margin: var(--ddb-spacing-sm);
}


</style>
