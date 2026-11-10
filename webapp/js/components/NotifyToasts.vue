<template>
    <!-- The toasts of the pages: top right, below the header (FR-NAV-09) -->
    <Toast position="top-right">
        <template #message="{ message }">
            <NotifyToastContent :message="message" />
        </template>
    </Toast>
    <!-- The toasts raised in a viewer: a corner of its own, off the viewer's controls (FR-XC-09, FR-VWR-24) -->
    <Toast :group="VIEWER_GROUP" :position="VIEWER_TOAST_POSITION">
        <template #message="{ message }">
            <NotifyToastContent :message="message" />
        </template>
    </Toast>
</template>

<script setup>
/**
 * NotifyToasts - the toast hosts of the app, mounted once by App.vue: the default one and the one of the viewer
 * routes (libs/notify, `group`). Both draw their toasts with NotifyToastContent.
 */
import Toast from 'primevue/toast';
import NotifyToastContent from '@/components/NotifyToastContent.vue';
import { VIEWER_GROUP } from '@/libs/notify';

// The viewers keep their controls in the bottom corners and the top right: the top centre is free
const VIEWER_TOAST_POSITION = 'top-center';
</script>
