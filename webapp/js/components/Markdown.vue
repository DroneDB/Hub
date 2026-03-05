<template>
    <div class="markdown">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Markdown" />

        <Message bindTo="error" />
        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div v-else class="md-container">
            <div v-if="editing && editable" class="edit-container">
                <textarea ref="editTextarea" v-model="rawContent"></textarea>
                <Button @click="save" severity="secondary" outlined class="save" icon="fa-solid fa-floppy-disk" />
            </div>
            <template v-else>
                <Button v-if="editable" @click="edit" severity="secondary" outlined class="edit" icon="fa-solid fa-pen-to-square" />
                <div v-html="content" class="content" />
            </template>
        </div>
    </div>
</template>

<script>
import Message from './Message';
import Button from 'primevue/button';
import TabViewLoader from './TabViewLoader';
import ddb from 'ddb';
import MarkdownIt from 'markdown-it';
import { sanitizeHtml } from '../libs/sanitize';

export default {
    components: {
        TabViewLoader, Message, Button
    },
    props: {
        uri: { // DDB uri
            type: String,
            required: false
        },
        editable: {
            type: Boolean,
            required: false,
            default: true
        }
    },
    data: function () {
        return {
            loading: true,
            error: "",
            content: "",
            rawContent: "",
            editing: false,
        }
    },

    methods: {
        handleLoad: async function () {
            // Quick type check
            if (this.entry.type !== ddb.entry.type.MARKDOWN) throw new Error(`${this.entry.path} cannot be opened as markdown`);

            const [dataset, path] = ddb.utils.datasetPathFromUri(this.ddbURI);
            this.dataset = dataset;
            this.path = path;

            try {
                this.rawContent = await dataset.getFileContents(path);
                this.updateMarkdown();
            } catch (e) {
                this.error = `Cannot fetch ${this.ddbURI}: ${e}`;
            }
            this.loading = false;
        },
        updateMarkdown: function () {
            const md = new MarkdownIt();
            this.content = sanitizeHtml(md.render(this.rawContent));
        },

        edit: function () {
            this.editing = true;
            this.$nextTick(() => {
                this.$refs.editTextarea.focus();
                this.$refs.editTextarea.scrollTo(0, 0);
            });
        },

        save: async function () {
            this.loading = true;
            try {
                await this.dataset.writeObj(this.path, this.rawContent);
                this.updateMarkdown();
                this.editing = false;
            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        }

    }
}
</script>

<style>
.markdown {
    .loading {
        margin-top: var(--ddb-spacing-md);
        text-align: center;
    }

    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;

    .md-container {
        height: 100%;

        .edit-container {
            position: relative;
            height: 100%;
            display: flex;
        }

        button.edit {
            float: right;
            margin: var(--ddb-spacing-md);
        }

        button.save {
            position: absolute;
            top: var(--ddb-spacing-md);
            right: var(--ddb-spacing-sm);
        }

        textarea {
            padding: var(--ddb-spacing-md);
            width: 100%;
            flex-grow: 1;
            border: none;
            resize: none;
            font-family: monospace;
            outline: none;
        }
    }

    .content {
        padding: var(--ddb-spacing-md);

        img {
            max-width: 100%;
        }
    }
}
</style>