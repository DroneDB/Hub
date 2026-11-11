// @ts-check
/** The app notifier for <script setup> components (Options-API components use this.$notify). */
import { notify } from '@/libs/notify';

export function useNotify() {
    return notify;
}
