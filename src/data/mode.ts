/** Replaced at build time; artifact builds cannot import the remote transport. */
export const isLive = __DATA_MODE__ === 'supabase'
export const uiStorageKey = isLive ? 'mg-live-ui-v1' : 'mg-proto-v1'
