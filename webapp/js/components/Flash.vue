<template>
    <div class="flash" @mouseup="closeMouseUp">
        <div :class="color" class="ui icon message">
            <i :class="icon" class="icon" v-if="icon"></i>
            <div class="content">
                <div class="header">
                    <slot />
                </div>
            </div>
            <div class="close" @mouseup="closeMouseUp">
                <i class="icon close"></i>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        icon: {
            type: String,
            default: ""
        },
        color: {
            type: String,
            default: "positive"
        }
    },
    data: function () {
        return {};
    },
    mounted: function () {
    },

    methods: {
        closeMouseUp: function (e) {
            e.stopPropagation();
            this.$emit("onClose");
        }
    }
}
</script>

<style scoped>
.flash {
    &:hover {
        cursor: pointer;
    }

    position: absolute;
    z-index: 99999999;
    left: 8px;
    right: 8px;
    bottom: 8px;
    border: 1px solid black;

    .message {
        padding: 8px;
    }

    .icon.close {
        font-size: 1.5em;
    }
}
</style>