import type { Me } from './client'

/** Chi è entrato, condiviso fra header e sincronizzazione. Si chiede al server solo nel browser. */
export function useMe() {
  const me = useState<Me | null>('me', () => null)
  async function refresh() {
    me.value = await $fetch<Me>('/api/me').catch(() => ({ enabled: false, user: null }))
  }
  return { me, refresh }
}
